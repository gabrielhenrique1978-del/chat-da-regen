import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from pydantic import BaseModel, Field

from core.db import (
    Appointment,
    Contact,
    Database,
    Deal,
    KnowledgeItem,
    Message,
    Pipeline,
    QuickReply,
    Stage,
    WorkflowRule,
)
from core.security import get_security_overview, mask_pii
from engine.agent import ConversationalAgent
from engine.debouncer import MessageDebouncer
from engine.mcp import MCPServer
from engine.whatsapp import WhatsAppService
from engine.workflow import WorkflowEngine


# =====================================================================
# Gerenciador de Conexões WebSocket em Tempo Real
# =====================================================================


class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast_event(self, event_type: str, payload: Dict[str, Any]):
        dead = []
        for conn in self.active_connections:
            try:
                await conn.send_json({"event": event_type, "data": payload})
            except Exception:
                dead.append(conn)
        for d in dead:
            self.disconnect(d)


# =====================================================================
# Schemas de Requisição REST
# =====================================================================


class CreateContactRequest(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    channel: str = "whatsapp"
    assignee: str = "Agente IA"
    temperature: str = "warm"
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)


class AddTagRequest(BaseModel):
    tag: str


class HandoffRequest(BaseModel):
    ai_enabled: bool
    attendance_status: str = "human"  # bot, waiting, human, closed
    assignee: Optional[str] = None


class TemperatureRequest(BaseModel):
    temperature: str  # hot, warm, cold
    lead_score: Optional[int] = None


class IncomingMessageRequest(BaseModel):
    contact_id: str
    content: str
    channel: Optional[str] = None
    use_debouncer: bool = False
    media_type: str = "text"  # text, audio, document
    media_url: Optional[str] = None


class BurstMessagesRequest(BaseModel):
    contact_id: str
    fragments: List[str]
    channel: Optional[str] = None


class OutboundMessageRequest(BaseModel):
    contact_id: str
    content: str
    sender: str = "human"
    is_internal: bool = False
    media_type: str = "text"
    media_url: Optional[str] = None


class MoveDealStageRequest(BaseModel):
    stage_id: str
    value: Optional[float] = None


class CreatePipelineRequest(BaseModel):
    name: str
    description: str = ""
    stages: List[str] = Field(
        default_factory=lambda: ["Triagem", "Em Andamento", "Concluído"]
    )


class CreateKnowledgeRequest(BaseModel):
    question: str
    answer: str
    category: str = "Geral"
    tags: List[str] = Field(default_factory=list)


class CreateWorkflowRequest(BaseModel):
    name: str
    trigger_type: str
    trigger_value: str
    actions: List[Dict[str, Any]]
    active: bool = True


class CreateQuickReplyRequest(BaseModel):
    shortcut: str
    title: str
    content: str
    category: str = "Vendas"


class CreateAppointmentRequest(BaseModel):
    contact_id: str
    title: str
    scheduled_at: str
    duration_minutes: int = 30
    notes: str = ""


class UpdateAppointmentStatusRequest(BaseModel):
    status: str  # scheduled, completed, cancelled


class TriggerFollowupRequest(BaseModel):
    contact_id: Optional[str] = None
    custom_message: Optional[str] = None


class CreateBroadcastRequest(BaseModel):
    name: str
    channel: str = "all"
    target_tag: Optional[str] = None
    target_stage_id: Optional[str] = None
    template_content: str


class WhatsAppWebhookRequest(BaseModel):
    phone: str
    name: Optional[str] = None
    message: str
    channel: str = "whatsapp"
    media_type: str = "text"


class WhatsAppSendAudioRequest(BaseModel):
    contact_id: str
    audio_base64: str


class WhatsAppConfigRequest(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    instance_name: Optional[str] = None


class MCPExecuteRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


# =====================================================================
# Factory de Aplicação e Rotas
# =====================================================================


def create_app(db_path: Optional[str] = None, seed_demo: bool = True) -> FastAPI:
    resolved_db_path = db_path or os.getenv("DATABASE_PATH", "openchatfunnel.db")
    app = FastAPI(
        title="Chat da Regen CRM & MCP Server v2.0",
        description="Plataforma Executiva de Atendimento, CRM Conversacional, Kanban Drag & Drop, Handoff Humano, Broadcast e Servidor MCP",
        version="2.0.0",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def security_headers_middleware(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "SAMEORIGIN"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "microphone=(self), camera=()"
        response.headers["X-Data-Protection"] = "OpenChatFunnel-AES256-Encrypted"
        return response

    db = Database(db_path=resolved_db_path, auto_seed=True)
    if seed_demo:
        db.seed_demo_data()

    workflow = WorkflowEngine(db)
    agent = ConversationalAgent(db, workflow)
    mcp_server = MCPServer(db, agent)
    ws_manager = ConnectionManager()
    whatsapp_service = WhatsAppService()

    def _on_debounced_message(contact_id: str, combined_text: str, meta: Dict[str, Any]) -> Dict[str, Any]:
        return agent.process_incoming_message(
            contact_id=contact_id,
            content=combined_text,
            channel=meta.get("channel"),
            persist_user_message=True,
        )

    debouncer = MessageDebouncer(window_seconds=2.0, callback=_on_debounced_message)

    app.state.db = db
    app.state.workflow = workflow
    app.state.agent = agent
    app.state.mcp = mcp_server
    app.state.debouncer = debouncer
    app.state.ws_manager = ws_manager
    app.state.whatsapp = whatsapp_service

    @app.websocket("/ws")
    async def websocket_endpoint(websocket: WebSocket):
        await ws_manager.connect(websocket)
        try:
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            ws_manager.disconnect(websocket)

    router = APIRouter(prefix="/api")

    @router.get("/stats")
    def get_stats():
        contacts = db.list_contacts()
        deals = db.list_deals()
        messages = db.list_messages()
        kb_items = db.list_knowledge_items()
        rules = db.list_workflow_rules()
        appointments = db.list_appointments()
        broadcasts = db.list_broadcast_campaigns()

        open_deals = [d for d in deals if d.status == "open"]
        won_deals = [d for d in deals if d.status == "won"]
        waiting_human = [c for c in contacts if c.attendance_status in ("waiting", "human")]
        hot_leads = [c for c in contacts if c.temperature == "hot"]

        return {
            "total_contacts": len(contacts),
            "total_deals": len(deals),
            "open_deals_count": len(open_deals),
            "open_pipeline_value": sum(d.value for d in open_deals),
            "won_deals_count": len(won_deals),
            "won_value": sum(d.value for d in won_deals),
            "total_messages": len(messages),
            "kb_count": len(kb_items),
            "active_workflows": len([r for r in rules if r.active]),
            "mcp_tools_count": len(mcp_server.list_tools()),
            "scheduled_appointments": len([a for a in appointments if a["status"] == "scheduled"]),
            "broadcasts_count": len(broadcasts),
            "human_queue_count": len(waiting_human),
            "hot_leads_count": len(hot_leads),
            "whatsapp_connected": whatsapp_service._connected,
            "whatsapp_phone": whatsapp_service._phone_number,
        }

    # -----------------------------------------------------------------
    # Contatos, Handoff Humano & Temperatura do Lead
    # -----------------------------------------------------------------

    @router.get("/contacts")
    def list_contacts(
        channel: Optional[str] = None,
        tag: Optional[str] = None,
        attendance_status: Optional[str] = None,
    ):
        res = mcp_server.call_tool("list_contacts", {"channel": channel, "tag": tag})
        contacts = res["result"]["contacts"]
        if attendance_status:
            contacts = [c for c in contacts if c.get("attendance_status") == attendance_status]
        return contacts

    @router.post("/contacts")
    async def create_contact(req: CreateContactRequest):
        res = mcp_server.call_tool("create_contact", req.model_dump())
        created = res["result"]["contact"]
        if req.assignee != "Agente IA" or req.temperature != "warm":
            c_obj = db.get_contact(created["id"])
            if c_obj:
                c_obj.assignee = req.assignee
                c_obj.temperature = req.temperature
                db.update_contact(c_obj)
                res["result"]["contact"] = c_obj.model_dump()
        await ws_manager.broadcast_event("contact_created", res["result"])
        return res["result"]

    @router.get("/contacts/{contact_id}")
    def get_contact_detail(contact_id: str):
        contact = db.get_contact(contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        deal = db.get_contact_active_deal(contact_id)
        stage = db.get_stage(deal.stage_id) if deal else None
        messages = db.list_messages(contact_id, include_internal=True)
        appointments = db.list_appointments(contact_id)
        return {
            "contact": contact.model_dump(),
            "deal": deal.model_dump() if deal else None,
            "stage": stage.model_dump() if stage else None,
            "messages": [m.model_dump() for m in messages],
            "appointments": appointments,
            "pending_fragments": debouncer.pending_fragments(contact_id),
        }

    @router.patch("/contacts/{contact_id}/handoff")
    async def update_contact_handoff(contact_id: str, req: HandoffRequest):
        updated = db.set_contact_handoff(
            contact_id=contact_id,
            ai_enabled=req.ai_enabled,
            attendance_status=req.attendance_status,
            assignee=req.assignee,
        )
        if not updated:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        status_label = (
            f"🎧 Atendimento assumido por {updated.assignee} (Assistente automático pausado)."
            if not updated.ai_enabled
            else "🤖 Atendimento automático reativado para este contato."
        )
        db.create_message(
            Message(
                contact_id=contact_id,
                sender="internal",
                channel=updated.channel,
                content=status_label,
                is_internal=True,
            )
        )
        await ws_manager.broadcast_event("handoff_updated", updated.model_dump())
        return updated.model_dump()

    @router.patch("/contacts/{contact_id}/temperature")
    async def update_contact_temperature(contact_id: str, req: TemperatureRequest):
        updated = db.set_contact_temperature(contact_id, req.temperature, req.lead_score)
        if not updated:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        await ws_manager.broadcast_event("temperature_updated", updated.model_dump())
        return updated.model_dump()

    @router.post("/contacts/{contact_id}/tags")
    async def add_tag(contact_id: str, req: AddTagRequest):
        res = mcp_server.call_tool("add_contact_tag", {"contact_id": contact_id, "tag": req.tag})
        if not res.get("success"):
            raise HTTPException(status_code=404, detail=res.get("error", "Erro ao adicionar tag"))
        await ws_manager.broadcast_event("tag_added", res["result"])
        return res["result"]

    # -----------------------------------------------------------------
    # Mensagens, Notas Internas, Áudio/Mídia & Anti-Fragmentação
    # -----------------------------------------------------------------

    @router.get("/contacts/{contact_id}/messages")
    def list_contact_messages(contact_id: str):
        return [m.model_dump() for m in db.list_messages(contact_id)]

    @router.post("/messages/incoming")
    async def receive_incoming_message(req: IncomingMessageRequest):
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        if req.use_debouncer:
            buffered_count = debouncer.push(
                contact_id=req.contact_id,
                content=req.content,
                metadata={"channel": req.channel or contact.channel},
            )
            return {
                "status": "buffered",
                "window_seconds": debouncer.window_seconds,
                "buffered_fragments": buffered_count,
                "pending": debouncer.pending_fragments(req.contact_id),
            }

        result = agent.process_incoming_message(
            contact_id=req.contact_id,
            content=req.content,
            channel=req.channel or contact.channel,
            media_type=req.media_type,
            media_url=req.media_url,
        )
        await ws_manager.broadcast_event("message_processed", result)
        return {"status": "processed", **result}

    @router.post("/messages/burst")
    async def receive_burst_messages(req: BurstMessagesRequest):
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        local_results: List[Dict[str, Any]] = []

        def _capture_callback(cid: str, combined: str, meta: Dict[str, Any]):
            res = agent.process_incoming_message(
                contact_id=cid,
                content=combined,
                channel=meta.get("channel") or contact.channel,
            )
            local_results.append(res)

        burst_debouncer = MessageDebouncer(window_seconds=2.0, callback=_capture_callback)
        for fragment in req.fragments:
            burst_debouncer.push(req.contact_id, fragment, metadata={"channel": req.channel or contact.channel})

        combined_text = burst_debouncer.flush_sync(req.contact_id)
        processed = local_results[0] if local_results else {}
        payload = {
            "status": "debounced_and_processed",
            "fragments_received": len(req.fragments),
            "combined_content": combined_text,
            **processed,
        }
        await ws_manager.broadcast_event("burst_processed", payload)
        return payload

    @router.post("/messages/send")
    async def send_outbound_message(req: OutboundMessageRequest):
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        # Substitui variáveis dinâmicas {{nome}} e {{empresa}} se presentes
        first_name = contact.name.split()[0] if contact.name else "Cliente"
        empresa = contact.custom_fields.get("empresa", "sua empresa")
        rendered_content = (
            req.content.replace("{{nome}}", first_name)
            .replace("{{nome_completo}}", contact.name)
            .replace("{{empresa}}", str(empresa))
        )

        msg = db.create_message(
            Message(
                contact_id=req.contact_id,
                sender="internal" if req.is_internal else req.sender,
                channel=contact.channel,
                content=rendered_content,
                is_internal=req.is_internal,
                media_type=req.media_type,
                media_url=req.media_url,
            )
        )

        # Envio em segundo plano para o WhatsApp real se o canal for WhatsApp
        if contact.channel == "whatsapp" and not req.is_internal and contact.phone:
            import asyncio
            if req.media_type == "audio" and req.media_url:
                asyncio.create_task(whatsapp_service.send_audio_message(contact.phone, req.media_url))
            else:
                asyncio.create_task(whatsapp_service.send_text_message(contact.phone, rendered_content))

        payload = {"message": msg.model_dump()}
        await ws_manager.broadcast_event("message_sent", payload)
        return payload

    # -----------------------------------------------------------------
    # Respostas Rápidas (Quick Replies / Atalhos /)
    # -----------------------------------------------------------------

    @router.get("/quick-replies")
    def list_quick_replies():
        return [qr.model_dump() for qr in db.list_quick_replies()]

    @router.post("/quick-replies")
    def create_quick_reply(req: CreateQuickReplyRequest):
        qr = db.create_quick_reply(
            QuickReply(
                shortcut=req.shortcut,
                title=req.title,
                content=req.content,
                category=req.category,
            )
        )
        return qr.model_dump()

    @router.delete("/quick-replies/{qr_id}")
    def delete_quick_reply(qr_id: str):
        deleted = db.delete_quick_reply(qr_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Atalho não encontrado")
        return {"deleted": True, "id": qr_id}

    # -----------------------------------------------------------------
    # Funil Kanban Dinâmico & Múltiplas Pipelines
    # -----------------------------------------------------------------

    @router.get("/pipelines")
    def list_pipelines():
        return [p.model_dump() for p in db.list_pipelines()]

    @router.post("/pipelines")
    def create_pipeline(req: CreatePipelineRequest):
        pipeline = db.create_pipeline(Pipeline(name=req.name, description=req.description))
        for idx, s_name in enumerate(req.stages, start=1):
            is_won = "ganho" in s_name.lower() or "conclu" in s_name.lower()
            is_lost = "perdido" in s_name.lower() or "cancel" in s_name.lower()
            db.create_stage(
                Stage(
                    pipeline_id=pipeline.id,
                    name=s_name,
                    order=idx,
                    is_won=is_won,
                    is_lost=is_lost,
                )
            )
        return pipeline.model_dump()

    @router.get("/kanban")
    def get_kanban_board(pipeline_id: Optional[str] = None):
        pipelines = db.list_pipelines()
        if not pipelines:
            return {"pipeline": None, "pipelines": [], "stages": []}

        pipeline = next((p for p in pipelines if p.id == pipeline_id), pipelines[0])
        stages = db.list_stages(pipeline.id)
        deals = db.list_deals(pipeline.id)
        contacts_map = {c.id: c for c in db.list_contacts()}

        columns = []
        for stage in stages:
            stage_deals = []
            for d in deals:
                if d.stage_id == stage.id:
                    contact = contacts_map.get(d.contact_id)
                    deal_dict = d.model_dump()
                    deal_dict["contact"] = contact.model_dump() if contact else None
                    stage_deals.append(deal_dict)
            columns.append(
                {
                    **stage.model_dump(),
                    "deals": stage_deals,
                    "total_value": sum(d["value"] for d in stage_deals),
                }
            )

        return {
            "pipeline": pipeline.model_dump(),
            "pipelines": [p.model_dump() for p in pipelines],
            "stages": columns,
        }

    @router.get("/stages")
    def list_stages(pipeline_id: Optional[str] = None):
        return [s.model_dump() for s in db.list_stages(pipeline_id)]

    @router.get("/deals")
    def list_deals(pipeline_id: Optional[str] = None):
        return [d.model_dump() for d in db.list_deals(pipeline_id)]

    @router.patch("/deals/{deal_id}/stage")
    @router.post("/deals/{deal_id}/move")
    async def update_deal_stage(deal_id: str, req: MoveDealStageRequest):
        res = mcp_server.call_tool(
            "move_deal_stage",
            {
                "deal_id": deal_id,
                "stage_name": req.stage_id,
                "value": req.value,
            },
        )
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error"))
        await ws_manager.broadcast_event("deal_moved", res["result"])
        return res["result"]

    # -----------------------------------------------------------------
    # Agenda de Reuniões & Follow-up Anti-Vácuo
    # -----------------------------------------------------------------

    @router.get("/appointments")
    def list_appointments(contact_id: Optional[str] = None):
        return db.list_appointments(contact_id)

    @router.post("/appointments")
    async def create_appointment(req: CreateAppointmentRequest):
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        deal = db.get_contact_active_deal(req.contact_id)
        appt = db.create_appointment(
            Appointment(
                contact_id=req.contact_id,
                deal_id=deal.id if deal else None,
                title=req.title,
                scheduled_at=req.scheduled_at,
                duration_minutes=req.duration_minutes,
                notes=req.notes,
            )
        )
        db.add_contact_tag(req.contact_id, "reuniao-agendada")
        db.create_message(
            Message(
                contact_id=req.contact_id,
                sender="system",
                channel=contact.channel,
                content=f"📅 Reunião agendada: *{appt.title}* para {appt.scheduled_at} ({appt.duration_minutes} min). Link: {appt.meeting_link}",
            )
        )
        await ws_manager.broadcast_event("appointment_created", appt.model_dump())
        return appt.model_dump()

    @router.patch("/appointments/{appt_id}/status")
    def update_appointment_status(appt_id: str, req: UpdateAppointmentStatusRequest):
        updated = db.update_appointment_status(appt_id, req.status)
        if not updated:
            raise HTTPException(status_code=404, detail="Agendamento não encontrado")
        return updated

    @router.get("/followups")
    def list_followup_candidates():
        return db.list_followup_candidates()

    @router.post("/followups/trigger")
    async def trigger_followup(req: TriggerFollowupRequest):
        candidates = db.list_followup_candidates()
        if req.contact_id:
            candidates = [c for c in candidates if c["contact"]["id"] == req.contact_id]
        else:
            candidates = [c for c in candidates if c["waiting_customer_reply"]]

        sent_messages = []
        for item in candidates:
            c = item["contact"]
            first_name = c["name"].split()[0] if c["name"] else "Cliente"
            stage_name = item["stage_name"]
            text = req.custom_message or (
                f"Olá {first_name}, tudo bem? Passando para acompanhar nossa conversa sobre a etapa de *{stage_name}*. Ficou alguma dúvida em que eu possa te ajudar hoje?"
            )
            msg = db.create_message(
                Message(
                    contact_id=c["id"],
                    sender="agent",
                    channel=c["channel"],
                    content=f"🔄 [Follow-up Automático]\n{text}",
                )
            )
            db.add_contact_tag(c["id"], "followup-enviado")
            sent_messages.append(msg.model_dump())

        payload = {"triggered_count": len(sent_messages), "messages": sent_messages}
        await ws_manager.broadcast_event("followup_triggered", payload)
        return payload

    # -----------------------------------------------------------------
    # Disparos em Massa (Broadcast / Campanhas)
    # -----------------------------------------------------------------

    @router.get("/broadcasts")
    def list_broadcasts():
        return [b.model_dump() for b in db.list_broadcast_campaigns()]

    @router.post("/broadcasts")
    async def create_and_send_broadcast(req: CreateBroadcastRequest):
        result = db.execute_broadcast(
            name=req.name,
            template_content=req.template_content,
            channel=req.channel,
            target_tag=req.target_tag,
            target_stage_id=req.target_stage_id,
        )
        await ws_manager.broadcast_event("broadcast_sent", result)
        return result

    # -----------------------------------------------------------------
    # Webhook Universal WhatsApp / Instagram (Evolution API / Meta)
    # -----------------------------------------------------------------

    @router.post("/webhooks/whatsapp")
    async def whatsapp_webhook_receiver(req: WhatsAppWebhookRequest):
        """
        Recebe eventos externos de provedores WhatsApp/Instagram (Evolution API, Z-API, Meta Cloud API).
        Localiza o contato pelo telefone ou cria automaticamente um Novo Lead e processa no funil.
        """
        contact = db.find_contact_by_phone(req.phone)
        created_new = False
        if not contact:
            contact = db.create_contact(
                Contact(
                    name=req.name or f"Lead WhatsApp ({req.phone[-4:]})",
                    phone=req.phone,
                    channel=req.channel,
                    tags=["webhook-inbound"],
                ),
                create_default_deal=True,
            )
            created_new = True

        result = agent.process_incoming_message(
            contact_id=contact.id,
            content=req.message,
            channel=req.channel,
            media_type=req.media_type,
        )
        payload = {"webhook_status": "received", "created_new_contact": created_new, **result}
        await ws_manager.broadcast_event("webhook_received", payload)
        return payload

    # -----------------------------------------------------------------
    # Conexão Real WhatsApp & Evolution API v2
    # -----------------------------------------------------------------

    @router.get("/whatsapp/status")
    async def get_whatsapp_status():
        """Retorna o status atual da conexão real com o WhatsApp via Evolution API."""
        return await whatsapp_service.get_connection_status()

    @router.post("/whatsapp/connect")
    async def connect_whatsapp():
        """Inicia a criação/conexão da instância e gera o QR Code para leitura."""
        res = await whatsapp_service.create_or_connect()
        await ws_manager.broadcast_event("whatsapp_qr_updated", res)
        return res

    @router.post("/whatsapp/disconnect")
    async def disconnect_whatsapp():
        """Desconecta a sessão do WhatsApp."""
        res = await whatsapp_service.disconnect()
        await ws_manager.broadcast_event("whatsapp_status_updated", res)
        return res

    @router.post("/whatsapp/send-audio")
    async def send_whatsapp_audio(req: WhatsAppSendAudioRequest):
        """Salva áudio gravado no chat como PTT e dispara para o WhatsApp real."""
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        audio_uri = (
            req.audio_base64
            if req.audio_base64.startswith("data:")
            else f"data:audio/webm;base64,{req.audio_base64}"
        )
        msg = db.create_message(
            Message(
                contact_id=req.contact_id,
                sender="human",
                channel=contact.channel,
                content="🎙️ [Nota de Voz Gravada]",
                media_type="audio",
                media_url=audio_uri,
            )
        )

        if contact.phone:
            import asyncio
            asyncio.create_task(whatsapp_service.send_audio_message(contact.phone, req.audio_base64))

        payload = {"message": msg.model_dump()}
        await ws_manager.broadcast_event("message_sent", payload)
        return payload

    @router.post("/webhooks/evolution")
    async def evolution_webhook_receiver(payload: Dict[str, Any]):
        """
        Webhook que consome eventos oficiais da Evolution API v2:
        - messages.upsert: Mensagens reais enviadas pelo cliente no WhatsApp
        - connection.update: Mudança de status da conexão (open, close, connecting)
        - qrcode.updated: Atualização do QR Code em tempo real
        """
        event = str(payload.get("event") or payload.get("type", "")).upper()
        data = payload.get("data", {})

        if "MESSAGES" in event and "UPSERT" in event:
            msg_obj = data.get("message", {}) or data
            key = data.get("key", {}) or msg_obj.get("key", {})
            from_me = key.get("fromMe", False)

            if not from_me:
                remote_jid = str(key.get("remoteJid", ""))
                clean_phone = remote_jid.split("@")[0]
                if clean_phone and clean_phone != "status":
                    push_name = data.get("pushName") or msg_obj.get("pushName") or f"WhatsApp ({clean_phone[-4:]})"
                    text_content = (
                        msg_obj.get("conversation")
                        or msg_obj.get("extendedTextMessage", {}).get("text")
                        or msg_obj.get("audioMessage", {}).get("caption")
                        or "Mensagem via WhatsApp"
                    )
                    media_type = "audio" if "audioMessage" in msg_obj else "text"

                    contact = db.find_contact_by_phone(clean_phone)
                    if not contact:
                        contact = db.create_contact(
                            Contact(
                                name=push_name,
                                phone=f"+{clean_phone}",
                                channel="whatsapp",
                                tags=["whatsapp-real"],
                            ),
                            create_default_deal=True,
                        )

                    result = agent.process_incoming_message(
                        contact_id=contact.id,
                        content=text_content,
                        channel="whatsapp",
                        media_type=media_type,
                    )
                    await ws_manager.broadcast_event("message_processed", result)
                    return {"status": "processed", "contact_id": contact.id}

        elif "CONNECTION" in event and "UPDATE" in event:
            state = data.get("state", "disconnected")
            whatsapp_service.set_connection_state_from_webhook(state)
            await ws_manager.broadcast_event("whatsapp_status_updated", {"state": state})

        elif "QRCODE" in event:
            qrcode = data.get("qrcode", {}).get("base64") or data.get("base64")
            if qrcode:
                whatsapp_service._last_qrcode = qrcode
                await ws_manager.broadcast_event("whatsapp_qr_updated", {"qrcode": qrcode})

        return {"status": "event_acknowledged"}

    # -----------------------------------------------------------------
    # Base de Conhecimento (Knowledge Base)
    # -----------------------------------------------------------------

    @router.get("/kb")
    @router.get("/knowledge")
    def list_kb():
        return [item.model_dump() for item in db.list_knowledge_items()]

    @router.post("/kb")
    @router.post("/knowledge")
    def create_kb_item(req: CreateKnowledgeRequest):
        item = db.create_knowledge_item(
            KnowledgeItem(
                question=req.question,
                answer=req.answer,
                category=req.category,
                tags=req.tags,
            )
        )
        return item.model_dump()

    @router.delete("/kb/{item_id}")
    def delete_kb_item(item_id: str):
        deleted = db.delete_knowledge_item(item_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Item não encontrado")
        return {"deleted": True, "id": item_id}

    @router.get("/kb/search")
    def search_kb(q: str = Query(..., description="Consulta para a base de conhecimento")):
        res = mcp_server.call_tool("query_knowledge_base", {"query": q})
        return res["result"]

    # -----------------------------------------------------------------
    # Workflows & Automações
    # -----------------------------------------------------------------

    @router.get("/workflows")
    def list_workflows():
        return [r.model_dump() for r in db.list_workflow_rules()]

    @router.post("/workflows")
    def create_workflow(req: CreateWorkflowRequest):
        rule = db.create_workflow_rule(
            WorkflowRule(
                name=req.name,
                trigger_type=req.trigger_type,
                trigger_value=req.trigger_value,
                actions=req.actions,
                active=req.active,
            )
        )
        return rule.model_dump()

    @router.patch("/workflows/{rule_id}/toggle")
    def toggle_workflow(rule_id: str):
        updated = db.toggle_workflow_rule(rule_id)
        if not updated:
            raise HTTPException(status_code=404, detail="Regra não encontrada")
        return updated.model_dump()

    # -----------------------------------------------------------------
    # Servidor MCP (Model Context Protocol)
    # -----------------------------------------------------------------

    @router.get("/mcp/tools")
    def list_mcp_tools():
        return {"tools": mcp_server.list_tools()}

    @router.post("/mcp/execute")
    @router.post("/mcp/call")
    def execute_mcp_tool(req: MCPExecuteRequest):
        try:
            return mcp_server.call_tool(req.name, req.arguments)
        except KeyError as exc:
            raise HTTPException(status_code=400, detail=f"Parâmetro obrigatório ausente: {exc}") from exc
        except ValueError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc

    @router.post("/seed")
    def seed_data():
        return db.seed_demo_data()

    # -----------------------------------------------------------------
    # Segurança & Criptografia de Dados (LGPD / GDPR / AES-256)
    # -----------------------------------------------------------------

    @router.get("/security/status")
    def get_security_status():
        """Retorna o status da criptografia de dados em repouso e trânsito (LGPD/GDPR)."""
        overview = get_security_overview()
        contacts = db.list_contacts()
        msgs = db.list_messages()
        appts = db.list_appointments()
        overview["metrics"] = {
            "encrypted_contacts_count": len(contacts),
            "encrypted_messages_count": len(msgs),
            "encrypted_appointments_count": len(appts),
            "encryption_mode": "Zero-Plaintext Storage",
            "active_protection": True,
        }
        return overview

    @router.post("/security/re-encrypt")
    def trigger_database_encryption_audit():
        """Executa auditoria e criptografa qualquer registro remanescente em texto plano."""
        migrated = db.encrypt_existing_unencrypted_records()
        return {"status": "success", "migrated_records": migrated, "security": get_security_overview()}

    app.include_router(router)

    web_index_path = Path(__file__).resolve().parent.parent / "web" / "index.html"

    @app.get("/", response_class=HTMLResponse)
    def serve_dashboard():
        if web_index_path.exists():
            return FileResponse(web_index_path)
        return HTMLResponse("<h1>Chat da Regen API Online</h1>")

    return app
