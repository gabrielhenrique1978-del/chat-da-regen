import pytest
from fastapi.testclient import TestClient

from api.routes import create_app
from core.db import Database, Contact, Message


@pytest.fixture
def test_db_path(tmp_path):
    return str(tmp_path / "test_team_attribution.db")


@pytest.fixture
def client(test_db_path):
    app = create_app(db_path=test_db_path, seed_demo=False)
    with TestClient(app) as c:
        yield c, app.state.db


def test_sellers_crud(client):
    c, db = client

    # 1. Lista vendedores (popula padrão da loja se vazio)
    resp = c.get("/api/sellers")
    assert resp.status_code == 200
    sellers = resp.json()["sellers"]
    assert len(sellers) >= 5
    seller_names = [s["name"] for s in sellers]
    assert "Lucas Silva" in seller_names
    assert "Camila Santos" in seller_names

    # 2. Cadastra novo vendedor
    resp_new = c.post(
        "/api/sellers",
        json={"name": "Bruno Souza", "email": "bruno@loja.com", "phone": "+55 11 99999-1234"},
    )
    assert resp_new.status_code == 200
    data_new = resp_new.json()
    assert data_new["name"] == "Bruno Souza"

    # Confirma persistência
    resp2 = c.get("/api/sellers")
    names2 = [s["name"] for s in resp2.json()["sellers"]]
    assert "Bruno Souza" in names2


def test_vendedor_pega_conversa_e_fixa_atendimento(client):
    c, db = client

    # Cria lead que acabou de chegar pelo WhatsApp da loja
    contact = db.create_contact(
        Contact(
            name="Mariana Lopes",
            phone="+55 11 98888-0001",
            channel="whatsapp",
            assignee="Agente IA",
            ai_enabled=True,
            attendance_status="bot",
        )
    )

    # Vendedor Lucas Silva clica em "Pegar Conversa (Fixar Comigo)"
    resp_assign = c.patch(
        f"/api/contacts/{contact.id}/assign",
        json={
            "assignee": "Lucas Silva",
            "ai_enabled": False,
            "attendance_status": "human",
            "operator_name": "Lucas Silva",
        },
    )
    assert resp_assign.status_code == 200
    updated = resp_assign.json()
    assert updated["assignee"] == "Lucas Silva"
    assert updated["ai_enabled"] is False
    assert updated["attendance_status"] == "human"

    # Confirma que gerou nota interna de auditoria para a equipe
    messages = db.list_messages(contact.id, include_internal=True)
    internal_notes = [m for m in messages if m.is_internal or m.sender == "internal"]
    assert len(internal_notes) >= 1
    assert "Lucas Silva assumiu a conversa deste cliente" in internal_notes[-1].content
    assert "WHATSAPP" in internal_notes[-1].content


def test_transferencia_entre_vendedores_com_auditoria(client):
    c, db = client

    # Lead já em atendimento com Lucas
    contact = db.create_contact(
        Contact(
            name="Ricardo Teixeira",
            phone="+55 11 97777-0002",
            channel="whatsapp",
            assignee="Lucas Silva",
            ai_enabled=False,
            attendance_status="human",
        )
    )

    # Lucas transfere para Camila com motivo
    resp_transfer = c.patch(
        f"/api/contacts/{contact.id}/assign",
        json={
            "assignee": "Camila Santos",
            "ai_enabled": False,
            "attendance_status": "human",
            "operator_name": "Lucas Silva",
            "transfer_reason": "Cliente solicitou atendimento sobre pedidos de atacado",
        },
    )
    assert resp_transfer.status_code == 200
    updated = resp_transfer.json()
    assert updated["assignee"] == "Camila Santos"

    # Confirma registro da transferência nas notas internas
    messages = db.list_messages(contact.id, include_internal=True)
    internal_notes = [m for m in messages if m.is_internal or m.sender == "internal"]
    assert len(internal_notes) >= 1
    last_note = internal_notes[-1].content
    assert "transferida de Lucas Silva para Camila Santos por Lucas Silva" in last_note
    assert "pedidos de atacado" in last_note


def test_resposta_humana_atribui_automaticamente(client):
    c, db = client

    # Lead novo ainda com robô
    contact = db.create_contact(
        Contact(
            name="Julio Cesar",
            phone="+55 11 96666-0003",
            channel="whatsapp",
            assignee="Agente IA",
            ai_enabled=True,
            attendance_status="bot",
        )
    )

    # Vendedor Matheus responde direto pelo chat
    resp_send = c.post(
        "/api/messages/send",
        json={
            "contact_id": contact.id,
            "content": "Olá Julio! Aqui é o Matheus da loja, como posso te ajudar?",
            "sender": "human",
            "sender_name": "Matheus Oliveira",
            "is_internal": False,
        },
    )
    assert resp_send.status_code == 200

    # Confirma que o cliente foi automaticamente fixado com o Matheus e a IA foi pausada
    c_updated = db.get_contact(contact.id)
    assert c_updated.assignee == "Matheus Oliveira"
    assert c_updated.ai_enabled is False
    assert c_updated.attendance_status == "human"


def test_devolver_para_robo(client):
    c, db = client

    contact = db.create_contact(
        Contact(
            name="Bianca Lima",
            phone="+55 11 95555-0004",
            channel="whatsapp",
            assignee="Lucas Silva",
            ai_enabled=False,
            attendance_status="human",
        )
    )

    # Devolve para a IA
    resp_bot = c.patch(
        f"/api/contacts/{contact.id}/assign",
        json={
            "assignee": "Agente IA",
            "ai_enabled": True,
            "attendance_status": "bot",
            "operator_name": "Lucas Silva",
        },
    )
    assert resp_bot.status_code == 200
    c_updated = db.get_contact(contact.id)
    assert c_updated.assignee == "Agente IA"
    assert c_updated.ai_enabled is True
    assert c_updated.attendance_status == "bot"


def test_chat_bloqueado_para_outros_vendedores_e_apos_transferencia(client):
    c, db = client

    # 1. Lead inicialmente fixado com o vendedor Lucas Silva
    contact = db.create_contact(
        Contact(
            name="Fernanda Alencar",
            phone="+55 11 94444-0005",
            channel="whatsapp",
            assignee="Lucas Silva",
            ai_enabled=False,
            attendance_status="human",
        )
    )

    # 2. Lucas Silva consegue mandar mensagem normalmente
    resp_lucas = c.post(
        "/api/messages/send",
        json={
            "contact_id": contact.id,
            "content": "Olá Fernanda, tudo bem? Lucas aqui da loja.",
            "sender": "human",
            "sender_name": "Lucas Silva",
            "is_internal": False,
        },
    )
    assert resp_lucas.status_code == 200

    # 3. Camila Santos tenta mandar mensagem para este cliente -> BLOQUEADO COM 403!
    resp_camila_blocked = c.post(
        "/api/messages/send",
        json={
            "contact_id": contact.id,
            "content": "Oi Fernanda, quer fechar o pedido comigo?",
            "sender": "human",
            "sender_name": "Camila Santos",
            "is_internal": False,
        },
    )
    assert resp_camila_blocked.status_code == 403
    assert "Chat bloqueado" in resp_camila_blocked.json()["detail"]
    assert "Lucas Silva" in resp_camila_blocked.json()["detail"]

    # 4. Outro vendedor tenta enviar áudio -> BLOQUEADO COM 403!
    resp_audio_blocked = c.post(
        "/api/whatsapp/send-audio",
        json={
            "contact_id": contact.id,
            "audio_base64": "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",
            "sender_name": "Bruno Souza",
        },
    )
    assert resp_audio_blocked.status_code == 403
    assert "Chat bloqueado" in resp_audio_blocked.json()["detail"]

    # 5. Nota interna da equipe continua permitida para colaboração entre colegas
    resp_note = c.post(
        "/api/messages/send",
        json={
            "contact_id": contact.id,
            "content": "Lucas, a cliente ligou aqui no balcão avisando que vem às 16h.",
            "sender": "internal",
            "is_internal": True,
        },
    )
    assert resp_note.status_code == 200

    # 6. Lucas Silva transfere a cliente para Camila Santos
    resp_transfer = c.patch(
        f"/api/contacts/{contact.id}/assign",
        json={
            "assignee": "Camila Santos",
            "ai_enabled": False,
            "attendance_status": "human",
            "operator_name": "Lucas Silva",
            "transfer_reason": "Passando atendimento para Camila acompanhar",
        },
    )
    assert resp_transfer.status_code == 200
    assert resp_transfer.json()["assignee"] == "Camila Santos"

    # 7. Agora Camila Santos consegue mandar mensagem
    resp_camila_ok = c.post(
        "/api/messages/send",
        json={
            "contact_id": contact.id,
            "content": "Olá Fernanda, agora sou eu (Camila) que vou te acompanhar!",
            "sender": "human",
            "sender_name": "Camila Santos",
            "is_internal": False,
        },
    )
    assert resp_camila_ok.status_code == 200

    # 8. E Lucas Silva agora está com o chat BLOQUEADO com 403 para esta cliente!
    resp_lucas_after_transfer = c.post(
        "/api/messages/send",
        json={
            "contact_id": contact.id,
            "content": "Fernanda, esqueci de te avisar uma coisa...",
            "sender": "human",
            "sender_name": "Lucas Silva",
            "is_internal": False,
        },
    )
    assert resp_lucas_after_transfer.status_code == 403
    assert "Chat bloqueado" in resp_lucas_after_transfer.json()["detail"]
    assert "Camila Santos" in resp_lucas_after_transfer.json()["detail"]

