import os
import subprocess
import sys
import pytest
from fastapi.testclient import TestClient

from api.routes import SUSPENSION_MESSAGE, create_app
from core.db import Database, User
from core.security import generate_secure_password, hash_password, verify_password


@pytest.fixture
def test_db_path(tmp_path):
    return str(tmp_path / "test_client_auth.db")


@pytest.fixture
def client(test_db_path):
    app = create_app(db_path=test_db_path, seed_demo=False)
    with TestClient(app) as c:
        yield c, app.state.db


def test_password_hashing_and_generation():
    pwd = generate_secure_password(12)
    assert len(pwd) == 12
    # Contém variedade
    assert any(c.isupper() for c in pwd)
    assert any(c.islower() for c in pwd)
    assert any(c.isdigit() for c in pwd)

    hashed = hash_password(pwd)
    assert hashed != pwd
    assert hashed.startswith("$2b$") or hashed.startswith("$2a$")
    assert verify_password(pwd, hashed) is True
    assert verify_password("wrong-password", hashed) is False


def test_db_user_crud_and_status(test_db_path):
    db = Database(db_path=test_db_path, auto_seed=False)

    pwd = generate_secure_password(12)
    user = User(
        email="cliente1@empresa.com",
        password_hash=hash_password(pwd),
        client_name="Cliente Um",
        company_name="Empresa Alpha Ltda",
        is_active=True,
        status="active",
        must_change_password=True,
    )
    created = db.create_user(user)
    assert created.id is not None
    assert created.email == "cliente1@empresa.com"
    assert created.is_active is True
    assert created.status == "active"
    assert created.must_change_password is True

    # Busca por e-mail (case-insensitive)
    found = db.get_user_by_email("CLIENTE1@EMPRESA.COM")
    assert found is not None
    assert found.client_name == "Cliente Um"

    # Atualiza para suspenso
    suspended = db.update_user_status("cliente1@empresa.com", is_active=False, status="suspended")
    assert suspended.is_active is False
    assert suspended.status == "suspended"

    # Reativa
    reactivated = db.update_user_status("cliente1@empresa.com", is_active=True, status="active")
    assert reactivated.is_active is True
    assert reactivated.status == "active"

    # Listagem
    users = db.list_users()
    assert len(users) == 1


def test_api_auth_login_and_suspension_flow(client):
    c, db = client

    # 1. Cria cliente ativo
    pwd = "MinhaSenhaSegura123!"
    user = User(
        email="contato@lojab2b.com",
        password_hash=hash_password(pwd),
        client_name="Carlos Silva",
        company_name="Loja B2B Móveis",
        is_active=True,
        status="active",
        must_change_password=True,
    )
    db.create_user(user)

    # 2. Login com senha errada
    resp_bad = c.post("/api/auth/login", json={"email": "contato@lojab2b.com", "password": "wrong"})
    assert resp_bad.status_code == 401

    # 3. Login com sucesso
    resp_ok = c.post("/api/auth/login", json={"email": "contato@lojab2b.com", "password": pwd})
    assert resp_ok.status_code == 200
    data = resp_ok.json()
    token = data["access_token"]
    assert token is not None
    assert data["user"]["company_name"] == "Loja B2B Móveis"
    assert data["user"]["must_change_password"] is True

    headers = {"Authorization": f"Bearer {token}"}

    # 4. Acesso a rota protegida /api/auth/me
    resp_me = c.get("/api/auth/me", headers=headers)
    assert resp_me.status_code == 200
    assert resp_me.json()["email"] == "contato@lojab2b.com"

    # 5. BLOQUEIO IMEDIATO POR INADIMPLÊNCIA
    # Enquanto o cliente está com o token ativo e navegador aberto, o status é alterado no banco
    db.update_user_status("contato@lojab2b.com", is_active=False, status="suspended")

    # Próxima requisição com o mesmo token DEVE falhar imediatamente com HTTP 403 e a mensagem exata
    resp_blocked = c.get("/api/auth/me", headers=headers)
    assert resp_blocked.status_code == 403
    assert resp_blocked.json()["detail"] == SUSPENSION_MESSAGE

    # Tentativa de novo login também é rejeitada com 403
    resp_login_blocked = c.post("/api/auth/login", json={"email": "contato@lojab2b.com", "password": pwd})
    assert resp_login_blocked.status_code == 403
    assert resp_login_blocked.json()["detail"] == SUSPENSION_MESSAGE

    # 6. REATIVAÇÃO DO CLIENTE
    db.update_user_status("contato@lojab2b.com", is_active=True, status="active")

    # Acesso restabelecido imediatamente
    resp_reopened = c.get("/api/auth/me", headers=headers)
    assert resp_reopened.status_code == 200
    assert resp_reopened.json()["email"] == "contato@lojab2b.com"

    # 7. Troca de senha
    resp_change = c.post(
        "/api/auth/change-password",
        headers=headers,
        json={"current_password": pwd, "new_password": "NovaSenhaForte456#"},
    )
    assert resp_change.status_code == 200

    # Antiga senha não funciona mais
    resp_login_old = c.post("/api/auth/login", json={"email": "contato@lojab2b.com", "password": pwd})
    assert resp_login_old.status_code == 401

    # Nova senha funciona
    resp_login_new = c.post(
        "/api/auth/login",
        json={"email": "contato@lojab2b.com", "password": "NovaSenhaForte456#"},
    )
    assert resp_login_new.status_code == 200
    assert resp_login_new.json()["user"]["must_change_password"] is False


def test_cli_manage_clients_commands(tmp_path):
    db_file = str(tmp_path / "cli_test.db")
    python_bin = sys.executable
    sub_env = {**os.environ, "PYTHONIOENCODING": "utf-8"}

    # 1. CREATE
    res_create = subprocess.run(
        [
            python_bin,
            "manage_clients.py",
            "--db",
            db_file,
            "create",
            "--name",
            "Auto Pecas Paulista",
            "--email",
            "financeiro@pecaspaulista.com",
            "--company",
            "Auto Pecas Paulista ME",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=sub_env,
    )
    assert res_create.returncode == 0
    stdout_create = res_create.stdout
    assert "Cliente criado com sucesso!" in stdout_create
    assert "Empresa: Auto Pecas Paulista ME" in stdout_create
    assert "Login: financeiro@pecaspaulista.com" in stdout_create
    assert "Senha Provisória:" in stdout_create
    assert "Status: Ativo" in stdout_create

    # 2. LIST
    res_list = subprocess.run(
        [python_bin, "manage_clients.py", "--db", db_file, "list"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=sub_env,
    )
    assert res_list.returncode == 0
    assert "financeiro@pecaspaulista.com" in res_list.stdout
    assert "Ativo" in res_list.stdout

    # 3. BLOCK
    res_block = subprocess.run(
        [
            python_bin,
            "manage_clients.py",
            "--db",
            db_file,
            "block",
            "--email",
            "financeiro@pecaspaulista.com",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=sub_env,
    )
    assert res_block.returncode == 0
    assert "Cliente bloqueado com sucesso!" in res_block.stdout
    assert "Status: Suspenso (Acesso revogado imediatamente)" in res_block.stdout

    # 4. LIST após bloqueio
    res_list_blocked = subprocess.run(
        [python_bin, "manage_clients.py", "--db", db_file, "list"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=sub_env,
    )
    assert "Suspenso" in res_list_blocked.stdout

    # 5. UNBLOCK
    res_unblock = subprocess.run(
        [
            python_bin,
            "manage_clients.py",
            "--db",
            db_file,
            "unblock",
            "--email",
            "financeiro@pecaspaulista.com",
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        env=sub_env,
    )
    assert res_unblock.returncode == 0
    assert "Cliente reativado com sucesso!" in res_unblock.stdout
    assert "Status: Ativo (Acesso liberado)" in res_unblock.stdout
