#!/usr/bin/env python3
"""
Script de Inicialização do Usuário Super Admin (Master)
Plataforma SaaS Multi-Tenant - Chat da Regen / OpenChatFunnel.

Cria ou verifica o usuário Master com role="super_admin", garantindo permissões
globais irrestritas para gerenciar empresas clientes (Tenants), inadimplência e bloqueios.
"""

import argparse
import os
import sys
from pathlib import Path

# Configuração de encoding UTF-8 no Windows
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

# Adiciona diretório raiz ao sys.path
BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

# Carrega variáveis de ambiente do .env
ENV_FILE = BASE_DIR / ".env"
if ENV_FILE.exists():
    try:
        with open(ENV_FILE, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip().strip("\"'")
                    if k and k not in os.environ:
                        os.environ[k] = v
    except Exception:
        pass

from core.db import Database, User
from core.security import generate_secure_password, hash_password


def init_superadmin(email: str, name: str, password: str = None, force: bool = False, db_path: str = None):
    resolved_db = db_path or os.getenv("DATABASE_PATH", "openchatfunnel.db")
    db = Database(db_path=resolved_db, auto_seed=False)

    email_clean = (email or os.getenv("SUPERADMIN_EMAIL", "superadmin@master.com")).strip().lower()
    name_clean = (name or os.getenv("SUPERADMIN_NAME", "Super Admin Master")).strip()

    # Verifica se já existe um super_admin com este email ou com role super_admin
    existing_by_email = db.get_user_by_email(email_clean)
    existing_super = db.get_super_admin()

    target_user = existing_by_email or existing_super

    if target_user and not force:
        print("=======================================================")
        print(" [INFO] Usuário Super Admin já configurado no sistema! ")
        print("=======================================================")
        print(f" Nome:       {target_user.client_name}")
        print(f" Email:      {target_user.email}")
        print(f" Role:       {target_user.role}")
        print(f" Status:     {'Ativo' if target_user.is_active else 'Suspenso'}")
        print(f" ID:         {target_user.id}")
        print("=======================================================")
        print(" Dica: Para redefinir a senha do Super Admin, execute:")
        print(" python init_superadmin.py --force --password \"SuaNovaSenha123!\"")
        print("=======================================================")
        return target_user

    # Gera senha se não fornecida
    pwd_to_use = password.strip() if password else os.getenv("SUPERADMIN_PASSWORD")
    is_generated = False
    if not pwd_to_use:
        pwd_to_use = generate_secure_password(length=14)
        is_generated = True

    pwd_hash = hash_password(pwd_to_use)

    if target_user and force:
        # Atualiza a senha e garante role super_admin
        db.update_user_password(target_user.email, pwd_hash)
        with db.connection() as conn:
            conn.execute(
                "UPDATE users SET role = 'super_admin', is_active = 1, status = 'active' WHERE lower(email) = lower(?)",
                (target_user.email,),
            )
        updated_user = db.get_user_by_email(target_user.email)
        print("=======================================================")
        print(" [SUCESSO] Senha e Permissões do Super Admin Redefinidas! ")
        print("=======================================================")
        print(f" Nome:       {updated_user.client_name}")
        print(f" Email:      {updated_user.email}")
        print(f" Nova Senha: {pwd_to_use}")
        print(f" Role:       {updated_user.role}")
        print("=======================================================")
        return updated_user

    # Cria novo Super Admin
    new_super = User(
        tenant_id=None,  # Super Admin não está preso a nenhum tenant cliente específico
        email=email_clean,
        password_hash=pwd_hash,
        client_name=name_clean,
        company_name="Plataforma Master (Proprietário)",
        role="super_admin",
        is_active=True,
        status="active",
        must_change_password=False,
    )
    created = db.create_user(new_super)

    print("=======================================================")
    print(" [SUCESSO] USUÁRIO SUPER ADMIN CRIADO COM SUCESSO!     ")
    print("=======================================================")
    print(f" Nome:       {created.client_name}")
    print(f" Login:      {created.email}")
    print(f" Senha:      {pwd_to_use}")
    if is_generated:
        print(" (Senha segura gerada automaticamente)")
    print(f" Perfil:     {created.role} (Acesso Master Irrestrito)")
    print(" Status:     Ativo (Liberação Master)")
    print("=======================================================")
    print(" Agora você pode fazer login no sistema e acessar as rotas")
    print(" de gestão de empresas clientes em /api/admin/tenants.")
    print("=======================================================")
    return created


def main():
    parser = argparse.ArgumentParser(
        description="Inicializador do Usuário Master / Super Admin da plataforma SaaS Multi-Tenant."
    )
    parser.add_argument(
        "--email",
        default=os.getenv("SUPERADMIN_EMAIL", "superadmin@master.com"),
        help="E-mail do Super Admin (padrão: superadmin@master.com ou SUPERADMIN_EMAIL do .env)",
    )
    parser.add_argument(
        "--name",
        default=os.getenv("SUPERADMIN_NAME", "Super Admin Master"),
        help="Nome do Super Admin (padrão: Super Admin Master)",
    )
    parser.add_argument(
        "--password",
        default=None,
        help="Senha desejada para o Super Admin (se omitida, gera uma senha aleatória segura)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Força a redefinição da senha caso o Super Admin já exista",
    )
    parser.add_argument(
        "--db",
        default=None,
        help="Caminho do arquivo SQLite (padrão: openchatfunnel.db)",
    )

    args = parser.parse_args()
    init_superadmin(
        email=args.email,
        name=args.name,
        password=args.password,
        force=args.force,
        db_path=args.db,
    )


if __name__ == "__main__":
    main()
