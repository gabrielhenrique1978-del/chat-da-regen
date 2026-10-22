#!/usr/bin/env python3
"""
CLI Administrativo de Gestão de Clientes - OpenChatFunnel / Chat da Regen.
Permite provisionar contas manualmente, gerar senhas provisórias seguras
e revogar/reativar o acesso imediatamente por inadimplência ou controle de status.
"""

import argparse
import os
import sys
from pathlib import Path
from typing import Optional

# Garante saída UTF-8 no Windows
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

# Garante que o diretório raiz do projeto esteja no sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Carrega arquivo .env local se existir
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, val = line.split("=", 1)
                    key = key.strip()
                    val = val.strip().strip("\"'")
                    if key and key not in os.environ:
                        os.environ[key] = val
    except Exception:
        pass

from core.db import Database, User
from core.security import generate_secure_password, hash_password


def get_db(db_path: Optional[str] = None) -> Database:
    resolved_path = db_path or os.getenv("DATABASE_PATH", "openchatfunnel.db")
    return Database(db_path=resolved_path, auto_seed=False)


def handle_create(args):
    db = get_db(args.db)
    email = args.email.strip().lower()
    name = args.name.strip()
    company = (args.company or name).strip()

    if not email or "@" not in email:
        print(f"Erro: O e-mail '{email}' fornecido é inválido.", file=sys.stderr)
        sys.exit(1)

    existing = db.get_user_by_email(email)
    if existing:
        print(f"Erro: Já existe um cliente cadastrado com o e-mail '{email}'.", file=sys.stderr)
        sys.exit(1)

    temp_password = generate_secure_password(length=12)
    pwd_hash = hash_password(temp_password)

    user = User(
        email=email,
        password_hash=pwd_hash,
        client_name=name,
        company_name=company,
        is_active=True,
        status="active",
        must_change_password=True,
    )
    created_user = db.create_user(user)

    print("-------------------------------------------")
    print("Cliente criado com sucesso!")
    print(f"Empresa: {company}")
    print(f"Login: {email}")
    print(f"Senha Provisória: {temp_password}")
    print("Status: Ativo")
    print("-------------------------------------------")
    return created_user


def handle_block(args):
    db = get_db(args.db)
    email = args.email.strip().lower()

    user = db.get_user_by_email(email)
    if not user:
        print(f"Erro: Nenhum cliente encontrado com o e-mail '{email}'.", file=sys.stderr)
        sys.exit(1)

    updated = db.update_user_status(email, is_active=False, status="suspended")
    if not updated:
        print(f"Erro: Falha ao suspender o cliente '{email}'.", file=sys.stderr)
        sys.exit(1)

    print("-------------------------------------------")
    print("Cliente bloqueado com sucesso!")
    print(f"Empresa: {updated.company_name or updated.client_name}")
    print(f"Login: {updated.email}")
    print("Status: Suspenso (Acesso revogado imediatamente)")
    print("-------------------------------------------")
    return updated


def handle_unblock(args):
    db = get_db(args.db)
    email = args.email.strip().lower()

    user = db.get_user_by_email(email)
    if not user:
        print(f"Erro: Nenhum cliente encontrado com o e-mail '{email}'.", file=sys.stderr)
        sys.exit(1)

    updated = db.update_user_status(email, is_active=True, status="active")
    if not updated:
        print(f"Erro: Falha ao reativar o cliente '{email}'.", file=sys.stderr)
        sys.exit(1)

    print("-------------------------------------------")
    print("Cliente reativado com sucesso!")
    print(f"Empresa: {updated.company_name or updated.client_name}")
    print(f"Login: {updated.email}")
    print("Status: Ativo (Acesso liberado)")
    print("-------------------------------------------")
    return updated


def handle_list(args):
    db = get_db(args.db)
    users = db.list_users()

    if not users:
        print("Nenhum cliente cadastrado no momento.")
        return

    print("=" * 96)
    print(f"{'EMPRESA / NOME':<24} | {'EMAIL':<34} | {'STATUS':<12} | {'CRIADO EM':<16}")
    print("=" * 96)

    for u in users:
        display_name = (u.company_name or u.client_name)[:22]
        display_email = u.email[:34]
        status_label = "Ativo" if (u.is_active and u.status == "active") else "Suspenso"
        created_display = u.created_at[:10] if u.created_at else "—"
        print(f"{display_name:<24} | {display_email:<34} | {status_label:<12} | {created_display:<16}")

    print("=" * 96)
    print(f"Total: {len(users)} cliente(s)")


def main():
    parser = argparse.ArgumentParser(
        prog="manage_clients.py",
        description="CLI Administrativo para Gerenciamento de Clientes e Bloqueio de Inadimplência",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="Caminho personalizado do banco SQLite (padrão: env DATABASE_PATH ou openchatfunnel.db)",
    )

    subparsers = parser.add_subparsers(dest="command", required=True, help="Subcomandos disponíveis")

    # Comando CREATE
    create_parser = subparsers.add_parser("create", help="Cadastra um novo cliente com senha provisória")
    create_parser.add_argument("--name", required=True, help="Nome do cliente ou da empresa")
    create_parser.add_argument("--email", required=True, help="E-mail exclusivo de login do cliente")
    create_parser.add_argument("--company", required=False, default=None, help="Nome da empresa (opcional)")
    create_parser.set_defaults(func=handle_create)

    # Comando BLOCK
    block_parser = subparsers.add_parser("block", help="Bloqueia imediatamente o acesso do cliente por inadimplência")
    block_parser.add_argument("--email", required=True, help="E-mail do cliente a ser suspenso")
    block_parser.set_defaults(func=handle_block)

    # Comando UNBLOCK
    unblock_parser = subparsers.add_parser("unblock", help="Desbloqueia e reativa o acesso do cliente")
    unblock_parser.add_argument("--email", required=True, help="E-mail do cliente a ser reativado")
    unblock_parser.set_defaults(func=handle_unblock)

    # Comando LIST
    list_parser = subparsers.add_parser("list", help="Lista todos os clientes e respectivos status")
    list_parser.set_defaults(func=handle_list)

    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
