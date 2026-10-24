import pytest
from fastapi.testclient import TestClient

from api.routes import create_app, TENANT_SUSPENSION_MESSAGE
from core.db import Database, Tenant, User
from core.security import hash_password


@pytest.fixture
def test_db_path(tmp_path):
    return str(tmp_path / "test_saas_multitenant.db")


@pytest.fixture
def client(test_db_path):
    app = create_app(db_path=test_db_path, seed_demo=False)
    with TestClient(app) as c:
        yield c, app.state.db, test_db_path


def test_saas_superadmin_and_tenant_suspension_flow(client):
    c, db, db_path = client

    # -------------------------------------------------------------
    # 1. Cria o Super Admin Master usando init_superadmin
    # -------------------------------------------------------------
    from init_superadmin import init_superadmin
    super_admin = init_superadmin(
        email="master@plataforma.com",
        name="Proprietário SaaS",
        password="MasterPassword123!",
        force=True,
        db_path=db_path,
    )
    assert super_admin.role == "super_admin"
    assert super_admin.is_active is True

    # -------------------------------------------------------------
    # 2. Login do Super Admin e obtenção de token JWT Master
    # -------------------------------------------------------------
    login_super = c.post(
        "/api/auth/login",
        json={"email": "master@plataforma.com", "password": "MasterPassword123!"},
    )
    assert login_super.status_code == 200
    token_super = login_super.json()["access_token"]
    headers_super = {"Authorization": f"Bearer {token_super}"}
    assert login_super.json()["user"]["role"] == "super_admin"

    # -------------------------------------------------------------
    # 3. Super Admin lista empresas (atualmente vazia)
    # -------------------------------------------------------------
    resp_list_initial = c.get("/api/admin/tenants", headers=headers_super)
    assert resp_list_initial.status_code == 200
    assert resp_list_initial.json()["tenants"] == []

    # -------------------------------------------------------------
    # 4. Super Admin cadastra nova Empresa Cliente (Tenant) B2B
    # -------------------------------------------------------------
    resp_create_tenant = c.post(
        "/api/admin/tenants",
        headers=headers_super,
        json={
            "name": "Ótica Visão Ltda",
            "admin_name": "Roberto Silva",
            "admin_email": "roberto@oticavisao.com.br",
        },
    )
    assert resp_create_tenant.status_code == 200
    data_tenant = resp_create_tenant.json()
    tenant_id = data_tenant["tenant"]["id"]
    temp_pwd = data_tenant["temporary_password"]
    assert data_tenant["tenant"]["name"] == "Ótica Visão Ltda"
    assert data_tenant["tenant"]["is_active"] is True
    assert data_tenant["tenant"]["status"] == "active"
    assert "Ótica Visão Ltda" in data_tenant["whatsapp_message"]
    assert "roberto@oticavisao.com.br" in data_tenant["whatsapp_message"]

    # -------------------------------------------------------------
    # 5. Login do Administrador da Empresa Cliente
    # -------------------------------------------------------------
    login_client = c.post(
        "/api/auth/login",
        json={"email": "roberto@oticavisao.com.br", "password": temp_pwd},
    )
    assert login_client.status_code == 200
    token_client = login_client.json()["access_token"]
    headers_client = {"Authorization": f"Bearer {token_client}"}
    assert login_client.json()["user"]["tenant_id"] == tenant_id
    assert login_client.json()["user"]["role"] == "admin"

    # Cliente consegue acessar rota protegida normalmente
    resp_me_ok = c.get("/api/auth/me", headers=headers_client)
    assert resp_me_ok.status_code == 200
    assert resp_me_ok.json()["company_name"] == "Ótica Visão Ltda"

    # Cliente comum NÃO pode acessar rotas do Super Admin
    resp_forbidden_admin = c.get("/api/admin/tenants", headers=headers_client)
    assert resp_forbidden_admin.status_code == 403
    assert "Acesso restrito ao Administrador Master" in resp_forbidden_admin.json()["detail"]

    # -------------------------------------------------------------
    # 6. Super Admin BLOQUEIA a Empresa Cliente por Inadimplência
    # -------------------------------------------------------------
    resp_block = c.patch(f"/api/admin/tenants/{tenant_id}/toggle-status", headers=headers_super)
    assert resp_block.status_code == 200
    assert resp_block.json()["tenant"]["is_active"] is False
    assert resp_block.json()["tenant"]["status"] == "suspended"

    # -------------------------------------------------------------
    # 7. BLOQUEIO REAL-TIME: Qualquer requisição do cliente é abortada com 403!
    # -------------------------------------------------------------
    resp_me_blocked = c.get("/api/auth/me", headers=headers_client)
    assert resp_me_blocked.status_code == 403
    assert resp_me_blocked.json()["detail"] == TENANT_SUSPENSION_MESSAGE

    # Tentativa de novo login pelo cliente bloqueado também é rejeitada com 403
    login_client_blocked = c.post(
        "/api/auth/login",
        json={"email": "roberto@oticavisao.com.br", "password": temp_pwd},
    )
    assert login_client_blocked.status_code == 403
    assert login_client_blocked.json()["detail"] == TENANT_SUSPENSION_MESSAGE

    # O Super Admin continua com acesso irrestrito e normal
    resp_super_still_ok = c.get("/api/auth/me", headers=headers_super)
    assert resp_super_still_ok.status_code == 200
    assert resp_super_still_ok.json()["role"] == "super_admin"

    # -------------------------------------------------------------
    # 8. Super Admin DESBLOQUEIA a Empresa Cliente após quitação
    # -------------------------------------------------------------
    resp_unblock = c.patch(f"/api/admin/tenants/{tenant_id}/toggle-status", headers=headers_super)
    assert resp_unblock.status_code == 200
    assert resp_unblock.json()["tenant"]["is_active"] is True
    assert resp_unblock.json()["tenant"]["status"] == "active"

    # Cliente volta a ter acesso liberado imediatamente
    resp_me_restored = c.get("/api/auth/me", headers=headers_client)
    assert resp_me_restored.status_code == 200
    assert resp_me_restored.json()["company_name"] == "Ótica Visão Ltda"
