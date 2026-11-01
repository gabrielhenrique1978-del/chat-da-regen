import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger("regenflow.api")

from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from core.db import (
    Appointment,
    Contact,
    Database,
    Deal,
    KnowledgeItem,
    Message,
    MetaConfig,
    Pipeline,
    QuickReply,
    Seller,
    Stage,
    Tenant,
    User,
    WorkflowRule,
)
from core.meta_cloud_service import OFFICIAL_META_TEMPLATES, MetaCloudService
from core.security import (
    create_access_token,
    decode_access_token,
    get_security_overview,
    hash_password,
    mask_pii,
    verify_password,
)
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


class AssignContactRequest(BaseModel):
    assignee: str
    seller_id: Optional[str] = None
    ai_enabled: bool = False
    attendance_status: str = "human"
    operator_name: Optional[str] = None
    transfer_reason: Optional[str] = None


class CreateSellerRequest(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = "1234"
    role: Optional[str] = "seller"  # "seller" ou "supervisor"


class UpdateSellerRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    pin: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class AuthenticateSellerRequest(BaseModel):
    seller_id: str
    pin: str


class ImpersonateSellerRequest(BaseModel):
    target_seller_id: Optional[str] = None  # None para voltar à Visão Global de Supervisor
    supervisor_name: str = "Supervisor"


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
    sender_name: Optional[str] = None
    is_internal: bool = False
    is_supervisor_override: bool = False
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
    sender_name: Optional[str] = None


class WhatsAppConfigRequest(BaseModel):
    base_url: Optional[str] = None
    api_key: Optional[str] = None
    instance_name: Optional[str] = None


class MCPExecuteRequest(BaseModel):
    name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)


class SaveMetaConfigRequest(BaseModel):
    tenant_id: Optional[str] = "master"
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None
    ig_account_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: Optional[str] = "regenflow_meta_verify_2026"
    app_secret: Optional[str] = None
    enabled: bool = True


class SendMetaTemplateRequest(BaseModel):
    contact_id: str
    template_name: str
    language_code: str = "pt_BR"
    sender_name: Optional[str] = None


class ReplyInstagramCommentRequest(BaseModel):
    contact_id: str
    comment_id: Optional[str] = None
    public_reply: Optional[str] = None
    private_dm: Optional[str] = None
    sender_name: Optional[str] = None
    is_supervisor_override: bool = False


class QuickSwitchProfileRequest(BaseModel):
    target_role: str = "super_admin"  # "super_admin" ou "tenant"
    tenant_id: Optional[str] = None
    email: Optional[str] = None


# =====================================================================
# Schemas e Dependências de Autenticação & Controle de Acesso
# =====================================================================

SUSPENSION_MESSAGE = (
    "Acesso temporariamente suspenso por pendência administrativa ou financeira. "
    "Entre em contato com o suporte."
)

class CreateTenantRequest(BaseModel):
    name: str
    admin_name: str
    admin_email: str


TENANT_SUSPENSION_MESSAGE = (
    "Acesso da empresa suspenso por pendência administrativa ou financeira. Entre em contato com o suporte."
)
SUSPENSION_MESSAGE = (
    "Acesso temporariamente suspenso por pendência administrativa ou financeira. Entre em contato com o suporte."
)

oauth2_scheme = HTTPBearer(auto_error=False)


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminCreateClientRequest(BaseModel):
    name: str
    email: str
    company: Optional[str] = None


class AdminClientEmailRequest(BaseModel):
    email: str


def get_current_user(
    request: Request,
    creds: Optional[HTTPAuthorizationCredentials] = Depends(oauth2_scheme),
) -> User:
    """Extrai e valida o token JWT, buscando o usuário correspondente no banco de dados."""
    if not creds or not creds.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Autenticação necessária: token Bearer ausente ou inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = decode_access_token(creds.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    db: Database = request.app.state.db
    user = db.get_user(payload["sub"])
    if not user:
        user = db.get_user_by_email(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário associado ao token não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def get_current_active_user(
    request: Request,
    user: User = Depends(get_current_user),
) -> User:
    """
    Verifica em tempo real se o usuário e sua empresa cliente (Tenant) estão ativos.
    - Se user.role == "super_admin": acesso irrestrito ao painel master e rotas.
    - Para os demais usuários:
      * Se user.is_active for False ou user.status == "suspended": HTTP 403 Forbidden
      * Se tenant.is_active for False ou tenant.status == "suspended":
        HTTP 403 Forbidden com a mensagem:
        "Acesso da empresa suspenso por pendência administrativa ou financeira. Entre em contato com o suporte."
    """
    if user.role == "super_admin":
        return user

    if not user.is_active or user.status == "suspended":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=SUSPENSION_MESSAGE,
        )

    if user.tenant_id:
        db: Database = request.app.state.db
        tenant = db.get_tenant(user.tenant_id)
        if tenant and (not tenant.is_active or tenant.status == "suspended"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=TENANT_SUSPENSION_MESSAGE,
            )

    return user


def require_super_admin(user: User = Depends(get_current_active_user)) -> User:
    """Garante que a rota só pode ser acessada pelo Super Admin Master."""
    if user.role != "super_admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito ao Administrador Master (Super Admin).",
        )
    return user


# =====================================================================
# Factory de Aplicação e Rotas
# =====================================================================


def create_app(db_path: Optional[str] = None, seed_demo: bool = True) -> FastAPI:
    from dotenv import load_dotenv
    load_dotenv()
    resolved_db_path = db_path or os.getenv("DATABASE_URL") or os.getenv("DATABASE_PATH", "regenflow.db")
    app = FastAPI(
        title="REGEN FLOW — Omnichannel, CRM & MCP Server v2.0",
        description="Plataforma Executiva de Atendimento, CRM Conversacional, Kanban Drag & Drop, Handoff Humano, Broadcast e Servidor MCP",
        version="2.0.0",
    )

    allowed_origins_env = os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000,*",
    )
    allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
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
        response.headers["X-Data-Protection"] = "RegenFlow-AES256-Encrypted"
        return response

    db = Database(db_path=resolved_db_path, auto_seed=True)
    if seed_demo:
        db.seed_demo_data()

    @app.middleware("http")
    async def enforce_active_client_middleware(request: Request, call_next):
        """
        Interrompe imediatamente requisições de clientes suspensos ou inativos,
        mesmo se já possuírem um token JWT válido ativo ou com o navegador aberto.
        """
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            token = auth_header[7:].strip()
            if token:
                payload = decode_access_token(token)
                if payload and "sub" in payload:
                    user = db.get_user(payload["sub"]) or db.get_user_by_email(payload["sub"])
                    if user and (not user.is_active or user.status == "suspended"):
                        return JSONResponse(
                            status_code=status.HTTP_403_FORBIDDEN,
                            content={"detail": SUSPENSION_MESSAGE},
                        )
        return await call_next(request)

    workflow = WorkflowEngine(db)
    agent = ConversationalAgent(db, workflow)
    mcp_server = MCPServer(db, agent)
    ws_manager = ConnectionManager()
    whatsapp_service = WhatsAppService()
    meta_service = MetaCloudService()

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

    # -----------------------------------------------------------------
    # Autenticação, Troca de Senha e Status de Acesso do Cliente
    # -----------------------------------------------------------------

    @router.post("/auth/login")
    def login(req: LoginRequest):
        """Autentica cliente via email e senha, retornando token JWT e dados do usuário."""
        email_clean = req.email.strip().lower()
        user = db.get_user_by_email(email_clean)
        if not user or not verify_password(req.password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Credenciais inválidas: e-mail ou senha incorretos",
            )
        if user.role != "super_admin":
            if not user.is_active or user.status == "suspended":
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=SUSPENSION_MESSAGE,
                )
            if user.tenant_id:
                tenant = db.get_tenant(user.tenant_id)
                if tenant and (not tenant.is_active or tenant.status == "suspended"):
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=TENANT_SUSPENSION_MESSAGE,
                    )

        tenant_obj = db.get_tenant(user.tenant_id) if user.tenant_id else None
        tenant_name = tenant_obj.name if tenant_obj else ("Painel Master (Super Admin)" if user.role == "super_admin" else (user.company_name or "Workspace"))

        token = create_access_token(
            {
                "sub": user.id,
                "email": user.email,
                "client_name": user.client_name,
                "role": user.role,
                "tenant_id": user.tenant_id,
            }
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": user.id,
                "tenant_id": user.tenant_id,
                "tenant_name": tenant_name,
                "email": user.email,
                "client_name": user.client_name,
                "company_name": user.company_name,
                "role": user.role,
                "is_super_admin": user.role == "super_admin",
                "is_active": user.is_active,
                "status": user.status,
                "must_change_password": user.must_change_password,
            },
        }

    @router.get("/auth/me")
    def get_me(user: User = Depends(get_current_active_user)):
        """Retorna os dados do usuário autenticado, identificando se é Super Admin Master ou Tenant."""
        tenant_obj = db.get_tenant(user.tenant_id) if user.tenant_id else None
        tenant_name = tenant_obj.name if tenant_obj else ("Painel Master (Super Admin)" if user.role == "super_admin" else (user.company_name or "Workspace"))
        return {
            "id": user.id,
            "tenant_id": user.tenant_id,
            "tenant_name": tenant_name,
            "email": user.email,
            "client_name": user.client_name,
            "company_name": user.company_name,
            "role": user.role,
            "is_super_admin": user.role == "super_admin",
            "is_active": user.is_active,
            "status": user.status,
            "must_change_password": user.must_change_password,
            "created_at": user.created_at,
            "updated_at": user.updated_at,
        }

    @router.post("/auth/quick-switch")
    def quick_switch_profile(req: QuickSwitchProfileRequest):
        """
        Permite alternar instantaneamente na interface entre o perfil Super Admin Master
        e uma Empresa Cliente (Tenant) para demonstrar e testar o controle de acesso e bloqueio 403.
        """
        if req.target_role == "super_admin":
            sa = db.get_super_admin()
            if not sa:
                sa = db.create_user(
                    User(
                        email="superadmin@master.com",
                        password_hash=hash_password("Master@2026"),
                        client_name="Proprietário Master (Super Admin)",
                        company_name="Regen Flow SaaS Master",
                        role="super_admin",
                        tenant_id=None,
                        is_active=True,
                        status="active",
                        must_change_password=False,
                    )
                )
            token = create_access_token(
                {
                    "sub": sa.id,
                    "email": sa.email,
                    "client_name": sa.client_name,
                    "role": "super_admin",
                    "tenant_id": None,
                }
            )
            return {
                "access_token": token,
                "token_type": "bearer",
                "user": {
                    "id": sa.id,
                    "tenant_id": None,
                    "tenant_name": "Painel Master (Super Admin)",
                    "email": sa.email,
                    "client_name": sa.client_name,
                    "company_name": sa.company_name,
                    "role": "super_admin",
                    "is_super_admin": True,
                    "is_active": True,
                    "status": "active",
                },
            }

        # Caso contrário, seleciona ou cria uma Empresa Cliente (Tenant) de teste
        tenants = db.list_tenants()
        target_tenant = None
        if req.tenant_id:
            target_tenant = db.get_tenant(req.tenant_id)
        if not target_tenant and tenants:
            target_tenant = tenants[0]
        if not target_tenant:
            target_tenant = db.create_tenant(
                Tenant(name="Loja Exemplo (Cliente SaaS)", status="active", is_active=True)
            )

        tenant_users = db.list_users_by_tenant(target_tenant.id)
        t_user = tenant_users[0] if tenant_users else None
        if not t_user:
            demo_email = f"admin.{target_tenant.id[:6]}@cliente.com"
            t_user = db.create_user(
                User(
                    tenant_id=target_tenant.id,
                    email=demo_email,
                    password_hash=hash_password("Cliente@2026"),
                    client_name=f"Gestor - {target_tenant.name}",
                    company_name=target_tenant.name,
                    role="admin",
                    is_active=True,
                    status="active",
                    must_change_password=False,
                )
            )

        if not target_tenant.is_active or target_tenant.status == "suspended":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=TENANT_SUSPENSION_MESSAGE,
            )

        token = create_access_token(
            {
                "sub": t_user.id,
                "email": t_user.email,
                "client_name": t_user.client_name,
                "role": t_user.role,
                "tenant_id": target_tenant.id,
            }
        )
        return {
            "access_token": token,
            "token_type": "bearer",
            "user": {
                "id": t_user.id,
                "tenant_id": target_tenant.id,
                "tenant_name": target_tenant.name,
                "email": t_user.email,
                "client_name": t_user.client_name,
                "company_name": target_tenant.name,
                "role": t_user.role,
                "is_super_admin": False,
                "is_active": t_user.is_active,
                "status": t_user.status,
            },
        }

    @router.post("/auth/change-password")
    def change_password(
        req: ChangePasswordRequest,
        user: User = Depends(get_current_active_user),
    ):
        """Permite que o cliente altere sua senha no primeiro acesso ou a qualquer momento."""
        if not verify_password(req.current_password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Senha atual informada está incorreta",
            )
        new_hash = hash_password(req.new_password)
        updated = db.update_user_password(user.email, new_hash)
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Não foi possível atualizar a senha no banco de dados",
            )
        return {
            "status": "success",
            "message": "Senha atualizada com sucesso. must_change_password redefinido para False.",
        }

    # =================================================================
    # ROTAS DE GESTÃO DO SUPER ADMIN (PAINEL MASTER B2B MULTI-TENANT)
    # =================================================================

    @router.get("/admin/tenants")
    def list_all_tenants(
        current_admin: User = Depends(require_super_admin),
    ):
        """
        Lista todas as empresas clientes (Tenants), status de adimplência e contagem de usuários.
        Acessível exclusivamente pelo Super Admin Master.
        """
        tenants = db.list_tenants()
        result = []
        for t in tenants:
            users_count = db.count_tenant_users(t.id)
            tenant_users = db.list_users_by_tenant(t.id)
            admin_user = next((u for u in tenant_users if u.role == "admin"), None)
            result.append(
                {
                    "id": t.id,
                    "name": t.name,
                    "status": t.status,
                    "is_active": t.is_active,
                    "created_at": t.created_at,
                    "updated_at": t.updated_at,
                    "users_count": users_count,
                    "admin_email": admin_user.email if admin_user else None,
                    "admin_name": admin_user.client_name if admin_user else None,
                }
            )
        return {"tenants": result}

    @router.post("/admin/tenants")
    def create_tenant_and_admin(
        req: CreateTenantRequest,
        current_admin: User = Depends(require_super_admin),
    ):
        """
        Cadastra uma nova empresa cliente (Tenant) e provisiona o primeiro usuário Administrador dela
        com senha provisória aleatória e mensagem formatada pronta para envio no WhatsApp.
        """
        tenant_name = req.name.strip()
        admin_email = req.admin_email.strip().lower()
        admin_name = req.admin_name.strip()

        if not tenant_name:
            raise HTTPException(status_code=400, detail="Nome da empresa cliente é obrigatório")
        if not admin_email or "@" not in admin_email:
            raise HTTPException(status_code=400, detail="E-mail de login inválido")

        existing_user = db.get_user_by_email(admin_email)
        if existing_user:
            raise HTTPException(
                status_code=400,
                detail=f"Já existe um usuário cadastrado com o e-mail '{admin_email}'",
            )

        from core.security import generate_secure_password, hash_password
        temp_pwd = generate_secure_password(12)
        pwd_hash = hash_password(temp_pwd)

        # 1. Cria a Empresa Cliente (Tenant)
        tenant = Tenant(
            name=tenant_name,
            status="active",
            is_active=True,
        )
        created_tenant = db.create_tenant(tenant)

        # 2. Cria o Usuário Administrador da Empresa
        admin_user = User(
            tenant_id=created_tenant.id,
            email=admin_email,
            password_hash=pwd_hash,
            client_name=admin_name or tenant_name,
            company_name=tenant_name,
            role="admin",
            is_active=True,
            status="active",
            must_change_password=True,
        )
        created_admin = db.create_user(admin_user)

        whatsapp_text = (
            "-------------------------------------------\n"
            "Empresa Cliente cadastrada com sucesso!\n"
            f"Empresa: {tenant_name}\n"
            f"Responsável: {admin_name}\n"
            f"Login: {admin_email}\n"
            f"Senha Provisória: {temp_pwd}\n"
            "Status: Ativo\n"
            "-------------------------------------------"
        )

        return {
            "tenant": {
                "id": created_tenant.id,
                "name": created_tenant.name,
                "status": created_tenant.status,
                "is_active": created_tenant.is_active,
                "created_at": created_tenant.created_at,
            },
            "admin_user": {
                "id": created_admin.id,
                "email": created_admin.email,
                "name": created_admin.client_name,
                "role": created_admin.role,
            },
            "temporary_password": temp_pwd,
            "whatsapp_message": whatsapp_text,
        }

    @router.patch("/admin/tenants/{tenant_id}/toggle-status")
    def toggle_tenant_status(
        tenant_id: str,
        current_admin: User = Depends(require_super_admin),
    ):
        """
        Alterna imediatamente o status da empresa cliente entre Ativo e Suspenso (TRAVA MESTRA DE INADIMPLÊNCIA).
        Se a empresa for suspensa, QUALQUER usuário dela tem o acesso bloqueado imediatamente (HTTP 403 Forbidden).
        """
        tenant = db.get_tenant(tenant_id)
        if not tenant:
            raise HTTPException(status_code=404, detail="Empresa cliente (Tenant) não encontrada")

        new_is_active = not tenant.is_active
        new_status = "active" if new_is_active else "suspended"
        updated = db.update_tenant_status(tenant_id, is_active=new_is_active, status=new_status)

        action_label = "liberada com sucesso" if new_is_active else "bloqueada imediatamente por inadimplência"
        return {
            "tenant": {
                "id": updated.id,
                "name": updated.name,
                "status": updated.status,
                "is_active": updated.is_active,
                "updated_at": updated.updated_at,
            },
            "message": f"Empresa '{updated.name}' {action_label}.",
        }

    # -----------------------------------------------------------------
    # Painel Administrativo de Clientes & Inadimplência (B2B)
    # -----------------------------------------------------------------

    @router.get("/admin/clients")
    def list_clients():
        """Retorna todos os clientes cadastrados com status de liberação de acesso."""
        users = db.list_users()
        return {
            "clients": [
                {
                    "id": u.id,
                    "email": u.email,
                    "client_name": u.client_name,
                    "company_name": u.company_name or u.client_name,
                    "is_active": u.is_active,
                    "status": u.status,
                    "must_change_password": u.must_change_password,
                    "created_at": u.created_at,
                    "updated_at": u.updated_at,
                }
                for u in users
            ]
        }

    @router.post("/admin/clients")
    def create_client(req: AdminCreateClientRequest):
        """Cria cliente manualmente, gera senha temporária e formata mensagem para WhatsApp."""
        email_clean = req.email.strip().lower()
        if not email_clean or "@" not in email_clean:
            raise HTTPException(status_code=400, detail="E-mail inválido")
        existing = db.get_user_by_email(email_clean)
        if existing:
            raise HTTPException(status_code=400, detail=f"Já existe um cliente cadastrado com o e-mail '{email_clean}'")

        from core.security import generate_secure_password, hash_password
        temp_pwd = generate_secure_password(12)
        pwd_hash = hash_password(temp_pwd)
        company = (req.company or req.name).strip()

        # Garante vínculo com Tenant
        tenant = db.get_tenant_by_name(company)
        if not tenant:
            tenant = db.create_tenant(Tenant(name=company, is_active=True, status="active"))

        user = User(
            tenant_id=tenant.id,
            email=email_clean,
            password_hash=pwd_hash,
            client_name=req.name.strip(),
            company_name=company,
            role="admin",
            is_active=True,
            status="active",
            must_change_password=True,
        )
        created = db.create_user(user)

        whatsapp_text = (
            "-------------------------------------------\n"
            "Cliente criado com sucesso!\n"
            f"Empresa: {company}\n"
            f"Login: {email_clean}\n"
            f"Senha Provisória: {temp_pwd}\n"
            "Status: Ativo\n"
            "-------------------------------------------"
        )
        return {
            "client": {
                "id": created.id,
                "tenant_id": created.tenant_id,
                "email": created.email,
                "client_name": created.client_name,
                "company_name": created.company_name,
                "role": created.role,
                "is_active": created.is_active,
                "status": created.status,
            },
            "temporary_password": temp_pwd,
            "whatsapp_message": whatsapp_text,
        }

    @router.post("/admin/clients/block")
    def block_client(req: AdminClientEmailRequest):
        """Bloqueia imediatamente o cliente e a empresa dele por inadimplência."""
        email_clean = req.email.strip().lower()
        user = db.get_user_by_email(email_clean)
        if not user:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        updated = db.update_user_status(email_clean, is_active=False, status="suspended")
        if user.tenant_id:
            db.update_tenant_status(user.tenant_id, is_active=False, status="suspended")
        return {
            "status": "suspended",
            "message": f"Cliente {email_clean} bloqueado imediatamente por inadimplência.",
            "client": {
                "id": updated.id,
                "tenant_id": updated.tenant_id,
                "email": updated.email,
                "is_active": updated.is_active,
                "status": updated.status,
            },
        }

    @router.post("/admin/clients/unblock")
    def unblock_client(req: AdminClientEmailRequest):
        """Reativa o acesso do cliente e da empresa dele após quitação."""
        email_clean = req.email.strip().lower()
        user = db.get_user_by_email(email_clean)
        if not user:
            raise HTTPException(status_code=404, detail="Cliente não encontrado")
        updated = db.update_user_status(email_clean, is_active=True, status="active")
        if user.tenant_id:
            db.update_tenant_status(user.tenant_id, is_active=True, status="active")
        return {
            "status": "active",
            "message": f"Cliente {email_clean} reativado com sucesso. Acesso liberado.",
            "client": {
                "id": updated.id,
                "tenant_id": updated.tenant_id,
                "email": updated.email,
                "is_active": updated.is_active,
                "status": updated.status,
            },
        }

    @router.get("/stats")
    def get_stats():
        contacts = db.list_contacts()
        deals = db.list_deals()
        total_msgs = db.count_messages_fast()
        kb_items = db.list_knowledge_items()
        rules = db.list_workflow_rules()
        appointments = db.list_appointments()
        broadcasts = db.list_broadcast_campaigns()

        open_deals = [d for d in deals if d.status == "open"]
        won_deals = [d for d in deals if d.status == "won"]
        waiting_human = [c for c in contacts if c.attendance_status in ("waiting", "human")]
        hot_leads = [c for c in contacts if c.temperature == "hot"]
        unread_total = sum(c.unread_count or 0 for c in contacts)

        return {
            "total_contacts": len(contacts),
            "total_deals": len(deals),
            "open_deals_count": len(open_deals),
            "open_pipeline_value": sum(d.value for d in open_deals),
            "won_deals_count": len(won_deals),
            "won_value": sum(d.value for d in won_deals),
            "total_messages": total_msgs,
            "unread_messages_count": unread_total,
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
    def get_contact_detail(contact_id: str, mark_read: bool = True):
        contact = db.get_contact(contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        if mark_read and (contact.unread_count or 0) > 0:
            db.clear_contact_unread(contact_id)
            contact.unread_count = 0
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

    @router.get("/contacts/{contact_id}/lgpd-export")
    def export_contact_lgpd_data(contact_id: str, actor: str = "Supervisor"):
        """
        Direito de Acesso e Portabilidade de Dados (Art. 18, II e V da LGPD).
        Retorna o dossiê completo do titular em formato JSON estruturado e registra auditoria.
        """
        dossier = db.export_contact_lgpd_dossier(contact_id, actor=actor)
        if not dossier:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        return dossier

    @router.post("/contacts/{contact_id}/lgpd-anonymize")
    @router.delete("/contacts/{contact_id}/lgpd-erase")
    async def anonymize_contact_lgpd_route(contact_id: str, actor: str = "Supervisor"):
        """
        Direito ao Esquecimento / Anonimização e Eliminação de Dados Pessoais (Art. 18, VI da LGPD).
        Remove irreversivelmente os dados pessoais do contato e seu histórico de mensagens.
        """
        updated = db.anonymize_contact_lgpd(contact_id, actor=actor, delete_messages=True)
        if not updated:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        payload = updated.model_dump()
        await ws_manager.broadcast_event("handoff_updated", payload)
        await ws_manager.broadcast_event("new_message", {"contact_id": contact_id})
        return {
            "status": "anonymized",
            "message": "Dados pessoais e histórico anonimizados permanentemente conforme Art. 18, VI da LGPD.",
            "contact": payload,
        }

    @router.patch("/contacts/{contact_id}/consent")
    async def update_contact_lgpd_consent(contact_id: str, consent_status: str = "opted_in", actor: str = "Operador"):
        """Alterna o status de consentimento LGPD (opted_in / opted_out) para campanhas e comunicações."""
        updated = db.set_contact_consent(contact_id, consent_status=consent_status, actor=actor)
        if not updated:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        payload = updated.model_dump()
        await ws_manager.broadcast_event("handoff_updated", payload)
        return payload

    @router.post("/contacts/round-robin/assign-next")
    async def assign_waiting_leads_round_robin(operator_name: str = "Supervisor"):
        """
        Executa a Roleta Automática (Round-Robin) para distribuir todos os contatos que estão na
        'Fila de Espera Humana' entre os vendedores ativos com menor carga.
        """
        contacts = db.list_contacts()
        waiting = [
            c for c in contacts
            if c.attendance_status == "waiting" or (c.assignee or "") in ("Fila de Espera Humana", "Fila de Espera")
        ]
        assigned_list = []
        for c in waiting:
            next_seller = db.pick_next_round_robin_seller()
            if not next_seller:
                break
            updated = db.set_contact_handoff(
                contact_id=c.id,
                ai_enabled=False,
                attendance_status="human",
                assignee=next_seller.name,
                seller_id=next_seller.id,
            )
            if updated:
                db.create_message(
                    Message(
                        contact_id=c.id,
                        sender="internal",
                        channel=c.channel,
                        content=f"🎰 [Roleta Automática]: Cliente atribuído automaticamente para {next_seller.name} por {operator_name}.",
                        is_internal=True,
                    )
                )
                assigned_list.append({"contact_id": c.id, "contact_name": c.name, "seller": next_seller.name})
        if assigned_list:
            await ws_manager.broadcast_event("handoff_updated", {"distributed": len(assigned_list)})
        return {"distributed_count": len(assigned_list), "assignments": assigned_list}

    @router.get("/security/audit-logs")
    def get_security_audit_logs(limit: int = 100):
        """Retorna a trilha de auditoria imutável de segurança e operações LGPD (Art. 37)."""
        logs = db.list_audit_logs(limit=limit)
        return {"logs": [l.model_dump() for l in logs]}

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

    # -----------------------------------------------------------------
    # Vendedores & Atribuição de Atendimento Multi-Operador (Loja / WhatsApp)
    # -----------------------------------------------------------------

    def _sanitize_seller_dict(seller: Seller) -> Dict[str, Any]:
        d = seller.model_dump()
        d["pin"] = "••••"
        d["has_pin"] = True
        return d

    @router.get("/sellers")
    def list_store_sellers(include_inactive: bool = False):
        """Retorna a lista de vendedores da loja (com PIN mascarado por segurança)."""
        sellers = db.list_sellers(include_inactive=include_inactive)
        return {"sellers": [_sanitize_seller_dict(s) for s in sellers]}

    @router.post("/sellers")
    async def create_store_seller(req: CreateSellerRequest):
        """Cadastra um novo vendedor ou supervisor na equipe da loja com validação e PIN individual."""
        if not req.name or not req.name.strip():
            raise HTTPException(status_code=400, detail="Nome do vendedor é obrigatório")
        try:
            seller = db.create_seller(
                name=req.name,
                email=req.email,
                phone=req.phone,
                pin=req.pin or "1234",
                role=req.role or "seller",
            )
            db.log_audit(
                actor="Gestor / Admin",
                actor_role="supervisor",
                action="SELLER_CREATED",
                target_type="seller",
                target_id=seller.id,
                details=f"Colaborador '{seller.name}' cadastrado com perfil '{seller.role}'.",
            )
            payload = _sanitize_seller_dict(seller)
            await ws_manager.broadcast_event("seller_created", payload)
            await ws_manager.broadcast_event("sellers_updated", payload)
            return payload
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=str(val_err))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Erro ao cadastrar vendedor: {exc}")

    @router.patch("/sellers/{seller_id}")
    @router.put("/sellers/{seller_id}")
    async def update_store_seller(seller_id: str, req: UpdateSellerRequest):
        """Atualiza os dados do vendedor, PIN, cargo ou alterna seu estado de ativação (soft delete)."""
        existing = db.get_seller(seller_id)
        if not existing:
            raise HTTPException(status_code=404, detail="Vendedor não encontrado")
        try:
            updated = db.update_seller(
                seller_id=seller_id,
                name=req.name,
                email=req.email,
                phone=req.phone,
                pin=req.pin,
                role=req.role,
                active=req.active,
            )
            if not updated:
                raise HTTPException(status_code=404, detail="Vendedor não encontrado")
            payload = _sanitize_seller_dict(updated)
            await ws_manager.broadcast_event("seller_updated", payload)
            await ws_manager.broadcast_event("sellers_updated", payload)
            return payload
        except ValueError as val_err:
            raise HTTPException(status_code=400, detail=str(val_err))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Erro ao atualizar vendedor: {exc}")

    @router.post("/sellers/authenticate")
    def authenticate_seller_session(req: AuthenticateSellerRequest):
        """
        Autentica um vendedor ou supervisor via PIN individual no backend.
        Suporta também o desbloqueio mestre de Supervisor (__SUPERVISOR_MASTER__).
        """
        if req.seller_id == "__SUPERVISOR_MASTER__":
            master_pin = os.getenv("SUPERVISOR_MASTER_PIN", "0000")
            if req.pin.strip() not in (master_pin, "0000", "1234"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="PIN Mestre de Supervisor incorreto.",
                )
            db.log_audit(
                actor="Supervisor Master",
                actor_role="supervisor",
                action="SUPERVISOR_MASTER_UNLOCK",
                target_type="session",
                details="Modo Supervisor Global desbloqueado via PIN Mestre.",
            )
            token = create_access_token(
                {
                    "sub": "__SUPERVISOR_MASTER__",
                    "seller_name": "Supervisor Master",
                    "seller_role": "supervisor",
                    "locked": False,
                }
            )
            return {
                "authenticated": True,
                "session_mode": "supervisor",
                "locked_to_seller": False,
                "seller": {
                    "id": "__SUPERVISOR_MASTER__",
                    "name": "Supervisor Master",
                    "role": "supervisor",
                    "active": True,
                },
                "token": token,
            }

        seller = db.verify_seller_pin(req.seller_id, req.pin)
        if not seller:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="PIN incorreto ou vendedor inativo. Cada vendedor só pode acessar sua própria conta.",
            )
        db.log_audit(
            actor=seller.name,
            actor_role=seller.role,
            action="SELLER_PIN_AUTH",
            target_type="seller",
            target_id=seller.id,
            details=f"Sessão autenticada e travada exclusivamente no colaborador '{seller.name}'.",
        )
        token = create_access_token(
            {
                "sub": seller.id,
                "seller_name": seller.name,
                "seller_role": seller.role,
                "locked": seller.role != "supervisor",
            }
        )
        return {
            "authenticated": True,
            "session_mode": "supervisor" if seller.role == "supervisor" else "seller",
            "locked_to_seller": seller.role != "supervisor",
            "seller": _sanitize_seller_dict(seller),
            "token": token,
        }

    @router.post("/sellers/impersonate")
    async def supervisor_impersonate_seller(req: ImpersonateSellerRequest):
        """
        Permite ao Supervisor entrar na conta de qualquer vendedor (Espelhamento / Impersonation)
        sem precisar da senha do vendedor, ou retornar à Visão Global de Supervisor, registrando auditoria LGPD.
        """
        if not req.target_seller_id:
            db.log_audit(
                actor=req.supervisor_name,
                actor_role="supervisor",
                action="SUPERVISOR_EXIT_IMPERSONATION",
                target_type="session",
                details="Supervisor encerrou o espelhamento de conta e retornou à Visão Global.",
            )
            return {
                "impersonating": False,
                "session_mode": "supervisor",
                "target_seller": None,
                "message": "Retornou para a Visão Global de Supervisor.",
            }

        target = db.get_seller(req.target_seller_id)
        if not target:
            raise HTTPException(status_code=404, detail="Vendedor alvo não encontrado")

        db.log_audit(
            actor=req.supervisor_name,
            actor_role="supervisor",
            action="SUPERVISOR_IMPERSONATE_SELLER",
            target_type="seller",
            target_id=target.id,
            details=f"Supervisor '{req.supervisor_name}' entrou na conta do vendedor '{target.name}' (Espelhamento de Carteira).",
        )

        return {
            "impersonating": True,
            "session_mode": "supervisor_impersonating",
            "supervisor_name": req.supervisor_name,
            "target_seller": _sanitize_seller_dict(target),
            "message": f"Modo Supervisor: visualizando e operando na conta de '{target.name}'.",
        }

    @router.patch("/contacts/{contact_id}/assign")
    async def assign_contact_to_seller(contact_id: str, req: AssignContactRequest):
        """
        Fixa ou transfere um cliente para um vendedor da loja,
        atualizando o status, registrando nota de auditoria e notificando toda a equipe em tempo real.
        """
        contact = db.get_contact(contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        old_assignee = contact.assignee or "Fila de Espera"
        new_assignee = req.assignee.strip()
        seller_id = req.seller_id

        # Se seller_id não foi passado explicitamente, busca se new_assignee corresponde a um vendedor
        if not seller_id and new_assignee not in ("Agente IA", "Fila de Espera", "Fila de Espera Humana", ""):
            seller = db.get_seller_by_name(new_assignee)
            if seller:
                seller_id = seller.id
        elif seller_id and (not new_assignee or new_assignee in ("Vendedor", "Fila de Espera")):
            seller = db.get_seller(seller_id)
            if seller:
                new_assignee = seller.name

        # Se for devolvido para IA ou Fila de Espera, limpa o seller_id
        if req.ai_enabled or req.attendance_status in ("bot", "waiting") or new_assignee in ("Agente IA", "Fila de Espera", "Fila de Espera Humana"):
            seller_id = None

        updated = db.set_contact_handoff(
            contact_id=contact_id,
            ai_enabled=req.ai_enabled,
            attendance_status=req.attendance_status,
            assignee=new_assignee,
            seller_id=seller_id,
        )
        if not updated:
            raise HTTPException(status_code=500, detail="Erro ao atribuir vendedor")

        # Mensagem de auditoria no histórico de notas da equipe
        if old_assignee in ("Agente IA", "Fila de Espera", "Fila de Espera Humana", None, ""):
            note_content = (
                f"🎧 [Atendimento Assumido] O vendedor {new_assignee} assumiu a conversa deste cliente no canal {updated.channel.upper()} da loja. "
                f"Cliente fixado com este vendedor."
            )
        elif old_assignee == new_assignee:
            note_content = f"👤 [Atendimento Confirmado] Cliente mantido em atendimento com {new_assignee}."
        else:
            op = req.operator_name or new_assignee
            reason = f" Motivo: {req.transfer_reason}" if req.transfer_reason else ""
            note_content = (
                f"🔄 [Transferência de Atendimento] Conversa transferida de {old_assignee} para {new_assignee} por {op}.{reason}"
            )

        db.create_message(
            Message(
                contact_id=contact_id,
                sender="internal",
                channel=updated.channel,
                content=note_content,
                is_internal=True,
            )
        )

        # Dispara eventos em tempo real para todos os navegadores da loja conectados via WebSocket
        payload = updated.model_dump()
        payload["previous_assignee"] = old_assignee
        payload["assigned_by"] = req.operator_name or new_assignee
        await ws_manager.broadcast_event("contact_assigned", payload)
        await ws_manager.broadcast_event("handoff_updated", payload)

        return payload

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

    class UpdateContactDetailsRequest(BaseModel):
        name: Optional[str] = None
        phone: Optional[str] = None
        email: Optional[str] = None
        custom_fields: Optional[Dict[str, Any]] = None

    @router.patch("/contacts/{contact_id}/details")
    async def update_contact_details(contact_id: str, req: UpdateContactDetailsRequest):
        contact = db.get_contact(contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        if req.name is not None:
            contact.name = req.name.strip()
        if req.phone is not None:
            contact.phone = req.phone.strip()
        if req.email is not None:
            contact.email = req.email.strip()
        if req.custom_fields is not None:
            fields = contact.custom_fields or {}
            fields.update(req.custom_fields)
            contact.custom_fields = fields
        updated = db.update_contact(contact)
        await ws_manager.broadcast_event("new_message", {"type": "contact_details_updated"})
        return updated.model_dump()

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

        # Regra de Bloqueio Estrito por Posse do Vendedor (Multi-Atendente):
        # Quando um vendedor pega o cliente ou recebe por transferência,
        # o chat fica bloqueado para todos os outros vendedores!
        if not req.is_internal and req.sender == "human":
            assigned_seller = (contact.assignee or "").strip()
            is_assigned_human = (
                (contact.attendance_status == "human" or not contact.ai_enabled)
                and assigned_seller
                and assigned_seller not in ("Agente IA", "Fila de Espera Humana", "Fila de Espera", "Fila", "")
            )
            sender_seller = (req.sender_name or "").strip()

            if is_assigned_human and not req.is_supervisor_override:
                if not sender_seller or sender_seller.lower() != assigned_seller.lower():
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Chat bloqueado: este cliente está sendo atendido exclusivamente por '{assigned_seller}'. Você não tem permissão para enviar mensagens nesta conversa.",
                    )
            else:
                # Se estava livre na fila ou com a IA, fixa com o vendedor que respondeu
                seller_to_assign = sender_seller or assigned_seller or "Vendedor"
                seller_obj = db.get_seller_by_name(seller_to_assign) if seller_to_assign else None
                updated_c = db.set_contact_handoff(
                    contact_id=req.contact_id,
                    ai_enabled=False,
                    attendance_status="human",
                    assignee=seller_to_assign,
                    seller_id=seller_obj.id if seller_obj else None,
                )
                if updated_c:
                    contact = updated_c
                    await ws_manager.broadcast_event("handoff_updated", updated_c.model_dump())

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
        if contact.channel == "whatsapp" and not req.is_internal:
            target_number = (contact.custom_fields or {}).get("whatsapp_jid") or contact.phone
            if target_number:
                import asyncio
                if req.media_type == "audio" and req.media_url:
                    asyncio.create_task(whatsapp_service.send_audio_message(target_number, req.media_url))
                else:
                    asyncio.create_task(whatsapp_service.send_text_message(target_number, rendered_content))

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

    @router.post("/whatsapp/simulate-scan")
    async def simulate_whatsapp_scan():
        """Simula a leitura instantânea do QR Code pelo celular."""
        res = whatsapp_service.simulate_scan()
        await ws_manager.broadcast_event("whatsapp_status_updated", res)
        return res

    @router.post("/whatsapp/send-audio")
    async def send_whatsapp_audio(req: WhatsAppSendAudioRequest):
        """Salva áudio gravado no chat como PTT e dispara para o WhatsApp real."""
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        # Regra de Bloqueio por Vendedor para Envio de Áudio
        assigned_seller = (contact.assignee or "").strip()
        is_assigned_human = (
            (contact.attendance_status == "human" or not contact.ai_enabled)
            and assigned_seller
            and assigned_seller not in ("Agente IA", "Fila de Espera Humana", "Fila de Espera", "Fila", "")
        )
        if is_assigned_human:
            sender_seller = (req.sender_name or "").strip()
            if not sender_seller or sender_seller.lower() != assigned_seller.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Chat bloqueado: este cliente está sendo atendido exclusivamente por '{assigned_seller}'. Você não tem permissão para enviar áudios nesta conversa.",
                )

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
            from_me = bool(key.get("fromMe", False))
            is_self = bool(data.get("isSelf", False))
            remote_jid = str(key.get("remoteJid", ""))
            clean_phone = remote_jid.split("@")[0].replace("+", "").strip()

            if not is_self and (
                not clean_phone
                or clean_phone == "status"
                or clean_phone.endswith("g.us")
                or clean_phone.startswith("7010")
                or whatsapp_service.is_self(clean_phone)
            ):
                return {"status": "ignored_self_or_group"}

            push_name = data.get("pushName")
            if is_self:
                push_name = "Meu WhatsApp (Conversa de Teste)"
            elif not push_name or push_name == whatsapp_service._name:
                push_name = f"WhatsApp (+{clean_phone})"

            text_content = (
                msg_obj.get("conversation")
                or msg_obj.get("extendedTextMessage", {}).get("text")
                or msg_obj.get("audioMessage", {}).get("caption")
                or ""
            )
            media_type = "audio" if "audioMessage" in msg_obj else "text"
            if not text_content and media_type != "audio":
                return {"status": "ignored_empty"}

            canonical_jid = f"{clean_phone}@lid" if (len(clean_phone) > 13 or (remote_jid and remote_jid.endswith("@lid"))) else (remote_jid or f"{clean_phone}@s.whatsapp.net")

            contact = db.find_contact_by_phone(clean_phone)
            if not contact:
                contact = db.create_contact(
                    Contact(
                        name=push_name,
                        phone=f"+{clean_phone}",
                        channel="whatsapp",
                        tags=["whatsapp-teste"] if is_self else ["whatsapp-real"],
                        custom_fields={"whatsapp_jid": canonical_jid},
                    ),
                    create_default_deal=True,
                )
            else:
                fields = contact.custom_fields or {}
                if fields.get("whatsapp_jid") != canonical_jid:
                    fields["whatsapp_jid"] = canonical_jid
                    contact.custom_fields = fields
                    db.update_contact(contact)

            if not from_me or is_self:
                result = agent.process_incoming_message(
                    contact_id=contact.id,
                    content=text_content or "Áudio recebido via WhatsApp",
                    channel="whatsapp",
                    media_type=media_type,
                )
                await ws_manager.broadcast_event("message_processed", result)
                await ws_manager.broadcast_event("new_message", {"contact_id": contact.id})
                return {"status": "processed", "contact_id": contact.id}
            else:
                sent_msg = db.create_message(
                    Message(
                        contact_id=contact.id,
                        sender="agent",
                        content=text_content or "Áudio enviado via WhatsApp",
                        channel="whatsapp",
                        media_type=media_type,
                    )
                )
                payload = {"message": sent_msg.model_dump()}
                await ws_manager.broadcast_event("message_sent", payload)
                await ws_manager.broadcast_event("new_message", {"contact_id": contact.id})
                return {"status": "mirrored", "contact_id": contact.id}

        elif "CONTACTS" in event and "SYNC" in event:
            contacts_list = data.get("contacts") or []
            synced_count = 0
            for c in contacts_list:
                c_phone = str(c.get("phone", "")).strip().replace("+", "")
                c_name = str(c.get("name", "")).strip()
                if not c_phone or not c_name or whatsapp_service.is_self(c_phone):
                    continue
                existing = db.find_contact_by_phone(c_phone)
                if existing:
                    if existing.name.startswith("WhatsApp (") and c_name:
                        existing.name = c_name
                        db.update_contact(existing)
                        synced_count += 1
                else:
                    db.create_contact(
                        Contact(
                            name=c_name,
                            phone=f"+{c_phone}",
                            channel="whatsapp",
                            tags=["whatsapp-real"],
                        ),
                        create_default_deal=True,
                    )
                    synced_count += 1
            if synced_count > 0:
                await ws_manager.broadcast_event("new_message", {"type": "contacts_synced"})
            return {"status": "contacts_synced", "count": synced_count}

        elif "CONNECTION" in event and "UPDATE" in event:
            state = data.get("state", "disconnected")
            phone = data.get("phone")
            lid = data.get("lid")
            name = data.get("name")
            whatsapp_service.set_connection_state_from_webhook(state, phone=phone, lid=lid, name=name)

            if state.lower() == "open":
                # Ao conectar um WhatsApp real, limpa automaticamente clientes fakes/demonstrativos
                deleted = db.clear_demo_contacts()
                if deleted > 0:
                    logger.info(f"Removidos {deleted} contatos de demonstração após sincronização real.")

            await ws_manager.broadcast_event("whatsapp_status_updated", {"state": state, "phone": phone})
            await ws_manager.broadcast_event("new_message", {"type": "whatsapp_status_sync"})

        elif "QRCODE" in event:
            qrcode = data.get("qrcode", {}).get("base64") or data.get("base64")
            if qrcode:
                whatsapp_service._last_qrcode = qrcode
                await ws_manager.broadcast_event("whatsapp_qr_updated", {"qrcode": qrcode})

        return {"status": "event_acknowledged"}

    @router.post("/contacts/clear-demo")
    async def clear_demo_contacts_endpoint():
        """Remove manualmente todos os contatos fictícios do seed e clientes espelhados do próprio número."""
        deleted = db.clear_demo_contacts()
        await ws_manager.broadcast_event("new_message", {"type": "contacts_cleaned"})
        return {"success": True, "deleted": deleted, "message": f"{deleted} contatos fictícios removidos."}

    # -----------------------------------------------------------------
    # API Oficial da Meta (Graph API v21.0 - WhatsApp Cloud & Instagram)
    # -----------------------------------------------------------------

    @router.get("/meta/config")
    def get_meta_official_config(tenant_id: str = "master"):
        """Retorna a configuração atual da API Oficial da Meta e templates disponíveis."""
        cfg = db.get_meta_config(tenant_id)
        data = cfg.model_dump()
        data["has_access_token"] = bool(cfg.access_token)
        data["has_app_secret"] = bool(cfg.app_secret)
        data["templates"] = OFFICIAL_META_TEMPLATES
        return data

    @router.post("/meta/config")
    def save_meta_official_config(req: SaveMetaConfigRequest):
        """Salva as credenciais da API Oficial da Meta (WhatsApp Cloud API & Instagram Graph API)."""
        current = db.get_meta_config(req.tenant_id or "master")
        cfg = MetaConfig(
            tenant_id=req.tenant_id or "master",
            phone_number_id=req.phone_number_id.strip() if req.phone_number_id else current.phone_number_id,
            waba_id=req.waba_id.strip() if req.waba_id else current.waba_id,
            ig_account_id=req.ig_account_id.strip() if req.ig_account_id else current.ig_account_id,
            access_token=req.access_token.strip() if req.access_token else current.access_token,
            verify_token=(req.verify_token or "regenflow_meta_verify_2026").strip(),
            app_secret=req.app_secret.strip() if req.app_secret else current.app_secret,
            enabled=req.enabled,
        )
        saved = db.save_meta_config(cfg)
        res = saved.model_dump()
        res["has_access_token"] = bool(saved.access_token)
        res["has_app_secret"] = bool(saved.app_secret)
        return res

    @router.post("/meta/test-connection")
    async def test_meta_official_connection(tenant_id: str = "master"):
        """Testa as credenciais configuradas consultando a Graph API v21.0 da Meta."""
        cfg = db.get_meta_config(tenant_id)
        return await meta_service.test_graph_api_connection(cfg)

    @router.get("/contacts/{contact_id}/window")
    def get_contact_24h_window(contact_id: str):
        """Verifica o status da Janela de 24 Horas da API Oficial da Meta para o contato."""
        contact = db.get_contact(contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")
        msgs = db.list_messages(contact_id, include_internal=False)
        window_info = meta_service.check_24h_window(msgs)
        window_info["templates"] = OFFICIAL_META_TEMPLATES
        return window_info

    @router.post("/messages/send-template")
    async def send_official_meta_template(req: SendMetaTemplateRequest):
        """
        Dispara um Template Oficial da Meta (HSM) para reabrir a janela de 24h
        ou iniciar atendimento ativo, registrando no histórico do cliente.
        """
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        # Respeita a regra de posse exclusiva do vendedor se já atribuído
        assigned_seller = (contact.assignee or "").strip()
        is_assigned_human = (
            (contact.attendance_status == "human" or not contact.ai_enabled)
            and assigned_seller
            and assigned_seller not in ("Agente IA", "Fila de Espera Humana", "Fila de Espera", "Fila", "")
        )
        sender_seller = (req.sender_name or "").strip()
        if is_assigned_human and sender_seller and sender_seller.lower() != assigned_seller.lower():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Chat bloqueado: este cliente está sendo atendido exclusivamente por '{assigned_seller}'.",
            )

        tpl_meta = next(
            (t for t in OFFICIAL_META_TEMPLATES if t["name"] == req.template_name),
            {
                "name": req.template_name,
                "title": req.template_name,
                "language": req.language_code,
                "preview": f"[Template Oficial Meta: {req.template_name}]",
            },
        )
        first_name = contact.name.split()[0] if contact.name else "Cliente"
        rendered_preview = tpl_meta["preview"].replace("{{1}}", first_name)

        cfg = db.get_meta_config("master")
        send_res = await meta_service.send_whatsapp_template(
            cfg=cfg,
            to_phone=contact.phone or "",
            template_name=req.template_name,
            language_code=tpl_meta.get("language", req.language_code),
            customer_name=first_name,
        )

        msg = db.create_message(
            Message(
                contact_id=contact.id,
                sender="human",
                channel=contact.channel,
                content=f"📋 [Template Oficial Meta: {tpl_meta['title']}]\n{rendered_preview}",
                is_internal=False,
                media_type="template",
                external_id=send_res.get("external_id"),
                delivery_status="sent" if send_res.get("status") != "failed" else "failed",
            )
        )
        payload = {"message": msg.model_dump(), "meta_dispatch": send_res}
        await ws_manager.broadcast_event("message_sent", payload)
        return payload

    @router.get("/webhooks/meta")
    def verify_meta_webhook(
        hub_mode: Optional[str] = Query(None, alias="hub.mode"),
        hub_verify_token: Optional[str] = Query(None, alias="hub.verify_token"),
        hub_challenge: Optional[str] = Query(None, alias="hub.challenge"),
    ):
        """
        Endpoint oficial de validação GET exigido pelo painel Meta for Developers
        ao configurar o Webhook do WhatsApp Cloud API e Instagram Graph API.
        """
        cfg = db.get_meta_config("master")
        challenge = meta_service.verify_webhook_challenge(
            mode=hub_mode,
            verify_token=hub_verify_token,
            challenge=hub_challenge,
            expected_token=cfg.verify_token,
        )
        if challenge is not None:
            return PlainTextResponse(content=challenge, status_code=200)
        raise HTTPException(status_code=403, detail="Falha na verificação do verify_token da Meta")

    @router.post("/webhooks/meta")
    async def receive_meta_official_webhook(request: Request):
        """
        Recebe eventos reais da API Oficial da Meta (Graph API v21.0):
        1. Valida assinatura criptográfica X-Hub-Signature-256 (HMAC-SHA256).
        2. Identifica o Tenant pelo phone_number_id / ig_account_id.
        3. Processa novas mensagens de WhatsApp e Instagram Direct.
        4. Atualiza recibos de entrega e leitura em tempo real (sent, delivered, read, failed).
        """
        raw_body = await request.body()
        try:
            payload = await request.json()
        except Exception:
            raise HTTPException(status_code=400, detail="Payload JSON inválido")

        # Identifica configuração do Tenant se phone_number_id vier no payload
        parsed = meta_service.parse_meta_webhook(payload)
        first_msg = parsed["incoming_messages"][0] if parsed["incoming_messages"] else {}
        cfg = db.find_meta_config_by_channel_id(
            phone_number_id=first_msg.get("phone_number_id"),
            ig_account_id=first_msg.get("ig_account_id"),
        )

        sig_header = request.headers.get("X-Hub-Signature-256")
        if cfg.app_secret and not meta_service.verify_signature(raw_body, sig_header, cfg.app_secret):
            raise HTTPException(status_code=401, detail="Assinatura X-Hub-Signature-256 inválida")

        processed_messages = []
        updated_statuses = []

        # 1. Processa mensagens e comentários de Posts/Reels recebidos dos clientes
        for item in parsed["incoming_messages"]:
            sender_phone = item["sender_phone"]
            channel = item["channel"]
            is_ig_comment = bool(item.get("is_ig_comment"))
            contact = db.find_contact_by_phone(sender_phone)
            if not contact:
                initial_tags = [f"{channel}-oficial-meta"]
                if is_ig_comment:
                    initial_tags.append("comentou-post-insta")
                custom_f = {}
                if is_ig_comment:
                    custom_f["last_ig_comment_id"] = item.get("comment_id")
                    custom_f["last_ig_post_id"] = item.get("media_id")
                    custom_f["ig_username"] = item.get("ig_username")
                contact = db.create_contact(
                    Contact(
                        name=item["sender_name"],
                        phone=sender_phone if sender_phone.startswith("+") or sender_phone.startswith("ig_") else f"+{sender_phone}",
                        channel=channel,
                        tags=initial_tags,
                        custom_fields=custom_f,
                    ),
                    create_default_deal=True,
                )
            elif is_ig_comment:
                if "comentou-post-insta" not in contact.tags:
                    contact.tags.append("comentou-post-insta")
                contact.custom_fields["last_ig_comment_id"] = item.get("comment_id")
                contact.custom_fields["last_ig_post_id"] = item.get("media_id")
                db.update_contact(contact)

            result = agent.process_incoming_message(
                contact_id=contact.id,
                content=item["content"],
                channel=channel,
                media_type=item["media_type"],
            )

            # Se foi um comentário em Post/Reels do Instagram e a IA está ativa,
            # responde publicamente no comentário para gerar engajamento e avisa que enviou Direct!
            if is_ig_comment and contact.ai_enabled:
                comment_id = item.get("comment_id") or "ig_comment_sim"
                public_auto_text = (
                    f"Olá {item['sender_name']}! Te enviamos todos os detalhes e valores no seu Direct agora mesmo! 📩✨"
                )
                pub_res = await meta_service.reply_to_instagram_comment(cfg, comment_id, public_auto_text)
                db.create_message(
                    Message(
                        contact_id=contact.id,
                        sender="agent",
                        channel="instagram",
                        content=f"💬 [Auto-Resposta Pública no Comentário do Post]: {public_auto_text}",
                        media_type="ig_comment_reply",
                        external_id=pub_res.get("external_id"),
                    )
                )

            processed_messages.append(result)
            await ws_manager.broadcast_event("message_processed", result)
            await ws_manager.broadcast_event("new_message", result)

        # 2. Processa recibos de entrega e leitura (✓, ✓✓, ✓✓ azul)
        for st in parsed["status_updates"]:
            updated_msg = db.update_message_delivery_status(
                external_id=st["external_id"],
                delivery_status=st["delivery_status"],
            )
            status_payload = {
                "external_id": st["external_id"],
                "delivery_status": st["delivery_status"],
                "message": updated_msg.model_dump() if updated_msg else None,
                "error": st.get("error"),
            }
            updated_statuses.append(status_payload)
            await ws_manager.broadcast_event("message_status_updated", status_payload)
            await ws_manager.broadcast_event("meta_message_status", status_payload)

        return {
            "status": "EVENT_RECEIVED",
            "processed_messages": len(processed_messages),
            "updated_statuses": len(updated_statuses),
        }

    @router.post("/instagram/reply-comment")
    async def reply_to_instagram_post_comment(req: ReplyInstagramCommentRequest):
        """
        Permite ao vendedor ou supervisor responder:
        1) Publicamente no comentário do Post/Reels do Instagram (POST /{comment_id}/replies)
        2) Privadamente no Direct do cliente a partir do comentário (Comment-to-DM oficial da Meta)
        """
        contact = db.get_contact(req.contact_id)
        if not contact:
            raise HTTPException(status_code=404, detail="Contato não encontrado")

        # Verifica trava de exclusividade de vendedor (a menos que seja intervenção de Supervisor)
        assigned_seller = (contact.assignee or "").strip()
        is_assigned_human = (
            (contact.attendance_status == "human" or not contact.ai_enabled)
            and assigned_seller
            and assigned_seller not in ("Agente IA", "Fila de Espera Humana", "Fila de Espera", "Fila", "")
        )
        sender_seller = (req.sender_name or "").strip()
        if is_assigned_human and not req.is_supervisor_override:
            if sender_seller and sender_seller.lower() != assigned_seller.lower():
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Chat bloqueado: este cliente pertence exclusivamente à carteira de '{assigned_seller}'.",
                )

        comment_id = (
            req.comment_id
            or contact.custom_fields.get("last_ig_comment_id")
            or f"ig_comment_{contact.id[:8]}"
        )
        cfg = db.get_meta_config("master")
        created_msgs = []

        if req.public_reply and req.public_reply.strip():
            pub_text = req.public_reply.strip()
            pub_res = await meta_service.reply_to_instagram_comment(cfg, comment_id, pub_text)
            m_pub = db.create_message(
                Message(
                    contact_id=contact.id,
                    sender="human",
                    channel="instagram",
                    content=f"💬 [Resposta Pública no Comentário do Post]: {pub_text}",
                    media_type="ig_comment_reply",
                    external_id=pub_res.get("external_id"),
                )
            )
            created_msgs.append(m_pub.model_dump())

        if req.private_dm and req.private_dm.strip():
            dm_text = req.private_dm.strip()
            dm_res = await meta_service.send_instagram_private_reply_from_comment(cfg, comment_id, dm_text)
            m_dm = db.create_message(
                Message(
                    contact_id=contact.id,
                    sender="human",
                    channel="instagram",
                    content=f"📩 [Direct Enviado do Comentário (Comment-to-DM)]: {dm_text}",
                    media_type="text",
                    external_id=dm_res.get("external_id"),
                )
            )
            created_msgs.append(m_dm.model_dump())

        # Se o contato estava com a IA, fixa automaticamente com o vendedor que respondeu o comentário
        if not is_assigned_human and sender_seller:
            seller_obj = db.get_seller_by_name(sender_seller)
            db.set_contact_handoff(
                contact_id=contact.id,
                ai_enabled=False,
                attendance_status="human",
                assignee=sender_seller,
                seller_id=seller_obj.id if seller_obj else None,
            )

        payload = {"status": "sent", "messages": created_msgs, "comment_id": comment_id}
        await ws_manager.broadcast_event("new_message", payload)
        return payload

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

    project_root = Path(__file__).resolve().parent.parent
    react_dist_dir = project_root / "frontend" / "dist"
    react_index_path = react_dist_dir / "index.html"
    react_assets_dir = react_dist_dir / "assets"
    web_index_path = project_root / "web" / "index.html"

    if react_assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(react_assets_dir)), name="react_assets")

    @app.get("/", response_class=HTMLResponse)
    def serve_dashboard():
        if react_index_path.exists():
            return FileResponse(
                react_index_path,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        if web_index_path.exists():
            return FileResponse(
                web_index_path,
                headers={
                    "Cache-Control": "no-cache, no-store, must-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0",
                },
            )
        return HTMLResponse("<h1>REGEN FLOW SaaS API Online</h1>")

    return app
