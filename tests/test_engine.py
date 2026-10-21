import asyncio
import pytest
from fastapi.testclient import TestClient

from api.routes import create_app
from core.db import Contact, Database, Message
from engine.agent import ConversationalAgent
from engine.debouncer import MessageDebouncer
from engine.workflow import WorkflowEngine


@pytest.fixture
def db():
    """Banco SQLite em memória isolado por teste, com funil, KB e workflows padrão."""
    return Database(db_path=":memory:", auto_seed=True)


def test_1_persistence_and_referential_integrity(db: Database):
    """
    Valida a persistência e integridade referencial de contatos, negócios (deals)
    e mensagens em SQLite.
    """
    contact = db.create_contact(
        Contact(
            name="Ana Beatriz",
            phone="+55 11 91234-5678",
            email="ana@empresa.com.br",
            channel="whatsapp",
            tags=["inbound"],
            custom_fields={"origem": "landing-page"},
        ),
        create_default_deal=True,
    )

    fetched_contact = db.get_contact(contact.id)
    assert fetched_contact is not None
    assert fetched_contact.name == "Ana Beatriz"
    assert "inbound" in fetched_contact.tags
    assert fetched_contact.custom_fields["origem"] == "landing-page"

    # Verifica que o Deal inicial foi criado no primeiro estágio ("Novo Lead")
    deal = db.get_contact_active_deal(contact.id)
    assert deal is not None
    stage = db.get_stage(deal.stage_id)
    assert stage is not None
    assert stage.name == "Novo Lead"

    # Cria e recupera mensagem vinculada ao contato
    msg = db.create_message(
        Message(
            contact_id=contact.id,
            sender="contact",
            channel="whatsapp",
            content="Olá, quero conhecer a plataforma.",
        )
    )
    history = db.list_messages(contact.id)
    assert len(history) == 1
    assert history[0].id == msg.id
    assert history[0].content == "Olá, quero conhecer a plataforma."


@pytest.mark.asyncio
async def test_2_message_debouncer_groups_three_concurrent_messages(db: Database):
    """
    Valida o agrupamento de 3 mensagens concorrentes em uma única entrada pelo MessageDebouncer.
    """
    contact = db.create_contact(Contact(name="Cliente Picado", channel="whatsapp"))
    dispatched_payloads = []

    def on_flush(cid: str, combined_text: str, meta: dict):
        saved_msg = db.create_message(
            Message(contact_id=cid, sender="contact", channel="whatsapp", content=combined_text)
        )
        dispatched_payloads.append((cid, combined_text, meta, saved_msg.id))

    debouncer = MessageDebouncer(window_seconds=0.15, callback=on_flush)

    # Envia 3 mensagens picadas em sequência rápida
    c1 = debouncer.push(contact.id, "Oi!")
    c2 = debouncer.push(contact.id, "Quero saber")
    c3 = debouncer.push(contact.id, "quanto custa o plano Pro?")

    assert (c1, c2, c3) == (1, 2, 3)
    assert len(debouncer.pending_fragments(contact.id)) == 3

    # Aguarda janela temporal do debouncer expirar
    await asyncio.sleep(0.25)

    assert len(dispatched_payloads) == 1
    cid, combined_text, meta, _ = dispatched_payloads[0]
    assert cid == contact.id
    assert combined_text == "Oi! Quero saber quanto custa o plano Pro?"
    assert meta["fragment_count"] == 3

    messages_in_db = db.list_messages(contact.id)
    assert len(messages_in_db) == 1
    assert messages_in_db[0].content == "Oi! Quero saber quanto custa o plano Pro?"


def test_3_knowledge_base_query_and_agent_funnel_progression(db: Database):
    """
    Valida:
    - Consulta precisa na base de conhecimento com resposta a dúvidas de preços e planos.
    - Transição automática da oportunidade no Kanban de 'Novo Lead' para
      'Proposta Apresentada' e 'Fechado Ganho' mediante intenção detectada.
    """
    agent = ConversationalAgent(db)
    contact = db.create_contact(Contact(name="Marcos Vinicius", channel="whatsapp"))

    initial_deal = db.get_contact_active_deal(contact.id)
    assert db.get_stage(initial_deal.stage_id).name == "Novo Lead"

    # Passo 1: Cliente pergunta sobre preços/proposta -> Deve consultar KB e avançar para "Proposta Apresentada"
    res_proposal = agent.process_incoming_message(
        contact_id=contact.id,
        content="Olá! Quais são os preços e planos? Gostaria de uma proposta para o plano Pro com 6 vendedores.",
    )

    assert len(res_proposal["kb_matches"]) >= 1
    assert "R$ 497" in res_proposal["agent_message"]["content"]
    assert res_proposal["stage_transition"] is not None
    assert res_proposal["stage_transition"]["from_stage"] == "Novo Lead"
    assert res_proposal["stage_transition"]["to_stage"] == "Proposta Apresentada"
    assert res_proposal["extracted_fields"].get("plano_interesse") == "Pro"
    assert res_proposal["extracted_fields"].get("tamanho_equipe") == 6

    # Passo 2: Cliente manifesta intenção de fechamento -> Deve avançar para "Fechado Ganho" e status "won"
    res_closing = agent.process_incoming_message(
        contact_id=contact.id,
        content="Perfeito, aceito a proposta! Vamos fechar o contrato hoje.",
    )

    assert res_closing["stage_transition"] is not None
    assert res_closing["stage_transition"]["from_stage"] == "Proposta Apresentada"
    assert res_closing["stage_transition"]["to_stage"] == "Fechado Ganho"
    assert res_closing["deal"]["status"] == "won"


def test_4_workflow_engine_keyword_and_tag_automation(db: Database):
    """
    Valida o disparo de regras de automação por palavras-chave com aplicação de tags
    e envio de mensagem automática.
    """
    workflow = WorkflowEngine(db)
    contact = db.create_contact(Contact(name="Juliana Urgente", channel="instagram"))

    actions = workflow.evaluate(
        contact_id=contact.id,
        event_type="keyword",
        event_value="Preciso de um orçamento urgente para hoje!",
        channel="instagram",
    )

    assert len(actions) >= 2
    updated_contact = db.get_contact(contact.id)
    assert "prioridade-alta" in updated_contact.tags
    assert "pediu-orcamento" in updated_contact.tags

    system_msgs = [m for m in db.list_messages(contact.id) if m.sender == "system"]
    assert len(system_msgs) >= 1


def test_5_mcp_protocol_tools_and_rest_api_integration():
    """
    Valida a descoberta e execução das 6 ferramentas MCP e os endpoints de integração FastAPI.
    """
    app = create_app(db_path=":memory:", seed_demo=False)
    client = TestClient(app)

    # 1. Descoberta das ferramentas MCP
    tools_resp = client.get("/api/mcp/tools")
    assert tools_resp.status_code == 200
    tools = tools_resp.json()["tools"]
    tool_names = {t["name"] for t in tools}
    expected_tools = {
        "create_contact",
        "list_contacts",
        "move_deal_stage",
        "add_contact_tag",
        "query_knowledge_base",
        "send_chat_message",
        "schedule_appointment",
        "get_pipeline_overview",
    }
    assert expected_tools == tool_names

    # 2. Execução MCP: create_contact (via /api/mcp/execute)
    create_resp = client.post(
        "/api/mcp/execute",
        json={
            "name": "create_contact",
            "arguments": {
                "name": "Patrícia Souza",
                "phone": "+55 11 95555-4444",
                "channel": "whatsapp",
                "tags": ["lead-mcp"],
            },
        },
    )
    assert create_resp.status_code == 200
    created_contact = create_resp.json()["result"]["contact"]
    cid = created_contact["id"]

    # 3. Execução MCP: add_contact_tag
    tag_resp = client.post(
        "/api/mcp/execute",
        json={"name": "add_contact_tag", "arguments": {"contact_id": cid, "tag": "qualificado"}},
    )
    assert tag_resp.status_code == 200
    assert "qualificado" in tag_resp.json()["result"]["contact"]["tags"]

    # 4. Execução MCP: move_deal_stage
    move_resp = client.post(
        "/api/mcp/execute",
        json={
            "name": "move_deal_stage",
            "arguments": {"contact_id": cid, "stage_name": "Proposta Apresentada", "value": 997.0},
        },
    )
    assert move_resp.status_code == 200
    assert move_resp.json()["result"]["stage_name"] == "Proposta Apresentada"

    # 5. Execução MCP: query_knowledge_base
    kb_resp = client.post(
        "/api/mcp/execute",
        json={"name": "query_knowledge_base", "arguments": {"query": "preços e planos"}},
    )
    assert kb_resp.status_code == 200
    assert kb_resp.json()["result"]["best_answer"] is not None

    # 6. Execução MCP: send_chat_message & list_contacts
    msg_resp = client.post(
        "/api/mcp/execute",
        json={
            "name": "send_chat_message",
            "arguments": {"contact_id": cid, "content": "Proposta enviada via MCP!", "sender": "agent"},
        },
    )
    assert msg_resp.status_code == 200

    list_resp = client.post("/api/mcp/execute", json={"name": "list_contacts", "arguments": {"tag": "qualificado"}})
    assert list_resp.status_code == 200
    assert list_resp.json()["result"]["count"] == 1

    # 7. Execução MCP: schedule_appointment (via alias /api/mcp/call)
    appt_resp = client.post(
        "/api/mcp/call",
        json={
            "name": "schedule_appointment",
            "arguments": {
                "contact_id": cid,
                "title": "Apresentação Plano Enterprise",
                "scheduled_at": "2026-10-25T14:30:00",
                "duration_minutes": 45,
            },
        },
    )
    assert appt_resp.status_code == 200
    assert appt_resp.json()["success"] is True
    assert appt_resp.json()["result"]["appointment"]["title"] == "Apresentação Plano Enterprise"

    # 8. Execução MCP: get_pipeline_overview (via /api/mcp/call)
    pipe_resp = client.post(
        "/api/mcp/call",
        json={"name": "get_pipeline_overview", "arguments": {}},
    )
    assert pipe_resp.status_code == 200
    assert pipe_resp.json()["success"] is True
    assert len(pipe_resp.json()["result"]["stages"]) > 0


def test_6_handoff_internal_notes_appointments_broadcast_and_webhook():
    """
    Valida as funcionalidades avançadas estilo ChatFunnel v2.0:
    - Webhook WhatsApp criando lead automaticamente
    - Agendamento de reunião via intenção no chat
    - Handoff Humano ("falar com atendente") pausando respostas automáticas
    - Notas internas (Sussurro/Whisper) visíveis apenas para a equipe
    - Broadcast segmentado com variáveis {{nome}} e {{empresa}}
    - Follow-up Anti-Vácuo
    """
    app = create_app(db_path=":memory:", seed_demo=False)
    client = TestClient(app)

    # 1. Webhook WhatsApp cria contato e avança estágio
    wh_resp = client.post(
        "/api/webhooks/whatsapp",
        json={
            "phone": "+55 41 99988-7766",
            "name": "Rafael Nogueira",
            "message": "Olá! Quero agendar reunião de demonstração e receber proposta para a empresa Horizonte.",
            "channel": "whatsapp",
        },
    )
    assert wh_resp.status_code == 200
    wh_data = wh_resp.json()
    assert wh_data["created_new_contact"] is True
    assert wh_data["scheduled_appointment"] is not None
    cid = wh_data["contact"]["id"]

    # 2. Pedido de Handoff Humano pausa respostas automáticas
    handoff_msg = client.post(
        "/api/messages/incoming",
        json={"contact_id": cid, "content": "Quero falar com atendente humano agora."},
    )
    assert handoff_msg.status_code == 200
    assert handoff_msg.json()["ai_paused"] is True
    assert handoff_msg.json()["contact"]["ai_enabled"] is False

    # 3. Nota Interna (Sussurro) salva com is_internal=True
    note_resp = client.post(
        "/api/messages/send",
        json={
            "contact_id": cid,
            "content": "Nota interna: oferecer desconto anual para {{nome}} da {{empresa}}",
            "sender": "internal",
            "is_internal": True,
        },
    )
    assert note_resp.status_code == 200
    assert note_resp.json()["message"]["is_internal"] is True
    assert "Rafael" in note_resp.json()["message"]["content"]
    assert "Horizonte" in note_resp.json()["message"]["content"]

    # 4. Broadcast em Massa com variáveis dinâmicas
    bc_resp = client.post(
        "/api/broadcasts",
        json={
            "name": "Campanha VIP",
            "channel": "whatsapp",
            "template_content": "Oi {{nome}}, condição especial para a {{empresa}}!",
        },
    )
    assert bc_resp.status_code == 200
    assert bc_resp.json()["recipients_count"] == 1
    assert "Oi Rafael, condição especial para a Horizonte!" in bc_resp.json()["messages"][0]["content"]

    # 5. Follow-up Anti-Vácuo
    fw_resp = client.post("/api/followups/trigger", json={"contact_id": cid})
    assert fw_resp.status_code == 200
    assert fw_resp.json()["triggered_count"] == 1


def test_7_whatsapp_real_connector_and_evolution_webhook():
    """
    Valida a integração com Evolution API:
    - Verificação de status do conector WhatsApp (/api/whatsapp/status)
    - Envio de áudio gravado PTT (/api/whatsapp/send-audio)
    - Recepção e processamento de webhook oficial da Evolution API (MESSAGES_UPSERT)
    """
    app = create_app(db_path=":memory:", seed_demo=False)
    client = TestClient(app)

    # 1. Consulta status inicial
    status_resp = client.get("/api/whatsapp/status")
    assert status_resp.status_code == 200
    status_data = status_resp.json()
    assert "instance" in status_data
    assert "connected" in status_data

    # 2. Conexão / QR Code
    connect_resp = client.post("/api/whatsapp/connect")
    assert connect_resp.status_code == 200
    assert "instance" in connect_resp.json()

    # 3. Cria contato para teste de áudio
    contact_resp = client.post(
        "/api/contacts",
        json={"name": "Cliente Áudio", "phone": "+55 11 99999-1234", "channel": "whatsapp"},
    )
    assert contact_resp.status_code == 200
    cid = contact_resp.json()["contact"]["id"]

    # 4. Envio de áudio PTT
    audio_resp = client.post(
        "/api/whatsapp/send-audio",
        json={"contact_id": cid, "audio_base64": "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwE="},
    )
    assert audio_resp.status_code == 200
    assert audio_resp.json()["message"]["media_type"] == "audio"
    assert "data:audio/webm;base64," in audio_resp.json()["message"]["media_url"]

    # 5. Webhook Evolution API recebendo mensagem do WhatsApp real
    evo_webhook_payload = {
        "event": "messages.upsert",
        "instance": "openchatfunnel",
        "data": {
            "key": {
                "remoteJid": "5511988887777@s.whatsapp.net",
                "fromMe": False,
                "id": "MSG123456",
            },
            "pushName": "Julio Consultoria",
            "message": {
                "conversation": "Olá! Gostaria de receber uma proposta do plano Pro para a empresa Ômega.",
            },
        },
    }
    webhook_resp = client.post("/api/webhooks/evolution", json=evo_webhook_payload)
    assert webhook_resp.status_code == 200
    assert webhook_resp.json()["status"] == "processed"

    # Verifica que o contato foi criado e a oportunidade avançada para Proposta Apresentada
    contacts_list = client.get("/api/contacts").json()
    julio = next((c for c in contacts_list if "Julio Consultoria" in c["name"]), None)
    assert julio is not None
    assert julio["stage_name"] == "Proposta Apresentada"


def test_8_data_encryption_at_rest_and_security_headers():
    """
    Garante que todos os dados confidenciais (mensagens, telefones, e-mails, notas)
    são gravados rigorosamente criptografados (AES + HMAC) no SQLite e que os cabeçalhos
    de segurança em trânsito estão ativos.
    """
    app = create_app(db_path=":memory:", seed_demo=False)
    client = TestClient(app)
    db = app.state.db

    # 1. Cria um contato com dados confidenciais
    contact = db.create_contact(
        Contact(
            name="Doutor Carlos Silveira",
            phone="+55 11 99777-6655",
            email="carlos.silveira@hospitalar.med.br",
            custom_fields={"documento": "CPF 123.456.789-00", "plano": "Enterprise"},
        )
    )

    # 2. Cria uma mensagem com conteúdo confidencial
    msg = db.create_message(
        Message(
            contact_id=contact.id,
            sender="contact",
            content="Dados sigilosos da proposta: Orçamento aprovado de R$ 50.000,00 com pagamento via PIX.",
        )
    )

    # 3. VERIFICAÇÃO DE SEGURANÇA EM REPOUSO:
    # Inspeciona DIRETAMENTE as linhas brutas no SQLite sem passar pelo ORM/decrypter
    with db.connection() as conn:
        raw_contact = conn.execute("SELECT phone, email, custom_fields FROM contacts WHERE id = ?", (contact.id,)).fetchone()
        raw_phone = raw_contact["phone"]
        raw_email = raw_contact["email"]
        raw_cf = raw_contact["custom_fields"]

        # O banco NUNCA deve conter o telefone ou e-mail em texto puro!
        assert raw_phone.startswith("enc:v1:")
        assert "+55 11 99777-6655" not in raw_phone

        assert raw_email.startswith("enc:v1:")
        assert "carlos.silveira@hospitalar.med.br" not in raw_email

        assert raw_cf.startswith("enc:v1:")
        assert "CPF 123.456.789-00" not in raw_cf

        raw_msg = conn.execute("SELECT content FROM messages WHERE id = ?", (msg.id,)).fetchone()
        raw_content = raw_msg["content"]

        # A mensagem NUNCA deve estar em texto puro no SQLite!
        assert raw_content.startswith("enc:v1:")
        assert "Orçamento aprovado de R$ 50.000,00" not in raw_content

    # 4. Transparência para a aplicação autorizada:
    # A chamada de alto nível descriptografa os dados autenticados
    loaded_contact = db.get_contact(contact.id)
    assert loaded_contact.phone == "+55 11 99777-6655"
    assert loaded_contact.email == "carlos.silveira@hospitalar.med.br"
    assert loaded_contact.custom_fields["documento"] == "CPF 123.456.789-00"

    loaded_msgs = db.list_messages(contact.id)
    assert len(loaded_msgs) == 1
    assert "Orçamento aprovado de R$ 50.000,00" in loaded_msgs[0].content

    # 5. Endpoint de auditoria de segurança
    sec_resp = client.get("/api/security/status")
    assert sec_resp.status_code == 200
    sec_data = sec_resp.json()
    assert sec_data["status"] == "active"
    assert sec_data["features"]["data_at_rest_encryption"] is True
    assert sec_data["metrics"]["active_protection"] is True

    # 6. Cabeçalhos HTTP de proteção contra ataques em trânsito
    resp = client.get("/api/stats")
    assert resp.status_code == 200
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("X-Frame-Options") == "SAMEORIGIN"
    assert resp.headers.get("X-Data-Protection") == "OpenChatFunnel-AES256-Encrypted"
