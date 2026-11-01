import json
import os
import sqlite3
import threading
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

from core.security import (
    CIPHER_PREFIX,
    blind_index,
    decrypt_dict,
    decrypt_field,
    encrypt_dict,
    encrypt_field,
    mask_pii,
)


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def future_iso(hours: int = 24) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).strftime("%Y-%m-%dT%H:00")


def new_uuid() -> str:
    return str(uuid.uuid4())


# =====================================================================
# Modelos de Domínio (Pydantic)
# =====================================================================


class Contact(BaseModel):
    id: str = Field(default_factory=new_uuid)
    tenant_id: str = "master"
    name: str
    phone: Optional[str] = None
    phone_hash: Optional[str] = None
    email: Optional[str] = None
    channel: str = "whatsapp"  # whatsapp, instagram, web
    seller_id: Optional[str] = None
    assignee: Optional[str] = "Agente IA"
    ai_enabled: bool = True
    attendance_status: str = "bot"  # bot, waiting, human, closed
    temperature: str = "warm"  # hot, warm, cold
    lead_score: int = 50
    consent_status: str = "opted_in"  # opted_in, opted_out, anonymized
    unread_count: int = 0
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class AuditLog(BaseModel):
    """
    Registro de Auditoria Imutável (LGPD Art. 37 / Segurança da Informação).
    Registra acessos, espelhamento de conta (supervisor), exportação de dados e anonimização.
    """
    id: str = Field(default_factory=new_uuid)
    tenant_id: str = "master"
    actor: str
    actor_role: str = "seller"
    action: str
    target_type: str = "contact"
    target_id: Optional[str] = None
    details: str = ""
    ip_address: Optional[str] = None
    timestamp: str = Field(default_factory=utc_now_iso)


class Message(BaseModel):
    id: str = Field(default_factory=new_uuid)
    contact_id: str
    sender: str  # contact, agent, human, system, internal
    channel: str = "whatsapp"
    content: str
    is_internal: bool = False  # Nota interna (Sussurro/Whisper visível só para equipe)
    media_type: str = "text"  # text, audio, document, template
    media_url: Optional[str] = None
    external_id: Optional[str] = None  # wamid / mid da API Oficial da Meta
    delivery_status: str = "sent"  # sent, delivered, read, failed
    timestamp: str = Field(default_factory=utc_now_iso)


class KnowledgeItem(BaseModel):
    id: str = Field(default_factory=new_uuid)
    question: str
    answer: str
    category: str = "Geral"
    tags: List[str] = Field(default_factory=list)


class Pipeline(BaseModel):
    id: str = Field(default_factory=new_uuid)
    name: str
    description: str = ""


class Stage(BaseModel):
    id: str = Field(default_factory=new_uuid)
    pipeline_id: str
    name: str
    order: int
    is_won: bool = False
    is_lost: bool = False


class Deal(BaseModel):
    id: str = Field(default_factory=new_uuid)
    contact_id: str
    pipeline_id: str
    stage_id: str
    title: str
    value: float = 0.0
    status: str = "open"  # open, won, lost
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class WorkflowRule(BaseModel):
    id: str = Field(default_factory=new_uuid)
    name: str
    trigger_type: str  # keyword, tag, stage_change
    trigger_value: str
    actions: List[Dict[str, Any]] = Field(default_factory=list)
    active: bool = True


class QuickReply(BaseModel):
    id: str = Field(default_factory=new_uuid)
    shortcut: str  # ex: /pix, /proposta, /boasvindas
    title: str
    content: str
    category: str = "Vendas"


class Appointment(BaseModel):
    id: str = Field(default_factory=new_uuid)
    contact_id: str
    deal_id: Optional[str] = None
    title: str
    scheduled_at: str = Field(default_factory=lambda: future_iso(24))
    duration_minutes: int = 30
    meeting_link: str = "https://meet.regenflow.local/demo-call"
    status: str = "scheduled"  # scheduled, completed, cancelled
    notes: str = ""
    created_at: str = Field(default_factory=utc_now_iso)


class BroadcastCampaign(BaseModel):
    id: str = Field(default_factory=new_uuid)
    name: str
    channel: str = "all"  # all, whatsapp, instagram, web
    target_tag: Optional[str] = None
    target_stage_id: Optional[str] = None
    template_content: str
    sent_count: int = 0
    created_at: str = Field(default_factory=utc_now_iso)


class Tenant(BaseModel):
    """
    Modelo de Empresa Cliente (Tenant) na arquitetura SaaS Multi-Tenant.
    is_active é a trava mestra de inadimplência/liberação.
    """
    id: str = Field(default_factory=new_uuid)
    name: str
    status: str = "active"  # "active", "suspended", "canceled"
    is_active: bool = True
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class User(BaseModel):
    """
    Modelo de Usuário vinculado a uma Empresa Cliente (Tenant) ou Super Admin Master.
    """
    id: str = Field(default_factory=new_uuid)
    tenant_id: Optional[str] = None
    email: str
    password_hash: str
    client_name: str
    company_name: Optional[str] = None
    role: str = "admin"  # "super_admin" (Master), "admin" (Dono da empresa cliente), "user" (Operador)
    is_active: bool = True
    status: str = "active"  # "active", "suspended", "canceled"
    must_change_password: bool = True
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class Seller(BaseModel):
    """
    Modelo de Vendedor / Atendente / Supervisor da Loja para distribuição,
    posse de conversas, autenticação individual por PIN e modo supervisor.
    """
    id: str = Field(default_factory=new_uuid)
    tenant_id: str = "master"
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    pin: str = "1234"
    role: str = "seller"  # "seller" ou "supervisor"
    active: bool = True
    created_at: str = Field(default_factory=utc_now_iso)


class MetaConfig(BaseModel):
    """
    Configuração da API Oficial da Meta (WhatsApp Cloud API & Instagram Graph API)
    com suporte Multi-Tenant (por empresa cliente ou Master).
    """
    id: str = Field(default_factory=new_uuid)
    tenant_id: str = "master"
    phone_number_id: Optional[str] = None
    waba_id: Optional[str] = None
    ig_account_id: Optional[str] = None
    access_token: Optional[str] = None
    verify_token: str = "regenflow_meta_verify_2026"
    app_secret: Optional[str] = None
    enabled: bool = True
    updated_at: str = Field(default_factory=utc_now_iso)



# =====================================================================
# Camada de Persistência Híbrida (PostgreSQL Neon / SQLite)
# =====================================================================


class _PostgresConnectionAdapter:
    """Adaptador de conexão PostgreSQL (psycopg) compatível com a interface SQLite do Database."""

    def __init__(self, pg_conn):
        self._conn = pg_conn

    @staticmethod
    def _translate_sql(sql: str) -> str:
        translated = sql.replace("?", "%s")
        if "INSERT OR IGNORE INTO sellers" in translated:
            translated = translated.replace("INSERT OR IGNORE INTO sellers", "INSERT INTO sellers")
            translated = translated.rstrip().rstrip(";") + " ON CONFLICT (name) DO NOTHING"
        return translated

    def execute(self, sql: str, params: tuple = ()):
        translated = self._translate_sql(sql)
        return self._conn.execute(translated, params)

    def executescript(self, script: str):
        statements = [stmt.strip() for stmt in script.split(";") if stmt.strip()]
        for stmt in statements:
            self._conn.execute(stmt)

    def commit(self):
        self._conn.commit()

    def rollback(self):
        self._conn.rollback()

    def close(self):
        self._conn.close()


class Database:
    """Gerenciador de persistência transacional (PostgreSQL Neon / SQLite) para o REGEN FLOW."""

    def __init__(self, db_path: Optional[str] = None, auto_seed: bool = True):
        load_dotenv()
        env_database_url = os.getenv("DATABASE_URL", "").strip()

        if db_path is None or db_path == "regenflow.db":
            resolved_target = env_database_url or os.getenv("DATABASE_PATH", "regenflow.db")
        else:
            resolved_target = db_path

        self.is_postgres = resolved_target.startswith(("postgresql://", "postgres://"))
        self._pg_conn = None
        self._pg_lock = threading.RLock()
        self._memory_conn: Optional[sqlite3.Connection] = None

        if self.is_postgres:
            self.database_url = self._ensure_sslmode_require(resolved_target)
            self.db_path = self.database_url
        else:
            self.database_url = None
            self.db_path = resolved_target
            if self.db_path == ":memory:":
                self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
                self._memory_conn.row_factory = sqlite3.Row
                self._memory_conn.execute("PRAGMA foreign_keys = ON;")

        self.init_schema()
        self.encrypt_existing_unencrypted_records()
        if auto_seed:
            self.ensure_default_pipeline_and_seed()

    @staticmethod
    def _ensure_sslmode_require(url: str) -> str:
        """Garante que a conexão PostgreSQL utilize SSL obrigatório (sslmode=require)."""
        if "sslmode=" not in url:
            sep = "&" if "?" in url else "?"
            return f"{url}{sep}sslmode=require"
        return url

    def _get_pg_connection(self):
        import psycopg
        from psycopg.rows import dict_row

        if self._pg_conn is not None and not self._pg_conn.closed and not self._pg_conn.broken:
            try:
                self._pg_conn.execute("SELECT 1")
                return self._pg_conn
            except Exception:
                try:
                    self._pg_conn.close()
                except Exception:
                    pass
                self._pg_conn = None

        self._pg_conn = psycopg.connect(
            self.database_url,
            row_factory=dict_row,
            autocommit=False,
            keepalives=1,
            keepalives_idle=30,
            keepalives_interval=10,
            keepalives_count=3,
        )
        return self._pg_conn

    @contextmanager
    def connection(self):
        if self.is_postgres:
            with self._pg_lock:
                conn = self._get_pg_connection()
                adapter = _PostgresConnectionAdapter(conn)
                try:
                    yield adapter
                    conn.commit()
                except Exception:
                    try:
                        conn.rollback()
                    except Exception:
                        self._pg_conn = None
                    raise
        elif self._memory_conn is not None:
            try:
                yield self._memory_conn
                self._memory_conn.commit()
            except Exception:
                self._memory_conn.rollback()
                raise
        else:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA foreign_keys = ON;")
            try:
                yield conn
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()

    def init_schema(self) -> None:
        with self.connection() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS tenants (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_tenants_status ON tenants(status);

                CREATE TABLE IF NOT EXISTS sellers (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    email TEXT,
                    phone TEXT,
                    active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_sellers_name ON sellers(name);

                CREATE TABLE IF NOT EXISTS contacts (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    phone TEXT,
                    email TEXT,
                    channel TEXT NOT NULL DEFAULT 'whatsapp',
                    seller_id TEXT,
                    assignee TEXT DEFAULT 'Agente IA',
                    ai_enabled INTEGER NOT NULL DEFAULT 1,
                    attendance_status TEXT NOT NULL DEFAULT 'bot',
                    temperature TEXT NOT NULL DEFAULT 'warm',
                    lead_score INTEGER NOT NULL DEFAULT 50,
                    tags TEXT NOT NULL DEFAULT '[]',
                    custom_fields TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (seller_id) REFERENCES sellers(id)
                );

                CREATE TABLE IF NOT EXISTS messages (
                    id TEXT PRIMARY KEY,
                    contact_id TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'whatsapp',
                    content TEXT NOT NULL,
                    is_internal INTEGER NOT NULL DEFAULT 0,
                    media_type TEXT NOT NULL DEFAULT 'text',
                    media_url TEXT,
                    external_id TEXT,
                    delivery_status TEXT NOT NULL DEFAULT 'sent',
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS meta_configs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT UNIQUE NOT NULL,
                    phone_number_id TEXT,
                    waba_id TEXT,
                    ig_account_id TEXT,
                    access_token TEXT,
                    verify_token TEXT NOT NULL DEFAULT 'regenflow_meta_verify_2026',
                    app_secret TEXT,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS knowledge_items (
                    id TEXT PRIMARY KEY,
                    question TEXT NOT NULL,
                    answer TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'Geral',
                    tags TEXT NOT NULL DEFAULT '[]'
                );

                CREATE TABLE IF NOT EXISTS pipelines (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT ''
                );

                CREATE TABLE IF NOT EXISTS stages (
                    id TEXT PRIMARY KEY,
                    pipeline_id TEXT NOT NULL,
                    name TEXT NOT NULL,
                    stage_order INTEGER NOT NULL,
                    is_won INTEGER NOT NULL DEFAULT 0,
                    is_lost INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS deals (
                    id TEXT PRIMARY KEY,
                    contact_id TEXT NOT NULL,
                    pipeline_id TEXT NOT NULL,
                    stage_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    value REAL NOT NULL DEFAULT 0.0,
                    status TEXT NOT NULL DEFAULT 'open',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
                    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
                    FOREIGN KEY (stage_id) REFERENCES stages(id)
                );

                CREATE TABLE IF NOT EXISTS workflow_rules (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    trigger_type TEXT NOT NULL,
                    trigger_value TEXT NOT NULL,
                    actions TEXT NOT NULL DEFAULT '[]',
                    active INTEGER NOT NULL DEFAULT 1
                );

                CREATE TABLE IF NOT EXISTS quick_replies (
                    id TEXT PRIMARY KEY,
                    shortcut TEXT NOT NULL,
                    title TEXT NOT NULL,
                    content TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'Vendas'
                );

                CREATE TABLE IF NOT EXISTS appointments (
                    id TEXT PRIMARY KEY,
                    contact_id TEXT NOT NULL,
                    deal_id TEXT,
                    title TEXT NOT NULL,
                    scheduled_at TEXT NOT NULL,
                    duration_minutes INTEGER NOT NULL DEFAULT 30,
                    meeting_link TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'scheduled',
                    notes TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS broadcast_campaigns (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'all',
                    target_tag TEXT,
                    target_stage_id TEXT,
                    template_content TEXT NOT NULL,
                    sent_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    client_name TEXT NOT NULL,
                    company_name TEXT,
                    role TEXT NOT NULL DEFAULT 'admin',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'active',
                    must_change_password INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY (tenant_id) REFERENCES tenants(id)
                );

                CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
                CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

                CREATE TABLE IF NOT EXISTS audit_logs (
                    id TEXT PRIMARY KEY,
                    tenant_id TEXT NOT NULL DEFAULT 'master',
                    actor TEXT NOT NULL,
                    actor_role TEXT NOT NULL DEFAULT 'seller',
                    action TEXT NOT NULL,
                    target_type TEXT NOT NULL DEFAULT 'contact',
                    target_id TEXT,
                    details TEXT NOT NULL DEFAULT '',
                    ip_address TEXT,
                    timestamp TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp);
                """
            )

            if self.is_postgres:
                conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_id TEXT REFERENCES tenants(id);")
                conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin';")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);")
                conn.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'master';")
                conn.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS pin TEXT NOT NULL DEFAULT '1234';")
                conn.execute("ALTER TABLE sellers ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'seller';")
                conn.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_id TEXT NOT NULL DEFAULT 'master';")
                conn.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_hash TEXT;")
                conn.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS consent_status TEXT NOT NULL DEFAULT 'opted_in';")
                conn.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unread_count INTEGER NOT NULL DEFAULT 0;")
                conn.execute("ALTER TABLE contacts ADD COLUMN IF NOT EXISTS seller_id TEXT REFERENCES sellers(id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_contacts_seller ON contacts(seller_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_contacts_phone_hash ON contacts(phone_hash);")
                conn.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS external_id TEXT;")
                conn.execute("ALTER TABLE messages ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'sent';")
            else:
                # Migração de colunas para suportar SaaS Multi-Tenant na tabela users
                user_cols = [r["name"] for r in conn.execute("PRAGMA table_info(users)").fetchall()]
                if "tenant_id" not in user_cols:
                    conn.execute("ALTER TABLE users ADD COLUMN tenant_id TEXT REFERENCES tenants(id);")
                if "role" not in user_cols:
                    conn.execute("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'admin';")

                conn.execute("CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);")

                seller_cols = [r["name"] for r in conn.execute("PRAGMA table_info(sellers)").fetchall()]
                if "tenant_id" not in seller_cols:
                    conn.execute("ALTER TABLE sellers ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'master';")
                if "pin" not in seller_cols:
                    conn.execute("ALTER TABLE sellers ADD COLUMN pin TEXT NOT NULL DEFAULT '1234';")
                if "role" not in seller_cols:
                    conn.execute("ALTER TABLE sellers ADD COLUMN role TEXT NOT NULL DEFAULT 'seller';")

                # Migração de colunas para suportar vinculação dinâmica de vendedores, LGPD e Blind Index na tabela contacts
                contact_cols = [r["name"] for r in conn.execute("PRAGMA table_info(contacts)").fetchall()]
                if "tenant_id" not in contact_cols:
                    conn.execute("ALTER TABLE contacts ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'master';")
                if "phone_hash" not in contact_cols:
                    conn.execute("ALTER TABLE contacts ADD COLUMN phone_hash TEXT;")
                if "consent_status" not in contact_cols:
                    conn.execute("ALTER TABLE contacts ADD COLUMN consent_status TEXT NOT NULL DEFAULT 'opted_in';")
                if "unread_count" not in contact_cols:
                    conn.execute("ALTER TABLE contacts ADD COLUMN unread_count INTEGER NOT NULL DEFAULT 0;")
                if "seller_id" not in contact_cols:
                    conn.execute("ALTER TABLE contacts ADD COLUMN seller_id TEXT REFERENCES sellers(id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_contacts_seller ON contacts(seller_id);")
                conn.execute("CREATE INDEX IF NOT EXISTS idx_contacts_phone_hash ON contacts(phone_hash);")

                msg_cols = [r["name"] for r in conn.execute("PRAGMA table_info(messages)").fetchall()]
                if "external_id" not in msg_cols:
                    conn.execute("ALTER TABLE messages ADD COLUMN external_id TEXT;")
                if "delivery_status" not in msg_cols:
                    conn.execute("ALTER TABLE messages ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'sent';")

    def encrypt_existing_unencrypted_records(self) -> int:
        """
        Migra e criptografa em repouso registros existentes que ainda estejam em texto plano.
        Garante que 100% dos dados pré-existentes passem a ter proteção criptográfica AES-256.
        """
        updated = 0
        with self.connection() as conn:
            # 1. Contatos (PII + Blind Index HMAC-SHA256)
            rows = conn.execute("SELECT id, phone, phone_hash, email, custom_fields FROM contacts").fetchall()
            for r in rows:
                p = r["phone"]
                ph = r["phone_hash"] if "phone_hash" in r.keys() else None
                e = r["email"]
                cf = r["custom_fields"]
                needs_update = False
                enc_p = p
                enc_e = e
                enc_cf = cf
                new_ph = ph

                plain_phone = decrypt_field(p) if p else None
                if plain_phone and not new_ph:
                    digits = "".join(ch for ch in str(plain_phone) if ch.isdigit())
                    new_ph = blind_index(digits[-11:] if len(digits) >= 8 else plain_phone)
                    needs_update = True

                if p and not str(p).startswith(CIPHER_PREFIX):
                    enc_p = encrypt_field(p)
                    needs_update = True
                if e and not str(e).startswith(CIPHER_PREFIX):
                    enc_e = encrypt_field(e)
                    needs_update = True
                if cf and not str(cf).startswith(CIPHER_PREFIX):
                    try:
                        d = json.loads(cf) if isinstance(cf, str) else cf
                        enc_cf = encrypt_dict(d)
                        needs_update = True
                    except Exception:
                        pass

                if needs_update:
                    conn.execute(
                        "UPDATE contacts SET phone = ?, phone_hash = ?, email = ?, custom_fields = ? WHERE id = ?",
                        (enc_p, new_ph, enc_e, enc_cf, r["id"]),
                    )
                    updated += 1

            # 2. Mensagens (Conversas privadas)
            msg_rows = conn.execute("SELECT id, content FROM messages").fetchall()
            for m in msg_rows:
                c = m["content"]
                if c and not str(c).startswith(CIPHER_PREFIX):
                    enc_c = encrypt_field(c)
                    conn.execute("UPDATE messages SET content = ? WHERE id = ?", (enc_c, m["id"]))
                    updated += 1

            # 3. Agendamentos
            appt_rows = conn.execute("SELECT id, notes FROM appointments").fetchall()
            for a in appt_rows:
                n = a["notes"]
                if n and not str(n).startswith(CIPHER_PREFIX):
                    enc_n = encrypt_field(n)
                    conn.execute("UPDATE appointments SET notes = ? WHERE id = ?", (enc_n, a["id"]))
                    updated += 1

        return updated

    def ensure_default_pipeline_and_seed(self) -> None:
        """Cria funis padrão, base de conhecimento, respostas rápidas e regras iniciais."""
        pipelines = self.list_pipelines()
        if not pipelines:
            # Pipeline 1: Funil Comercial Principal
            p_sales = self.create_pipeline(
                Pipeline(
                    name="Funil Comercial Principal",
                    description="Pipeline comercial com progressão automática e qualificação de vendas",
                )
            )
            sales_stages = [
                ("Novo Lead", 1, False, False),
                ("Qualificação", 2, False, False),
                ("Proposta Apresentada", 3, False, False),
                ("Fechado Ganho", 4, True, False),
                ("Fechado Perdido", 5, False, True),
            ]
            for name, order, is_won, is_lost in sales_stages:
                self.create_stage(
                    Stage(pipeline_id=p_sales.id, name=name, order=order, is_won=is_won, is_lost=is_lost)
                )

            # Pipeline 2: Funil de Onboarding & Customer Success
            p_cs = self.create_pipeline(
                Pipeline(
                    name="Onboarding & Pós-Venda",
                    description="Acompanhamento de implantação, configuração de canais e sucesso do cliente",
                )
            )
            cs_stages = [
                ("Kickoff & Boas-vindas", 1, False, False),
                ("Conexão WhatsApp/Insta", 2, False, False),
                ("Treinamento da Equipe", 3, False, False),
                ("Go-Live Concluído", 4, True, False),
            ]
            for name, order, is_won, is_lost in cs_stages:
                self.create_stage(
                    Stage(pipeline_id=p_cs.id, name=name, order=order, is_won=is_won, is_lost=is_lost)
                )

        if not self.list_knowledge_items():
            default_kb = [
                KnowledgeItem(
                    question="Quais são os preços e planos disponíveis?",
                    answer="Temos 3 planos: Starter por R$ 197/mês (até 2 atendentes), Pro por R$ 497/mês (IA ilimitada + Kanban dinâmico + 10 atendentes) e Enterprise por R$ 997/mês (multi-canal ilimitado + servidor MCP dedicado).",
                    category="Preços e Planos",
                    tags=["preço", "preços", "valor", "valores", "plano", "planos", "mensalidade", "custo", "orçamento"],
                ),
                KnowledgeItem(
                    question="Como funciona a integração com WhatsApp e Instagram?",
                    answer="O Chat da Regen conecta seu WhatsApp e Instagram Direct em uma fila única com anti-fragmentação (debouncer de 2s) e distribuição automática para atendentes humanos ou Agente IA 24/7.",
                    category="Funcionalidades",
                    tags=["whatsapp", "instagram", "canais", "integração", "inbox", "atendimento"],
                ),
                KnowledgeItem(
                    question="O sistema possui integração MCP com Claude, Cursor e ChatGPT?",
                    answer="Sim! Disponibilizamos um servidor Model Context Protocol (MCP) nativo com 6 ferramentas padronizadas para que IAs externas consultem leads, movam negócios no Kanban e disparem mensagens.",
                    category="Tecnologia & MCP",
                    tags=["mcp", "claude", "cursor", "chatgpt", "ia", "api", "integração"],
                ),
                KnowledgeItem(
                    question="Qual o prazo de implantação e suporte?",
                    answer="A ativação é imediata (Self-Serve ou assistida em até 24h) com suporte técnico via WhatsApp e treinamento incluso no plano Pro e Enterprise.",
                    category="Suporte & Onboarding",
                    tags=["prazo", "implantação", "suporte", "treinamento", "ajuda", "garantia"],
                ),
            ]
            for item in default_kb:
                self.create_knowledge_item(item)

        if not self.list_workflow_rules():
            default_rules = [
                WorkflowRule(
                    name="Lead VIP / Urgente",
                    trigger_type="keyword",
                    trigger_value="urgente",
                    actions=[
                        {"type": "add_tag", "value": "prioridade-alta"},
                        {
                            "type": "send_message",
                            "value": "⚡ Identificamos prioridade máxima na sua solicitação! Um especialista sênior já foi notificado.",
                        },
                    ],
                    active=True,
                ),
                WorkflowRule(
                    name="Interesse Comercial / Orçamento",
                    trigger_type="keyword",
                    trigger_value="orçamento",
                    actions=[
                        {"type": "add_tag", "value": "pediu-orcamento"},
                    ],
                    active=True,
                ),
                WorkflowRule(
                    name="Interesse em Preços",
                    trigger_type="keyword",
                    trigger_value="preço",
                    actions=[
                        {"type": "add_tag", "value": "interesse-comercial"},
                    ],
                    active=True,
                ),
                WorkflowRule(
                    name="Boas-vindas Fechamento",
                    trigger_type="stage_change",
                    trigger_value="Fechado Ganho",
                    actions=[
                        {"type": "add_tag", "value": "cliente-ativo"},
                        {
                            "type": "send_message",
                            "value": "🎉 Parabéns pela parceria! Seu ambiente está sendo preparado pela nossa equipe de onboarding.",
                        },
                    ],
                    active=True,
                ),
            ]
            for rule in default_rules:
                self.create_workflow_rule(rule)

        if not self.list_quick_replies():
            default_qr = [
                QuickReply(
                    shortcut="/boasvindas",
                    title="Boas-vindas Comercial",
                    content="Olá {{nome}}! Tudo bem? Aqui é da equipe Chat da Regen. Como posso ajudar a escalar seu atendimento no WhatsApp e Instagram hoje?",
                    category="Triagem",
                ),
                QuickReply(
                    shortcut="/proposta",
                    title="Envio de Proposta Pro",
                    content="Olá {{nome}}! Segue o resumo da nossa proposta para o Plano Pro (R$ 497/mês): inclui Caixa de Entrada Omnichannel, Kanban Automático, Handoff de Equipe e até 10 atendentes.",
                    category="Vendas",
                ),
                QuickReply(
                    shortcut="/pix",
                    title="Chave PIX & Desconto Anual",
                    content="Para fechamento hoje via PIX ou assinatura anual, liberamos 15% de desconto + onboarding assistido gratuito! Chave CNPJ: 00.123.456/0001-99.",
                    category="Fechamento",
                ),
                QuickReply(
                    shortcut="/reuniao",
                    title="Convite para Demonstração",
                    content="Que tal fazermos uma demonstração rápida de 20 minutos ao vivo? Posso agendar para amanhã às 14h ou às 16h?",
                    category="Agenda",
                ),
                QuickReply(
                    shortcut="/followup",
                    title="Follow-up Anti-Vácuo",
                    content="Oi {{nome}}, tudo bem por aí? Passando para saber se conseguiu avaliar nossa proposta ou se ficou alguma dúvida técnica!",
                    category="Recuperação",
                ),
            ]
            for qr in default_qr:
                self.create_quick_reply(qr)

    def seed_demo_data(self) -> Dict[str, Any]:
        """Popula contatos, conversas, notas internas, reuniões e negócios de demonstração."""
        self.ensure_default_pipeline_and_seed()
        existing = self.list_contacts()
        if existing:
            return {"status": "already_seeded", "contacts": len(existing)}

        pipelines = self.list_pipelines()
        sales_pipeline = pipelines[0]
        stages = {s.name: s for s in self.list_stages(sales_pipeline.id)}

        c1 = self.create_contact(
            Contact(
                name="Marina Costa (TechNova)",
                phone="+55 11 99812-3456",
                email="marina@technova.com.br",
                channel="whatsapp",
                assignee="Lucas (Closer)",
                ai_enabled=True,
                attendance_status="bot",
                temperature="hot",
                lead_score=85,
                tags=["inbound", "interesse-comercial", "pediu-orcamento"],
                custom_fields={"empresa": "TechNova", "cargo": "Head de Vendas", "plano_interesse": "Pro", "tamanho_equipe": 8},
            ),
            create_default_deal=False,
        )
        d1 = self.create_deal(
            Deal(
                contact_id=c1.id,
                pipeline_id=sales_pipeline.id,
                stage_id=stages["Proposta Apresentada"].id,
                title="Licença Chat da Regen Pro - TechNova",
                value=497.0,
                status="open",
            )
        )
        self.create_message(
            Message(
                contact_id=c1.id,
                sender="contact",
                channel="whatsapp",
                content="Olá! Gostaria de receber uma proposta e saber os preços do plano Pro para 8 vendedores.",
            )
        )
        self.create_message(
            Message(
                contact_id=c1.id,
                sender="agent",
                channel="whatsapp",
                content="Olá Marina! Temos 3 planos: Starter por R$ 197/mês, Pro por R$ 497/mês (IA ilimitada + Kanban dinâmico + 10 atendentes) e Enterprise por R$ 997/mês. Já movi sua oportunidade para Proposta Apresentada!",
            )
        )
        self.create_message(
            Message(
                contact_id=c1.id,
                sender="internal",
                channel="whatsapp",
                is_internal=True,
                content="🔒 Nota Interna: @Lucas cliente tem 8 vendedores na TechNova, pode oferecer isenção da taxa de setup se fechar até sexta.",
            )
        )

        # Cria reunião agendada para Marina
        self.create_appointment(
            Appointment(
                contact_id=c1.id,
                deal_id=d1.id,
                title="Demonstração Técnica & Fechamento - TechNova",
                scheduled_at=future_iso(18),
                duration_minutes=30,
                notes="Apresentar módulo de Broadcast e Kanban para os 8 vendedores.",
            )
        )

        c2 = self.create_contact(
            Contact(
                name="Carlos Eduardo",
                phone="+55 21 98765-4321",
                email="carlos@agenciafluxo.io",
                channel="instagram",
                assignee="Agente IA",
                ai_enabled=True,
                attendance_status="bot",
                temperature="warm",
                lead_score=55,
                tags=["instagram-lead"],
                custom_fields={"empresa": "Agência Fluxo"},
            ),
            create_default_deal=False,
        )
        self.create_deal(
            Deal(
                contact_id=c2.id,
                pipeline_id=sales_pipeline.id,
                stage_id=stages["Novo Lead"].id,
                title="Oportunidade - Carlos Eduardo",
                value=197.0,
                status="open",
            )
        )
        self.create_message(
            Message(
                contact_id=c2.id,
                sender="contact",
                channel="instagram",
                content="Oi! Vi o perfil de vocês no Instagram. Como funciona a fila única?",
            )
        )

        c3 = self.create_contact(
            Contact(
                name="Roberto Almeida (Grupo Vértice)",
                phone="+55 31 99111-2233",
                email="roberto@grupovertice.com",
                channel="web",
                assignee="Fernanda (CS)",
                ai_enabled=False,
                attendance_status="human",
                temperature="hot",
                lead_score=100,
                tags=["cliente-ativo", "enterprise"],
                custom_fields={"empresa": "Grupo Vértice", "plano_interesse": "Enterprise"},
            ),
            create_default_deal=False,
        )
        self.create_deal(
            Deal(
                contact_id=c3.id,
                pipeline_id=sales_pipeline.id,
                stage_id=stages["Fechado Ganho"].id,
                title="Implantação Enterprise - Grupo Vértice",
                value=997.0,
                status="won",
            )
        )
        # Também adiciona card no Funil de Onboarding (Pipeline 2) se existir
        if len(pipelines) > 1:
            cs_pipeline = pipelines[1]
            cs_stages = self.list_stages(cs_pipeline.id)
            if cs_stages:
                self.create_deal(
                    Deal(
                        contact_id=c3.id,
                        pipeline_id=cs_pipeline.id,
                        stage_id=cs_stages[1].id if len(cs_stages) > 1 else cs_stages[0].id,
                        title="Onboarding Enterprise - Grupo Vértice",
                        value=997.0,
                        status="open",
                    )
                )

        self.create_message(
            Message(
                contact_id=c3.id,
                sender="contact",
                channel="web",
                content="Perfeito, vamos fechar o plano Enterprise hoje!",
            )
        )
        self.create_message(
            Message(
                contact_id=c3.id,
                sender="agent",
                channel="web",
                content="Excelente decisão, Roberto! Negócio movido para Fechado Ganho. Bem-vindo ao Chat da Regen!",
            )
        )

        return {"status": "seeded", "contacts": 3}

    # -----------------------------------------------------------------
    # Operações de Contatos & Handoff Humano
    # -----------------------------------------------------------------

    @staticmethod
    def _compute_phone_hash(phone: Optional[str]) -> Optional[str]:
        if not phone:
            return None
        digits = "".join(ch for ch in str(phone) if ch.isdigit())
        if len(digits) >= 8:
            return blind_index(digits[-11:])
        return blind_index(str(phone).strip())

    def create_contact(self, contact: Contact, create_default_deal: bool = True) -> Contact:
        now = utc_now_iso()
        contact.created_at = contact.created_at or now
        contact.updated_at = now
        contact.phone_hash = self._compute_phone_hash(contact.phone)
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO contacts (
                    id, tenant_id, name, phone, phone_hash, email, channel, seller_id, assignee, ai_enabled,
                    attendance_status, temperature, lead_score, consent_status, unread_count, tags, custom_fields,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    contact.id,
                    contact.tenant_id or "master",
                    contact.name,
                    encrypt_field(contact.phone),
                    contact.phone_hash,
                    encrypt_field(contact.email),
                    contact.channel,
                    contact.seller_id,
                    contact.assignee,
                    1 if contact.ai_enabled else 0,
                    contact.attendance_status,
                    contact.temperature,
                    contact.lead_score,
                    contact.consent_status or "opted_in",
                    contact.unread_count or 0,
                    json.dumps(contact.tags, ensure_ascii=False),
                    encrypt_dict(contact.custom_fields),
                    contact.created_at,
                    contact.updated_at,
                ),
            )

        if create_default_deal:
            pipelines = self.list_pipelines()
            if pipelines:
                stages = self.list_stages(pipelines[0].id)
                if stages:
                    self.create_deal(
                        Deal(
                            contact_id=contact.id,
                            pipeline_id=pipelines[0].id,
                            stage_id=stages[0].id,
                            title=f"Negócio - {contact.name}",
                            value=497.0,
                            status="open",
                        )
                    )
        return contact

    def delete_contact(self, contact_id: str) -> bool:
        """Exclui um contato e todos os seus relacionamentos associados."""
        with self.connection() as conn:
            conn.execute("DELETE FROM messages WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM deals WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM appointments WHERE contact_id = ?", (contact_id,))
            cur = conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            return cur.rowcount > 0

    def clear_demo_contacts(self) -> int:
        """Remove os contatos demonstrativos gerados pelo seed (Marina, Roberto, Carlos) e contatos inválidos/self-LID."""
        demo_emails = {"marina@technova.com.br", "roberto@grupovertice.com", "carlos@agenciafluxo.io"}
        deleted_count = 0
        contacts = self.list_contacts()
        for c in contacts:
            is_demo = (
                (c.email and c.email.lower() in demo_emails)
                or (c.phone and ("70102875644093" in c.phone or c.phone.startswith("+7010")))
                or (c.name and ("TechNova" in c.name or "Grupo Vértice" in c.name or "Registro de Marcas" in c.name))
            )
            if is_demo:
                if self.delete_contact(c.id):
                    deleted_count += 1
        return deleted_count

    def get_contact(self, contact_id: str) -> Optional[Contact]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
            return self._row_to_contact(row) if row else None

    def find_contact_by_phone(self, phone: str) -> Optional[Contact]:
        if not phone:
            return None
        ph = self._compute_phone_hash(phone)
        if ph:
            with self.connection() as conn:
                row = conn.execute("SELECT * FROM contacts WHERE phone_hash = ? LIMIT 1", (ph,)).fetchone()
                if row:
                    return self._row_to_contact(row)

        clean = "".join(ch for ch in (phone or "") if ch.isdigit())
        if not clean:
            return None
        for c in self.list_contacts():
            c_clean = "".join(ch for ch in (c.phone or "") if ch.isdigit())
            if c_clean and (c_clean == clean or c_clean.endswith(clean[-8:])):
                return c
        return None

    def list_contacts(self, tenant_id: Optional[str] = None) -> List[Contact]:
        with self.connection() as conn:
            if tenant_id and tenant_id != "master":
                rows = conn.execute(
                    "SELECT * FROM contacts WHERE tenant_id = ? OR tenant_id = 'master' ORDER BY updated_at DESC",
                    (tenant_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM contacts ORDER BY updated_at DESC").fetchall()
            return [self._row_to_contact(r) for r in rows]

    def update_contact(self, contact: Contact) -> Contact:
        contact.updated_at = utc_now_iso()
        contact.phone_hash = self._compute_phone_hash(contact.phone)
        with self.connection() as conn:
            conn.execute(
                """
                UPDATE contacts
                SET name = ?, phone = ?, phone_hash = ?, email = ?, channel = ?, seller_id = ?, assignee = ?,
                    ai_enabled = ?, attendance_status = ?, temperature = ?, lead_score = ?,
                    consent_status = ?, unread_count = ?, tags = ?, custom_fields = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    contact.name,
                    encrypt_field(contact.phone),
                    contact.phone_hash,
                    encrypt_field(contact.email),
                    contact.channel,
                    contact.seller_id,
                    contact.assignee,
                    1 if contact.ai_enabled else 0,
                    contact.attendance_status,
                    contact.temperature,
                    contact.lead_score,
                    contact.consent_status or "opted_in",
                    contact.unread_count or 0,
                    json.dumps(contact.tags, ensure_ascii=False),
                    encrypt_dict(contact.custom_fields),
                    contact.updated_at,
                    contact.id,
                ),
            )
        return contact

    def delete_contact(self, contact_id: str) -> bool:
        """Exclui um contato e todos os seus relacionamentos associados."""
        with self.connection() as conn:
            conn.execute("DELETE FROM messages WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM deals WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM appointments WHERE contact_id = ?", (contact_id,))
            cur = conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            return cur.rowcount > 0

    def clear_demo_contacts(self) -> int:
        """Remove os contatos demonstrativos gerados pelo seed (Marina, Roberto, Carlos) e contatos inválidos/self-LID."""
        demo_emails = {"marina@technova.com.br", "roberto@grupovertice.com", "carlos@agenciafluxo.io"}
        deleted_count = 0
        contacts = self.list_contacts()
        for c in contacts:
            is_demo = (
                (c.email and c.email.lower() in demo_emails)
                or (c.phone and ("70102875644093" in c.phone or c.phone.startswith("+7010")))
                or (c.name and ("TechNova" in c.name or "Grupo Vértice" in c.name or "Registro de Marcas" in c.name))
            )
            if is_demo:
                if self.delete_contact(c.id):
                    deleted_count += 1
        return deleted_count

    def set_contact_handoff(
        self,
        contact_id: str,
        ai_enabled: bool,
        attendance_status: str,
        assignee: Optional[str] = None,
        seller_id: Optional[str] = None,
    ) -> Optional[Contact]:
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        contact.ai_enabled = ai_enabled
        contact.attendance_status = attendance_status
        if assignee is not None:
            contact.assignee = assignee
        if seller_id is not None:
            contact.seller_id = seller_id
        return self.update_contact(contact)

    def set_contact_temperature(
        self, contact_id: str, temperature: str, lead_score: Optional[int] = None
    ) -> Optional[Contact]:
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        contact.temperature = temperature
        if lead_score is not None:
            contact.lead_score = max(0, min(100, lead_score))
        else:
            contact.lead_score = {"hot": 90, "warm": 55, "cold": 20}.get(temperature, contact.lead_score)
        return self.update_contact(contact)

    def add_contact_tag(self, contact_id: str, tag: str) -> Optional[Contact]:
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        clean_tag = tag.strip().lower()
        if clean_tag and clean_tag not in [t.lower() for t in contact.tags]:
            contact.tags.append(clean_tag)
            if clean_tag in ("prioridade-alta", "vip", "pediu-orcamento", "cliente-ativo"):
                contact.temperature = "hot"
                contact.lead_score = min(100, contact.lead_score + 20)
            self.update_contact(contact)
        return contact

    def delete_contact(self, contact_id: str) -> bool:
        """Exclui um contato e todos os seus relacionamentos associados."""
        with self.connection() as conn:
            conn.execute("DELETE FROM messages WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM deals WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM appointments WHERE contact_id = ?", (contact_id,))
            cur = conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
            return cur.rowcount > 0

    def clear_demo_contacts(self) -> int:
        """Remove os contatos demonstrativos gerados pelo seed (Marina, Roberto, Carlos) e contatos inválidos/self-LID."""
        demo_emails = {"marina@technova.com.br", "roberto@grupovertice.com", "carlos@agenciafluxo.io"}
        deleted_count = 0
        contacts = self.list_contacts()
        for c in contacts:
            is_demo = (
                (c.email and c.email.lower() in demo_emails)
                or (c.phone and ("70102875644093" in c.phone or c.phone.startswith("+7010")))
                or (c.name and ("TechNova" in c.name or "Grupo Vértice" in c.name or "Registro de Marcas" in c.name))
            )
            if is_demo:
                if self.delete_contact(c.id):
                    deleted_count += 1
        return deleted_count

    def update_contact_custom_fields(self, contact_id: str, fields: Dict[str, Any]) -> Optional[Contact]:
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        contact.custom_fields.update(fields)
        return self.update_contact(contact)

    def _row_to_contact(self, row: sqlite3.Row) -> Contact:
        keys = row.keys()
        return Contact(
            id=row["id"],
            tenant_id=row["tenant_id"] if "tenant_id" in keys and row["tenant_id"] else "master",
            name=row["name"],
            phone=decrypt_field(row["phone"]),
            phone_hash=row["phone_hash"] if "phone_hash" in keys else None,
            email=decrypt_field(row["email"]),
            channel=row["channel"],
            seller_id=row["seller_id"] if "seller_id" in keys else None,
            assignee=row["assignee"],
            ai_enabled=bool(row["ai_enabled"]) if "ai_enabled" in keys else True,
            attendance_status=row["attendance_status"] if "attendance_status" in keys else "bot",
            temperature=row["temperature"] if "temperature" in keys else "warm",
            lead_score=int(row["lead_score"]) if "lead_score" in keys else 50,
            consent_status=row["consent_status"] if "consent_status" in keys and row["consent_status"] else "opted_in",
            unread_count=int(row["unread_count"]) if "unread_count" in keys and row["unread_count"] is not None else 0,
            tags=json.loads(row["tags"] or "[]"),
            custom_fields=decrypt_dict(row["custom_fields"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def clear_contact_unread(self, contact_id: str) -> None:
        """Zera o contador de mensagens não lidas quando o atendente abre a conversa."""
        with self.connection() as conn:
            conn.execute("UPDATE contacts SET unread_count = 0 WHERE id = ?", (contact_id,))

    def set_contact_consent(self, contact_id: str, consent_status: str, actor: str = "Sistema") -> Optional[Contact]:
        """Atualiza o status de consentimento LGPD (opted_in / opted_out) do titular."""
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        contact.consent_status = consent_status
        if consent_status == "opted_out":
            if "lgpd-opt-out" not in contact.tags:
                contact.tags.append("lgpd-opt-out")
        else:
            contact.tags = [t for t in contact.tags if t != "lgpd-opt-out"]
        updated = self.update_contact(contact)
        self.log_audit(
            actor=actor,
            actor_role="system",
            action=f"LGPD_CONSENT_{consent_status.upper()}",
            target_type="contact",
            target_id=contact_id,
            details=f"Consentimento do titular atualizado para '{consent_status}'.",
            tenant_id=contact.tenant_id,
        )
        return updated

    def export_contact_lgpd_dossier(self, contact_id: str, actor: str = "Supervisor") -> Optional[Dict[str, Any]]:
        """
        Gera o Dossiê Completo de Portabilidade e Acesso aos Dados do Titular (Art. 18, II e V da LGPD).
        Registra automaticamente a operação no log de auditoria imutável.
        """
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        messages = self.list_messages(contact_id, include_internal=False)
        appointments = self.list_appointments(contact_id)
        deal = self.get_contact_active_deal(contact_id)

        self.log_audit(
            actor=actor,
            actor_role="supervisor",
            action="LGPD_DATA_EXPORT",
            target_type="contact",
            target_id=contact_id,
            details=f"Exportação de Dossiê LGPD (Art. 18) solicitada para {mask_pii(contact.phone, 'phone')}.",
            tenant_id=contact.tenant_id,
        )

        return {
            "lgpd_Compliance_Report": "Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 - Art. 18)",
            "generated_at": utc_now_iso(),
            "requested_by": actor,
            "encryption_standard": "AES-128/256-CBC + HMAC-SHA256 (Fernet)",
            "data_subject": {
                "id": contact.id,
                "name": contact.name,
                "phone": contact.phone,
                "email": contact.email,
                "channel": contact.channel,
                "consent_status": contact.consent_status,
                "tags": contact.tags,
                "custom_fields": contact.custom_fields,
                "created_at": contact.created_at,
                "updated_at": contact.updated_at,
            },
            "commercial_deal": deal.model_dump() if deal else None,
            "appointments": appointments,
            "messages_history": [
                {
                    "id": m.id,
                    "sender": m.sender,
                    "channel": m.channel,
                    "content": m.content,
                    "media_type": m.media_type,
                    "timestamp": m.timestamp,
                }
                for m in messages
            ],
        }

    def anonymize_contact_lgpd(self, contact_id: str, actor: str = "Supervisor", delete_messages: bool = True) -> Optional[Contact]:
        """
        Executa o Direito ao Esquecimento / Anonimização Irreversível de Dados Pessoais (Art. 18, VI da LGPD).
        Substitui PII (nome, telefone, e-mail, campos customizados) por hashes anônimos e apaga o conteúdo das mensagens.
        """
        contact = self.get_contact(contact_id)
        if not contact:
            return None

        masked_ref = mask_pii(contact.phone, "phone")
        anon_label = f"Titular Anonimizado #{contact.id[:6].upper()}"
        contact.name = anon_label
        contact.phone = None
        contact.phone_hash = None
        contact.email = None
        contact.consent_status = "anonymized"
        contact.ai_enabled = False
        contact.attendance_status = "closed"
        contact.tags = ["lgpd-anonimizado"]
        contact.custom_fields = {
            "lgpd_erased_at": utc_now_iso(),
            "lgpd_erased_by": actor,
            "previous_masked_phone": masked_ref,
        }
        updated = self.update_contact(contact)

        with self.connection() as conn:
            if delete_messages:
                conn.execute("DELETE FROM messages WHERE contact_id = ?", (contact_id,))
            conn.execute("DELETE FROM appointments WHERE contact_id = ?", (contact_id,))

        self.create_message(
            Message(
                contact_id=contact_id,
                sender="system",
                channel=contact.channel,
                content=f"🛡️ [Protocolo LGPD Art. 18, VI]: Dados pessoais e histórico deste titular foram anonimizados de forma irreversível por {actor}.",
            )
        )

        self.log_audit(
            actor=actor,
            actor_role="supervisor",
            action="LGPD_RIGHT_TO_BE_FORGOTTEN",
            target_type="contact",
            target_id=contact_id,
            details=f"Titular ({masked_ref}) anonimizado permanentemente conforme Art. 18, VI da LGPD.",
            tenant_id=contact.tenant_id,
        )
        return updated

    def pick_next_round_robin_seller(self, tenant_id: str = "master") -> Optional[Seller]:
        """
        Roleta Automática de Vendedores (Round-Robin por Menor Carga Ativa).
        Seleciona o vendedor ativo (role='seller' ou 'supervisor') com menos conversas humanas abertas no momento.
        """
        active_sellers = [s for s in self.list_sellers(include_inactive=False) if s.active]
        if not active_sellers:
            return None
        only_sellers = [s for s in active_sellers if s.role == "seller"] or active_sellers

        with self.connection() as conn:
            rows = conn.execute(
                "SELECT assignee, COUNT(*) as cnt FROM contacts WHERE attendance_status = 'human' GROUP BY assignee"
            ).fetchall()
            load_map = {str(r["assignee"] or "").lower(): int(r["cnt"]) for r in rows}

        only_sellers.sort(key=lambda s: (load_map.get(s.name.lower(), 0), s.name))
        return only_sellers[0]

    # -----------------------------------------------------------------
    # Trilha de Auditoria Imutável (Audit Logs - LGPD Art. 37)
    # -----------------------------------------------------------------

    def log_audit(
        self,
        actor: str,
        action: str,
        actor_role: str = "seller",
        target_type: str = "contact",
        target_id: Optional[str] = None,
        details: str = "",
        ip_address: Optional[str] = None,
        tenant_id: str = "master",
    ) -> AuditLog:
        entry = AuditLog(
            tenant_id=tenant_id or "master",
            actor=actor or "Sistema",
            actor_role=actor_role or "seller",
            action=action,
            target_type=target_type,
            target_id=target_id,
            details=details,
            ip_address=ip_address,
        )
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO audit_logs (
                    id, tenant_id, actor, actor_role, action, target_type, target_id, details, ip_address, timestamp
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.id,
                    entry.tenant_id,
                    entry.actor,
                    entry.actor_role,
                    entry.action,
                    entry.target_type,
                    entry.target_id,
                    encrypt_field(entry.details),
                    entry.ip_address,
                    entry.timestamp,
                ),
            )
        return entry

    def list_audit_logs(self, limit: int = 100, tenant_id: Optional[str] = None) -> List[AuditLog]:
        with self.connection() as conn:
            if tenant_id and tenant_id != "master":
                rows = conn.execute(
                    "SELECT * FROM audit_logs WHERE tenant_id = ? OR tenant_id = 'master' ORDER BY timestamp DESC LIMIT ?",
                    (tenant_id, limit),
                ).fetchall()
            else:
                rows = conn.execute(
                    "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?",
                    (limit,),
                ).fetchall()
            return [
                AuditLog(
                    id=r["id"],
                    tenant_id=r["tenant_id"] or "master",
                    actor=r["actor"],
                    actor_role=r["actor_role"],
                    action=r["action"],
                    target_type=r["target_type"],
                    target_id=r["target_id"],
                    details=decrypt_field(r["details"]) or "",
                    ip_address=r["ip_address"],
                    timestamp=r["timestamp"],
                )
                for r in rows
            ]

    def count_messages_fast(self) -> int:
        """Retorna a contagem total de mensagens via SQL COUNT(*) sem precisar descriptografar todas as linhas."""
        with self.connection() as conn:
            row = conn.execute("SELECT COUNT(*) as cnt FROM messages").fetchone()
            return int(row["cnt"]) if row else 0

    # -----------------------------------------------------------------
    # Operações de Mensagens & Notas Internas
    # -----------------------------------------------------------------

    def create_message(self, message: Message) -> Message:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO messages (
                    id, contact_id, sender, channel, content,
                    is_internal, media_type, media_url, external_id, delivery_status, timestamp
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    message.id,
                    message.contact_id,
                    message.sender,
                    message.channel,
                    encrypt_field(message.content),
                    1 if message.is_internal else 0,
                    message.media_type,
                    message.media_url,
                    message.external_id,
                    message.delivery_status or "sent",
                    message.timestamp,
                ),
            )
            if message.sender == "contact":
                conn.execute(
                    "UPDATE contacts SET updated_at = ?, unread_count = COALESCE(unread_count, 0) + 1 WHERE id = ?",
                    (message.timestamp, message.contact_id),
                )
            elif message.sender == "human" and not message.is_internal:
                conn.execute(
                    "UPDATE contacts SET updated_at = ?, unread_count = 0 WHERE id = ?",
                    (message.timestamp, message.contact_id),
                )
            else:
                conn.execute(
                    "UPDATE contacts SET updated_at = ? WHERE id = ?",
                    (message.timestamp, message.contact_id),
                )
        return message

    def list_messages(self, contact_id: Optional[str] = None, include_internal: bool = True) -> List[Message]:
        with self.connection() as conn:
            if contact_id:
                if include_internal:
                    rows = conn.execute(
                        "SELECT * FROM messages WHERE contact_id = ? ORDER BY timestamp ASC",
                        (contact_id,),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        "SELECT * FROM messages WHERE contact_id = ? AND is_internal = 0 ORDER BY timestamp ASC",
                        (contact_id,),
                    ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM messages ORDER BY timestamp ASC").fetchall()

            return [
                Message(
                    id=r["id"],
                    contact_id=r["contact_id"],
                    sender=r["sender"],
                    channel=r["channel"],
                    content=decrypt_field(r["content"]) or "",
                    is_internal=bool(r["is_internal"]) if "is_internal" in r.keys() else False,
                    media_type=r["media_type"] if "media_type" in r.keys() else "text",
                    media_url=r["media_url"] if "media_url" in r.keys() else None,
                    external_id=r["external_id"] if "external_id" in r.keys() else None,
                    delivery_status=(r["delivery_status"] if "delivery_status" in r.keys() and r["delivery_status"] else "sent"),
                    timestamp=r["timestamp"],
                )
                for r in rows
            ]

    def update_message_delivery_status(
        self, external_id: str, delivery_status: str
    ) -> Optional[Message]:
        """Atualiza o status de entrega/leitura de uma mensagem via external_id (wamid/mid da Meta) ou id."""
        if not external_id:
            return None
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM messages WHERE external_id = ? OR id = ? LIMIT 1",
                (external_id, external_id),
            ).fetchone()
            if not row:
                return None
            conn.execute(
                "UPDATE messages SET delivery_status = ? WHERE id = ?",
                (delivery_status, row["id"]),
            )
            updated = conn.execute("SELECT * FROM messages WHERE id = ?", (row["id"],)).fetchone()
            return Message(
                id=updated["id"],
                contact_id=updated["contact_id"],
                sender=updated["sender"],
                channel=updated["channel"],
                content=decrypt_field(updated["content"]) or "",
                is_internal=bool(updated["is_internal"]),
                media_type=updated["media_type"] or "text",
                media_url=updated["media_url"],
                external_id=updated["external_id"],
                delivery_status=updated["delivery_status"] or "sent",
                timestamp=updated["timestamp"],
            )

    # -----------------------------------------------------------------
    # Operações de Funil Kanban (Pipelines, Stages, Deals)
    # -----------------------------------------------------------------

    def create_pipeline(self, pipeline: Pipeline) -> Pipeline:
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO pipelines (id, name, description) VALUES (?, ?, ?)",
                (pipeline.id, pipeline.name, pipeline.description),
            )
        return pipeline

    def list_pipelines(self) -> List[Pipeline]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM pipelines").fetchall()
            return [Pipeline(id=r["id"], name=r["name"], description=r["description"]) for r in rows]

    def create_stage(self, stage: Stage) -> Stage:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO stages (id, pipeline_id, name, stage_order, is_won, is_lost)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    stage.id,
                    stage.pipeline_id,
                    stage.name,
                    stage.order,
                    1 if stage.is_won else 0,
                    1 if stage.is_lost else 0,
                ),
            )
        return stage

    def list_stages(self, pipeline_id: Optional[str] = None) -> List[Stage]:
        with self.connection() as conn:
            if pipeline_id:
                rows = conn.execute(
                    "SELECT * FROM stages WHERE pipeline_id = ? ORDER BY stage_order ASC",
                    (pipeline_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM stages ORDER BY stage_order ASC").fetchall()
            return [self._row_to_stage(r) for r in rows]

    def get_stage(self, stage_id: str) -> Optional[Stage]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM stages WHERE id = ?", (stage_id,)).fetchone()
            return self._row_to_stage(row) if row else None

    def get_stage_by_name(self, name: str, pipeline_id: Optional[str] = None) -> Optional[Stage]:
        stages = self.list_stages(pipeline_id)
        target = name.strip().lower()
        for stage in stages:
            if stage.name.strip().lower() == target:
                return stage
        for stage in stages:
            if target in stage.name.strip().lower():
                return stage
        return None

    def _row_to_stage(self, row: sqlite3.Row) -> Stage:
        return Stage(
            id=row["id"],
            pipeline_id=row["pipeline_id"],
            name=row["name"],
            order=row["stage_order"],
            is_won=bool(row["is_won"]),
            is_lost=bool(row["is_lost"]),
        )

    def create_deal(self, deal: Deal) -> Deal:
        now = utc_now_iso()
        deal.created_at = deal.created_at or now
        deal.updated_at = now
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO deals (id, contact_id, pipeline_id, stage_id, title, value, status, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    deal.id,
                    deal.contact_id,
                    deal.pipeline_id,
                    deal.stage_id,
                    deal.title,
                    deal.value,
                    deal.status,
                    deal.created_at,
                    deal.updated_at,
                ),
            )
        return deal

    def get_deal(self, deal_id: str) -> Optional[Deal]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM deals WHERE id = ?", (deal_id,)).fetchone()
            return self._row_to_deal(row) if row else None

    def get_contact_active_deal(self, contact_id: str, pipeline_id: Optional[str] = None) -> Optional[Deal]:
        with self.connection() as conn:
            if pipeline_id:
                row = conn.execute(
                    "SELECT * FROM deals WHERE contact_id = ? AND pipeline_id = ? ORDER BY updated_at DESC LIMIT 1",
                    (contact_id, pipeline_id),
                ).fetchone()
            else:
                pipelines = self.list_pipelines()
                first_pid = pipelines[0].id if pipelines else None
                if first_pid:
                    row = conn.execute(
                        "SELECT * FROM deals WHERE contact_id = ? AND pipeline_id = ? ORDER BY updated_at DESC LIMIT 1",
                        (contact_id, first_pid),
                    ).fetchone()
                else:
                    row = None
                if not row:
                    row = conn.execute(
                        "SELECT * FROM deals WHERE contact_id = ? ORDER BY updated_at DESC LIMIT 1",
                        (contact_id,),
                    ).fetchone()
            return self._row_to_deal(row) if row else None

    def list_deals(self, pipeline_id: Optional[str] = None) -> List[Deal]:
        with self.connection() as conn:
            if pipeline_id:
                rows = conn.execute(
                    "SELECT * FROM deals WHERE pipeline_id = ? ORDER BY updated_at DESC",
                    (pipeline_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM deals ORDER BY updated_at DESC").fetchall()
            return [self._row_to_deal(r) for r in rows]

    def move_deal_stage(self, deal_id: str, new_stage_id_or_name: str, value: Optional[float] = None) -> Optional[Deal]:
        deal = self.get_deal(deal_id)
        if not deal:
            return None
        stage = self.get_stage(new_stage_id_or_name) or self.get_stage_by_name(
            new_stage_id_or_name, deal.pipeline_id
        )
        if not stage:
            return None

        deal.stage_id = stage.id
        if stage.is_won:
            deal.status = "won"
            self.set_contact_temperature(deal.contact_id, "hot", 100)
        elif stage.is_lost:
            deal.status = "lost"
            self.set_contact_temperature(deal.contact_id, "cold", 15)
        else:
            deal.status = "open"
            if "proposta" in stage.name.lower():
                self.set_contact_temperature(deal.contact_id, "hot", 80)

        if value is not None:
            deal.value = value

        deal.updated_at = utc_now_iso()
        with self.connection() as conn:
            conn.execute(
                "UPDATE deals SET stage_id = ?, status = ?, value = ?, updated_at = ? WHERE id = ?",
                (deal.stage_id, deal.status, deal.value, deal.updated_at, deal.id),
            )
        return deal

    def _row_to_deal(self, row: sqlite3.Row) -> Deal:
        return Deal(
            id=row["id"],
            contact_id=row["contact_id"],
            pipeline_id=row["pipeline_id"],
            stage_id=row["stage_id"],
            title=row["title"],
            value=float(row["value"]),
            status=row["status"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # -----------------------------------------------------------------
    # Base de Conhecimento (Knowledge Base)
    # -----------------------------------------------------------------

    def create_knowledge_item(self, item: KnowledgeItem) -> KnowledgeItem:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO knowledge_items (id, question, answer, category, tags)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    item.id,
                    item.question,
                    item.answer,
                    item.category,
                    json.dumps(item.tags, ensure_ascii=False),
                ),
            )
        return item

    def list_knowledge_items(self) -> List[KnowledgeItem]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM knowledge_items").fetchall()
            return [
                KnowledgeItem(
                    id=r["id"],
                    question=r["question"],
                    answer=r["answer"],
                    category=r["category"],
                    tags=json.loads(r["tags"] or "[]"),
                )
                for r in rows
            ]

    def delete_knowledge_item(self, item_id: str) -> bool:
        with self.connection() as conn:
            cur = conn.execute("DELETE FROM knowledge_items WHERE id = ?", (item_id,))
            return cur.rowcount > 0

    # -----------------------------------------------------------------
    # Regras de Automação (Workflows)
    # -----------------------------------------------------------------

    def create_workflow_rule(self, rule: WorkflowRule) -> WorkflowRule:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO workflow_rules (id, name, trigger_type, trigger_value, actions, active)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    rule.id,
                    rule.name,
                    rule.trigger_type,
                    rule.trigger_value,
                    json.dumps(rule.actions, ensure_ascii=False),
                    1 if rule.active else 0,
                ),
            )
        return rule

    def list_workflow_rules(self, only_active: bool = False) -> List[WorkflowRule]:
        with self.connection() as conn:
            query = "SELECT * FROM workflow_rules WHERE active = 1" if only_active else "SELECT * FROM workflow_rules"
            rows = conn.execute(query).fetchall()
            return [
                WorkflowRule(
                    id=r["id"],
                    name=r["name"],
                    trigger_type=r["trigger_type"],
                    trigger_value=r["trigger_value"],
                    actions=json.loads(r["actions"] or "[]"),
                    active=bool(r["active"]),
                )
                for r in rows
            ]

    def toggle_workflow_rule(self, rule_id: str) -> Optional[WorkflowRule]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM workflow_rules WHERE id = ?", (rule_id,)).fetchone()
            if not row:
                return None
            new_active = 0 if row["active"] else 1
            conn.execute("UPDATE workflow_rules SET active = ? WHERE id = ?", (new_active, rule_id))
            row = conn.execute("SELECT * FROM workflow_rules WHERE id = ?", (rule_id,)).fetchone()
            return WorkflowRule(
                id=row["id"],
                name=row["name"],
                trigger_type=row["trigger_type"],
                trigger_value=row["trigger_value"],
                actions=json.loads(row["actions"] or "[]"),
                active=bool(row["active"]),
            )

    # -----------------------------------------------------------------
    # Respostas Rápidas (Quick Replies / Atalhos)
    # -----------------------------------------------------------------

    def create_quick_reply(self, qr: QuickReply) -> QuickReply:
        if not qr.shortcut.startswith("/"):
            qr.shortcut = "/" + qr.shortcut
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO quick_replies (id, shortcut, title, content, category) VALUES (?, ?, ?, ?, ?)",
                (qr.id, qr.shortcut, qr.title, qr.content, qr.category),
            )
        return qr

    def list_quick_replies(self) -> List[QuickReply]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM quick_replies ORDER BY shortcut ASC").fetchall()
            return [
                QuickReply(
                    id=r["id"],
                    shortcut=r["shortcut"],
                    title=r["title"],
                    content=r["content"],
                    category=r["category"],
                )
                for r in rows
            ]

    def delete_quick_reply(self, qr_id: str) -> bool:
        with self.connection() as conn:
            cur = conn.execute("DELETE FROM quick_replies WHERE id = ?", (qr_id,))
            return cur.rowcount > 0

    # -----------------------------------------------------------------
    # Agendamento de Reuniões (Appointments)
    # -----------------------------------------------------------------

    def create_appointment(self, appt: Appointment) -> Appointment:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO appointments (
                    id, contact_id, deal_id, title, scheduled_at,
                    duration_minutes, meeting_link, status, notes, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    appt.id,
                    appt.contact_id,
                    appt.deal_id,
                    appt.title,
                    appt.scheduled_at,
                    appt.duration_minutes,
                    appt.meeting_link,
                    appt.status,
                    encrypt_field(appt.notes),
                    appt.created_at,
                ),
            )
        return appt

    def list_appointments(self, contact_id: Optional[str] = None) -> List[Dict[str, Any]]:
        contacts_map = {c.id: c for c in self.list_contacts()}
        with self.connection() as conn:
            if contact_id:
                rows = conn.execute(
                    "SELECT * FROM appointments WHERE contact_id = ? ORDER BY scheduled_at ASC",
                    (contact_id,),
                ).fetchall()
            else:
                rows = conn.execute("SELECT * FROM appointments ORDER BY scheduled_at ASC").fetchall()

            result = []
            for r in rows:
                contact = contacts_map.get(r["contact_id"])
                item = Appointment(
                    id=r["id"],
                    contact_id=r["contact_id"],
                    deal_id=r["deal_id"],
                    title=r["title"],
                    scheduled_at=r["scheduled_at"],
                    duration_minutes=int(r["duration_minutes"]),
                    meeting_link=r["meeting_link"],
                    status=r["status"],
                    notes=decrypt_field(r["notes"]) or "",
                    created_at=r["created_at"],
                ).model_dump()
                item["contact_name"] = contact.name if contact else "Contato"
                item["contact_channel"] = contact.channel if contact else "whatsapp"
                result.append(item)
            return result

    def update_appointment_status(self, appt_id: str, status: str) -> Optional[Dict[str, Any]]:
        with self.connection() as conn:
            conn.execute("UPDATE appointments SET status = ? WHERE id = ?", (status, appt_id))
        items = [a for a in self.list_appointments() if a["id"] == appt_id]
        return items[0] if items else None

    # -----------------------------------------------------------------
    # Follow-up Anti-Vácuo & Campanhas de Broadcast em Massa
    # -----------------------------------------------------------------

    def list_followup_candidates(self) -> List[Dict[str, Any]]:
        """
        Retorna leads com oportunidade em aberto (open) que precisam de acompanhamento
        (ex: parados em Proposta Apresentada, Qualificação ou Novo Lead).
        """
        contacts = {c.id: c for c in self.list_contacts()}
        stages = {s.id: s for s in self.list_stages()}
        candidates = []

        for deal in self.list_deals():
            if deal.status != "open":
                continue
            contact = contacts.get(deal.contact_id)
            stage = stages.get(deal.stage_id)
            if not contact or not stage:
                continue
            msgs = self.list_messages(contact.id, include_internal=False)
            last_msg = msgs[-1] if msgs else None
            candidates.append(
                {
                    "contact": contact.model_dump(),
                    "deal": deal.model_dump(),
                    "stage_name": stage.name,
                    "last_message": last_msg.model_dump() if last_msg else None,
                    "waiting_customer_reply": last_msg.sender != "contact" if last_msg else True,
                }
            )
        return candidates

    def execute_broadcast(
        self,
        name: str,
        template_content: str,
        channel: str = "all",
        target_tag: Optional[str] = None,
        target_stage_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Filtra a audiência por canal, tag e/ou estágio no Kanban, personaliza a mensagem
        com variáveis ({{nome}}, {{empresa}}) e dispara para todos os contatos correspondentes.
        """
        contacts = self.list_contacts()
        tag_norm = (target_tag or "").strip().lower()
        ch_norm = (channel or "all").strip().lower()

        recipients: List[Contact] = []
        skipped_lgpd_count = 0
        for c in contacts:
            # Bloqueio estrito LGPD Art. 7º/8º: Não dispara campanhas em massa para titulares em opt-out ou anonimizados
            if c.consent_status in ("opted_out", "anonymized") or "lgpd-opt-out" in [t.lower() for t in c.tags]:
                skipped_lgpd_count += 1
                continue
            if ch_norm and ch_norm != "all" and c.channel.lower() != ch_norm:
                continue
            if tag_norm and tag_norm not in [t.lower() for t in c.tags]:
                continue
            if target_stage_id:
                deal = self.get_contact_active_deal(c.id)
                if not deal or deal.stage_id != target_stage_id:
                    continue
            recipients.append(c)

        dispatched_messages = []
        for c in recipients:
            first_name = c.name.split()[0] if c.name else "Cliente"
            empresa = c.custom_fields.get("empresa", "sua empresa")
            personalized = (
                template_content.replace("{{nome}}", first_name)
                .replace("{{nome_completo}}", c.name)
                .replace("{{empresa}}", str(empresa))
            )
            msg = self.create_message(
                Message(
                    contact_id=c.id,
                    sender="human",
                    channel=c.channel,
                    content=f"📢 [Campanha: {name}]\n{personalized}",
                )
            )
            dispatched_messages.append(msg.model_dump())

        campaign = BroadcastCampaign(
            name=name,
            channel=channel,
            target_tag=target_tag,
            target_stage_id=target_stage_id,
            template_content=template_content,
            sent_count=len(dispatched_messages),
        )
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO broadcast_campaigns (
                    id, name, channel, target_tag, target_stage_id,
                    template_content, sent_count, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    campaign.id,
                    campaign.name,
                    campaign.channel,
                    campaign.target_tag,
                    campaign.target_stage_id,
                    campaign.template_content,
                    campaign.sent_count,
                    campaign.created_at,
                ),
            )

        return {
            "campaign": campaign.model_dump(),
            "recipients_count": len(recipients),
            "messages": dispatched_messages,
        }

    def list_broadcast_campaigns(self) -> List[BroadcastCampaign]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM broadcast_campaigns ORDER BY created_at DESC").fetchall()
            return [
                BroadcastCampaign(
                    id=r["id"],
                    name=r["name"],
                    channel=r["channel"],
                    target_tag=r["target_tag"],
                    target_stage_id=r["target_stage_id"],
                    template_content=r["template_content"],
                    sent_count=int(r["sent_count"]),
                    created_at=r["created_at"],
                )
                for r in rows
            ]

    # -----------------------------------------------------------------
    # Gestão de Clientes / Usuários & Bloqueio por Inadimplência
    # -----------------------------------------------------------------

    def _map_user_row(self, row) -> User:
        cols = row.keys()
        return User(
            id=row["id"],
            tenant_id=row["tenant_id"] if "tenant_id" in cols else None,
            email=row["email"],
            password_hash=row["password_hash"],
            client_name=row["client_name"],
            company_name=row["company_name"],
            role=row["role"] if "role" in cols and row["role"] else "admin",
            is_active=bool(row["is_active"]),
            status=row["status"],
            must_change_password=bool(row["must_change_password"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    def create_user(self, user: User) -> User:
        user.email = user.email.strip().lower()
        now = utc_now_iso()
        user.created_at = user.created_at or now
        user.updated_at = now
        with self.connection() as conn:
            row = conn.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (user.email,)).fetchone()
            if row:
                raise ValueError(f"Já existe um cliente cadastrado com o e-mail '{user.email}'.")
            conn.execute(
                """
                INSERT INTO users (
                    id, tenant_id, email, password_hash, client_name, company_name,
                    role, is_active, status, must_change_password, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    user.id,
                    user.tenant_id,
                    user.email,
                    user.password_hash,
                    user.client_name,
                    user.company_name or user.client_name,
                    user.role or "admin",
                    1 if user.is_active else 0,
                    user.status,
                    1 if user.must_change_password else 0,
                    user.created_at,
                    user.updated_at,
                ),
            )
        return user

    def get_user_by_email(self, email: str) -> Optional[User]:
        if not email:
            return None
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE lower(email) = lower(?)", (email.strip(),)).fetchone()
            if not row:
                return None
            return self._map_user_row(row)

    def get_user(self, user_id: str) -> Optional[User]:
        if not user_id:
            return None
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
            if not row:
                return None
            return self._map_user_row(row)

    def get_super_admin(self) -> Optional[User]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM users WHERE role = 'super_admin' LIMIT 1").fetchone()
            if not row:
                return None
            return self._map_user_row(row)

    def update_user_status(self, email: str, is_active: bool, status: str) -> Optional[User]:
        email_clean = email.strip().lower()
        now = utc_now_iso()
        with self.connection() as conn:
            row = conn.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (email_clean,)).fetchone()
            if not row:
                return None
            conn.execute(
                """
                UPDATE users
                SET is_active = ?, status = ?, updated_at = ?
                WHERE lower(email) = lower(?)
                """,
                (1 if is_active else 0, status, now, email_clean),
            )
        return self.get_user_by_email(email_clean)

    def update_user_password(self, email: str, new_password_hash: str) -> Optional[User]:
        email_clean = email.strip().lower()
        now = utc_now_iso()
        with self.connection() as conn:
            row = conn.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (email_clean,)).fetchone()
            if not row:
                return None
            conn.execute(
                """
                UPDATE users
                SET password_hash = ?, must_change_password = 0, updated_at = ?
                WHERE lower(email) = lower(?)
                """,
                (new_password_hash, now, email_clean),
            )
        return self.get_user_by_email(email_clean)

    def list_users(self) -> List[User]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
            return [self._map_user_row(row) for row in rows]

    def list_users_by_tenant(self, tenant_id: str) -> List[User]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM users WHERE tenant_id = ? ORDER BY created_at DESC", (tenant_id,)).fetchall()
            return [self._map_user_row(row) for row in rows]

    def delete_user_by_email(self, email: str) -> bool:
        email_clean = email.strip().lower()
        with self.connection() as conn:
            row = conn.execute("SELECT id FROM users WHERE lower(email) = lower(?)", (email_clean,)).fetchone()
            if not row:
                return False
            conn.execute("DELETE FROM users WHERE lower(email) = lower(?)", (email_clean,))
            return True

    # -----------------------------------------------------------------
    # Gestão de Tenants (Empresas Clientes B2B - Multi-Tenant)
    # -----------------------------------------------------------------

    def create_tenant(self, tenant: Tenant) -> Tenant:
        now = utc_now_iso()
        tenant.created_at = tenant.created_at or now
        tenant.updated_at = now
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO tenants (id, name, status, is_active, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    tenant.id,
                    tenant.name.strip(),
                    tenant.status,
                    1 if tenant.is_active else 0,
                    tenant.created_at,
                    tenant.updated_at,
                ),
            )
        return tenant

    def get_tenant(self, tenant_id: str) -> Optional[Tenant]:
        if not tenant_id:
            return None
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
            if not row:
                return None
            return Tenant(
                id=row["id"],
                name=row["name"],
                status=row["status"],
                is_active=bool(row["is_active"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def get_tenant_by_name(self, name: str) -> Optional[Tenant]:
        if not name:
            return None
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM tenants WHERE lower(name) = lower(?)", (name.strip(),)).fetchone()
            if not row:
                return None
            return Tenant(
                id=row["id"],
                name=row["name"],
                status=row["status"],
                is_active=bool(row["is_active"]),
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )

    def list_tenants(self) -> List[Tenant]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM tenants ORDER BY created_at DESC").fetchall()
            return [
                Tenant(
                    id=row["id"],
                    name=row["name"],
                    status=row["status"],
                    is_active=bool(row["is_active"]),
                    created_at=row["created_at"],
                    updated_at=row["updated_at"],
                )
                for row in rows
            ]

    def update_tenant_status(self, tenant_id: str, is_active: bool, status: str) -> Optional[Tenant]:
        now = utc_now_iso()
        with self.connection() as conn:
            row = conn.execute("SELECT id FROM tenants WHERE id = ?", (tenant_id,)).fetchone()
            if not row:
                return None
            conn.execute(
                """
                UPDATE tenants
                SET is_active = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (1 if is_active else 0, status, now, tenant_id),
            )
        return self.get_tenant(tenant_id)

    def count_tenant_users(self, tenant_id: str) -> int:
        with self.connection() as conn:
            row = conn.execute("SELECT COUNT(*) as cnt FROM users WHERE tenant_id = ?", (tenant_id,)).fetchone()
            return int(row["cnt"]) if row else 0

    # -----------------------------------------------------------------
    # Vendedores & Atendentes da Loja (Multi-Operador)
    # -----------------------------------------------------------------

    def list_sellers(self, include_inactive: bool = False) -> List[Seller]:
        """
        Retorna os vendedores da loja para distribuição e posse de conversas.
        Por padrão retorna apenas vendedores ativos (active = True).
        Se include_inactive = True, inclui também os vendedores desativados (soft delete).
        Popula a equipe inicial caso a tabela esteja vazia.
        """
        with self.connection() as conn:
            total_count = conn.execute("SELECT COUNT(*) as cnt FROM sellers").fetchone()["cnt"]
            if total_count == 0:
                default_team = [
                    "Lucas Silva",
                    "Camila Santos",
                    "Matheus Oliveira",
                    "Juliana Costa",
                    "Gabriel Henrique",
                ]
                now = utc_now_iso()
                for name in default_team:
                    conn.execute(
                        "INSERT OR IGNORE INTO sellers (id, name, active, created_at) VALUES (?, ?, 1, ?)",
                        (new_uuid(), name, now),
                    )

            if include_inactive:
                rows = conn.execute("SELECT * FROM sellers ORDER BY name ASC").fetchall()
            else:
                rows = conn.execute("SELECT * FROM sellers WHERE active = 1 ORDER BY name ASC").fetchall()

            return [
                Seller(
                    id=row["id"],
                    name=row["name"],
                    email=row["email"],
                    phone=row["phone"],
                    pin=row["pin"] if "pin" in row.keys() and row["pin"] else "1234",
                    role=row["role"] if "role" in row.keys() and row["role"] else ("supervisor" if "gabriel" in (row["name"] or "").lower() or "otavio" in (row["name"] or "").lower() else "seller"),
                    active=bool(row["active"]),
                    created_at=row["created_at"],
                )
                for row in rows
            ]

    def get_seller(self, seller_id: str) -> Optional[Seller]:
        """Busca vendedor por ID."""
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM sellers WHERE id = ?", (seller_id,)).fetchone()
            if not row:
                return None
            return Seller(
                id=row["id"],
                name=row["name"],
                email=row["email"],
                phone=row["phone"],
                pin=row["pin"] if "pin" in row.keys() and row["pin"] else "1234",
                role=row["role"] if "role" in row.keys() and row["role"] else "seller",
                active=bool(row["active"]),
                created_at=row["created_at"],
            )

    def get_seller_by_name(self, name: str) -> Optional[Seller]:
        """Busca vendedor por nome."""
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM sellers WHERE lower(name) = lower(?)", (name.strip(),)).fetchone()
            if not row:
                return None
            return Seller(
                id=row["id"],
                name=row["name"],
                email=row["email"],
                phone=row["phone"],
                pin=row["pin"] if "pin" in row.keys() and row["pin"] else "1234",
                role=row["role"] if "role" in row.keys() and row["role"] else "seller",
                active=bool(row["active"]),
                created_at=row["created_at"],
            )

    def create_seller(
        self,
        name: str,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        pin: str = "1234",
        role: str = "seller",
    ) -> Seller:
        """Cadastra um novo vendedor ou supervisor na loja com validação e integridade de nome único."""
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("O nome do vendedor é obrigatório.")
        existing = self.get_seller_by_name(clean_name)
        if existing:
            raise ValueError(f"Já existe um vendedor cadastrado com o nome '{clean_name}'.")

        clean_pin = (pin or "1234").strip() or "1234"
        clean_role = role if role in ("seller", "supervisor") else "seller"

        seller = Seller(
            name=clean_name,
            email=email.strip() if email and email.strip() else None,
            phone=phone.strip() if phone and phone.strip() else None,
            pin=clean_pin,
            role=clean_role,
            active=True,
        )
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO sellers (id, name, email, phone, pin, role, active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?)
                """,
                (seller.id, seller.name, seller.email, seller.phone, seller.pin, seller.role, seller.created_at),
            )
        return seller

    def update_seller(
        self,
        seller_id: str,
        name: Optional[str] = None,
        email: Optional[str] = None,
        phone: Optional[str] = None,
        pin: Optional[str] = None,
        role: Optional[str] = None,
        active: Optional[bool] = None,
    ) -> Optional[Seller]:
        """Atualiza os dados de um vendedor, PIN/cargo ou altera seu estado ativo/inativo (soft delete)."""
        seller = self.get_seller(seller_id)
        if not seller:
            return None

        new_name = seller.name
        if name is not None:
            clean_name = name.strip()
            if not clean_name:
                raise ValueError("O nome do vendedor não pode ser vazio.")
            if clean_name.lower() != seller.name.lower():
                existing = self.get_seller_by_name(clean_name)
                if existing and existing.id != seller_id:
                    raise ValueError(f"Já existe outro vendedor cadastrado com o nome '{clean_name}'.")
            new_name = clean_name

        new_email = email.strip() if email is not None and email.strip() else (seller.email if email is None else None)
        new_phone = phone.strip() if phone is not None and phone.strip() else (seller.phone if phone is None else None)
        new_pin = pin.strip() if pin is not None and pin.strip() else seller.pin
        new_role = role if role in ("seller", "supervisor") else seller.role
        new_active = active if active is not None else seller.active

        with self.connection() as conn:
            conn.execute(
                """
                UPDATE sellers
                SET name = ?, email = ?, phone = ?, pin = ?, role = ?, active = ?
                WHERE id = ?
                """,
                (new_name, new_email, new_phone, new_pin, new_role, 1 if new_active else 0, seller_id),
            )
        return self.get_seller(seller_id)

    def verify_seller_pin(self, seller_id: str, pin: str) -> Optional[Seller]:
        """Valida o PIN individual do vendedor/supervisor para travar a sessão no nome dele."""
        seller = self.get_seller(seller_id)
        if not seller or not seller.active:
            return None
        if str(seller.pin).strip() == str(pin).strip():
            return seller
        return None

    def toggle_seller_active(self, seller_id: str) -> Optional[Seller]:
        """Alterna o status de ativação (soft delete) de um vendedor."""
        seller = self.get_seller(seller_id)
        if not seller:
            return None
        return self.update_seller(seller_id, active=not seller.active)

    # -----------------------------------------------------------------
    # Configuração da API Oficial da Meta (WhatsApp Cloud & Instagram)
    # -----------------------------------------------------------------

    def _row_to_meta_config(self, row) -> MetaConfig:
        return MetaConfig(
            id=row["id"],
            tenant_id=row["tenant_id"],
            phone_number_id=row["phone_number_id"],
            waba_id=row["waba_id"],
            ig_account_id=row["ig_account_id"],
            access_token=decrypt_field(row["access_token"]) if row["access_token"] else None,
            verify_token=row["verify_token"] or "regenflow_meta_verify_2026",
            app_secret=decrypt_field(row["app_secret"]) if row["app_secret"] else None,
            enabled=bool(row["enabled"]),
            updated_at=row["updated_at"],
        )

    def get_meta_config(self, tenant_id: str = "master") -> MetaConfig:
        """Retorna a configuração da API Oficial da Meta para o tenant (ou cria padrão)."""
        clean_tid = (tenant_id or "master").strip()
        with self.connection() as conn:
            row = conn.execute(
                "SELECT * FROM meta_configs WHERE tenant_id = ?", (clean_tid,)
            ).fetchone()
            if row:
                return self._row_to_meta_config(row)

            # Fallback para variáveis de ambiente se for master
            default_cfg = MetaConfig(
                tenant_id=clean_tid,
                phone_number_id=os.getenv("META_PHONE_NUMBER_ID"),
                waba_id=os.getenv("META_WABA_ID"),
                ig_account_id=os.getenv("META_IG_ACCOUNT_ID"),
                access_token=os.getenv("META_ACCESS_TOKEN"),
                verify_token=os.getenv("META_VERIFY_TOKEN", "regenflow_meta_verify_2026"),
                app_secret=os.getenv("META_APP_SECRET"),
                enabled=True,
            )
            return default_cfg

    def save_meta_config(self, config: MetaConfig) -> MetaConfig:
        """Salva ou atualiza as credenciais da API Oficial da Meta com criptografia AES-256."""
        clean_tid = (config.tenant_id or "master").strip()
        config.tenant_id = clean_tid
        config.updated_at = utc_now_iso()
        enc_token = encrypt_field(config.access_token) if config.access_token else None
        enc_secret = encrypt_field(config.app_secret) if config.app_secret else None

        with self.connection() as conn:
            existing = conn.execute(
                "SELECT id FROM meta_configs WHERE tenant_id = ?", (clean_tid,)
            ).fetchone()
            if existing:
                config.id = existing["id"]
                conn.execute(
                    """
                    UPDATE meta_configs
                    SET phone_number_id = ?, waba_id = ?, ig_account_id = ?,
                        access_token = ?, verify_token = ?, app_secret = ?,
                        enabled = ?, updated_at = ?
                    WHERE tenant_id = ?
                    """,
                    (
                        config.phone_number_id,
                        config.waba_id,
                        config.ig_account_id,
                        enc_token,
                        config.verify_token,
                        enc_secret,
                        1 if config.enabled else 0,
                        config.updated_at,
                        clean_tid,
                    ),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO meta_configs (
                        id, tenant_id, phone_number_id, waba_id, ig_account_id,
                        access_token, verify_token, app_secret, enabled, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        config.id,
                        clean_tid,
                        config.phone_number_id,
                        config.waba_id,
                        config.ig_account_id,
                        enc_token,
                        config.verify_token,
                        enc_secret,
                        1 if config.enabled else 0,
                        config.updated_at,
                    ),
                )
        return self.get_meta_config(clean_tid)

    def find_meta_config_by_channel_id(
        self,
        phone_number_id: Optional[str] = None,
        ig_account_id: Optional[str] = None,
    ) -> MetaConfig:
        """Localiza a configuração do Tenant correspondente ao phone_number_id ou ig_account_id do Webhook."""
        with self.connection() as conn:
            if phone_number_id:
                row = conn.execute(
                    "SELECT * FROM meta_configs WHERE phone_number_id = ? LIMIT 1",
                    (phone_number_id,),
                ).fetchone()
                if row:
                    return self._row_to_meta_config(row)
            if ig_account_id:
                row = conn.execute(
                    "SELECT * FROM meta_configs WHERE ig_account_id = ? LIMIT 1",
                    (ig_account_id,),
                ).fetchone()
                if row:
                    return self._row_to_meta_config(row)
        return self.get_meta_config("master")


