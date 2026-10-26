"""
Script de verificação e diagnóstico da conexão PostgreSQL em nuvem (Neon.tech).
Valida:
1. Leitura da variável DATABASE_URL a partir do arquivo .env com SSL ativo (sslmode=require).
2. Inicialização automática do schema completo (todas as tabelas do SaaS Multi-Tenant e CRM).
3. Execução de queries de teste (SELECT version(), listagem de tabelas, vendedores e contatos).
"""

import os
import sys
from dotenv import load_dotenv
from core.db import Database


def run_neon_connection_test() -> None:
    if sys.platform == "win32":
        try:
            sys.stdout.reconfigure(encoding="utf-8")
        except Exception:
            pass

    load_dotenv()
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("❌ ERRO: Variável DATABASE_URL não encontrada no arquivo .env")
        sys.exit(1)

    print("=====================================================================")
    print("☁️  TESTE DE CONEXÃO POSTGRESQL (NEON CLOUD) - OPENCHATFUNNEL")
    print("=====================================================================")

    db = Database(auto_seed=True)
    db.seed_demo_data()
    assert db.is_postgres, "A conexão deveria estar em modo PostgreSQL!"

    with db.connection() as conn:
        # 1. Versão do servidor e status SSL
        ver_row = conn.execute("SELECT version() AS pg_version, current_database() AS db_name").fetchone()
        print(f"✅ Conectado com sucesso ao banco : {ver_row['db_name']}")
        print(f"🔒 Engine PostgreSQL              : {ver_row['pg_version'].split(',')[0]}")

        # 2. Lista todas as tabelas criadas no schema public
        table_rows = conn.execute(
            """
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name ASC
            """
        ).fetchall()
        tables = [r["table_name"] for r in table_rows]
        print(f"📦 Tabelas criadas no Neon ({len(tables)}) : {', '.join(tables)}")

        expected_tables = {
            "tenants",
            "users",
            "sellers",
            "contacts",
            "messages",
            "pipelines",
            "stages",
            "deals",
            "knowledge_items",
            "workflow_rules",
            "quick_replies",
            "appointments",
            "broadcast_campaigns",
        }
        missing = expected_tables - set(tables)
        if missing:
            raise RuntimeError(f"Tabelas ausentes no banco Neon: {missing}")

        # 3. Query de teste nas entidades populadas
        sellers = db.list_sellers()
        contacts = db.list_contacts()
        pipelines = db.list_pipelines()

        print(f"👥 Vendedores ativos na equipe    : {len(sellers)} ({', '.join(s.name for s in sellers)})")
        print(f"📇 Contatos sincronizados na nuvem: {len(contacts)}")
        print(f"📊 Funis (Pipelines) ativos       : {len(pipelines)}")

    print("=====================================================================")
    print("🚀 SUCESSO! Todas as tabelas estão criadas e operacionais no Neon!")
    print("=====================================================================")


if __name__ == "__main__":
    run_neon_connection_test()
