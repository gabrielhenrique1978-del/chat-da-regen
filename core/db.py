import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from core.security import (
    CIPHER_PREFIX,
    decrypt_dict,
    decrypt_field,
    encrypt_dict,
    encrypt_field,
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
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    channel: str = "whatsapp"  # whatsapp, instagram, web
    assignee: Optional[str] = "Agente IA"
    ai_enabled: bool = True
    attendance_status: str = "bot"  # bot, waiting, human, closed
    temperature: str = "warm"  # hot, warm, cold
    lead_score: int = 50
    tags: List[str] = Field(default_factory=list)
    custom_fields: Dict[str, Any] = Field(default_factory=dict)
    created_at: str = Field(default_factory=utc_now_iso)
    updated_at: str = Field(default_factory=utc_now_iso)


class Message(BaseModel):
    id: str = Field(default_factory=new_uuid)
    contact_id: str
    sender: str  # contact, agent, human, system, internal
    channel: str = "whatsapp"
    content: str
    is_internal: bool = False  # Nota interna (Sussurro/Whisper visível só para equipe)
    media_type: str = "text"  # text, audio, document
    media_url: Optional[str] = None
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
    meeting_link: str = "https://meet.openchatfunnel.local/demo-call"
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


# =====================================================================
# Camada de Persistência SQLite
# =====================================================================


class Database:
    """Gerenciador de persistência transacional SQLite para o OpenChatFunnel."""

    def __init__(self, db_path: str = "openchatfunnel.db", auto_seed: bool = True):
        self.db_path = db_path
        self._memory_conn: Optional[sqlite3.Connection] = None
        if db_path == ":memory:":
            self._memory_conn = sqlite3.connect(":memory:", check_same_thread=False)
            self._memory_conn.row_factory = sqlite3.Row
            self._memory_conn.execute("PRAGMA foreign_keys = ON;")
        self.init_schema()
        self.encrypt_existing_unencrypted_records()
        if auto_seed:
            self.ensure_default_pipeline_and_seed()

    @contextmanager
    def connection(self):
        if self._memory_conn is not None:
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
                CREATE TABLE IF NOT EXISTS contacts (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    phone TEXT,
                    email TEXT,
                    channel TEXT NOT NULL DEFAULT 'whatsapp',
                    assignee TEXT DEFAULT 'Agente IA',
                    ai_enabled INTEGER NOT NULL DEFAULT 1,
                    attendance_status TEXT NOT NULL DEFAULT 'bot',
                    temperature TEXT NOT NULL DEFAULT 'warm',
                    lead_score INTEGER NOT NULL DEFAULT 50,
                    tags TEXT NOT NULL DEFAULT '[]',
                    custom_fields TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
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
                    timestamp TEXT NOT NULL,
                    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
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
                """
            )

    def encrypt_existing_unencrypted_records(self) -> int:
        """
        Migra e criptografa em repouso registros existentes que ainda estejam em texto plano.
        Garante que 100% dos dados pré-existentes passem a ter proteção criptográfica AES-256.
        """
        updated = 0
        with self.connection() as conn:
            # 1. Contatos (PII)
            rows = conn.execute("SELECT id, phone, email, custom_fields FROM contacts").fetchall()
            for r in rows:
                p = r["phone"]
                e = r["email"]
                cf = r["custom_fields"]
                needs_update = False
                enc_p = p
                enc_e = e
                enc_cf = cf

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
                        "UPDATE contacts SET phone = ?, email = ?, custom_fields = ? WHERE id = ?",
                        (enc_p, enc_e, enc_cf, r["id"]),
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
                    answer="O OpenChatFunnel conecta seu WhatsApp e Instagram Direct em uma fila única com anti-fragmentação (debouncer de 2s) e distribuição automática para atendentes humanos ou Agente IA 24/7.",
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
                    content="Olá {{nome}}! Tudo bem? Aqui é da equipe OpenChatFunnel. Como posso ajudar a escalar seu atendimento no WhatsApp e Instagram hoje?",
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
                title="Licença OpenChatFunnel Pro - TechNova",
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
                content="Excelente decisão, Roberto! Negócio movido para Fechado Ganho. Bem-vindo ao OpenChatFunnel!",
            )
        )

        return {"status": "seeded", "contacts": 3}

    # -----------------------------------------------------------------
    # Operações de Contatos & Handoff Humano
    # -----------------------------------------------------------------

    def create_contact(self, contact: Contact, create_default_deal: bool = True) -> Contact:
        now = utc_now_iso()
        contact.created_at = contact.created_at or now
        contact.updated_at = now
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO contacts (
                    id, name, phone, email, channel, assignee, ai_enabled,
                    attendance_status, temperature, lead_score, tags, custom_fields,
                    created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    contact.id,
                    contact.name,
                    encrypt_field(contact.phone),
                    encrypt_field(contact.email),
                    contact.channel,
                    contact.assignee,
                    1 if contact.ai_enabled else 0,
                    contact.attendance_status,
                    contact.temperature,
                    contact.lead_score,
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

    def get_contact(self, contact_id: str) -> Optional[Contact]:
        with self.connection() as conn:
            row = conn.execute("SELECT * FROM contacts WHERE id = ?", (contact_id,)).fetchone()
            return self._row_to_contact(row) if row else None

    def find_contact_by_phone(self, phone: str) -> Optional[Contact]:
        clean = "".join(ch for ch in (phone or "") if ch.isdigit())
        if not clean:
            return None
        for c in self.list_contacts():
            c_clean = "".join(ch for ch in (c.phone or "") if ch.isdigit())
            if c_clean and (c_clean == clean or c_clean.endswith(clean[-8:])):
                return c
        return None

    def list_contacts(self) -> List[Contact]:
        with self.connection() as conn:
            rows = conn.execute("SELECT * FROM contacts ORDER BY updated_at DESC").fetchall()
            return [self._row_to_contact(r) for r in rows]

    def update_contact(self, contact: Contact) -> Contact:
        contact.updated_at = utc_now_iso()
        with self.connection() as conn:
            conn.execute(
                """
                UPDATE contacts
                SET name = ?, phone = ?, email = ?, channel = ?, assignee = ?,
                    ai_enabled = ?, attendance_status = ?, temperature = ?, lead_score = ?,
                    tags = ?, custom_fields = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    contact.name,
                    encrypt_field(contact.phone),
                    encrypt_field(contact.email),
                    contact.channel,
                    contact.assignee,
                    1 if contact.ai_enabled else 0,
                    contact.attendance_status,
                    contact.temperature,
                    contact.lead_score,
                    json.dumps(contact.tags, ensure_ascii=False),
                    encrypt_dict(contact.custom_fields),
                    contact.updated_at,
                    contact.id,
                ),
            )
        return contact

    def set_contact_handoff(
        self,
        contact_id: str,
        ai_enabled: bool,
        attendance_status: str,
        assignee: Optional[str] = None,
    ) -> Optional[Contact]:
        contact = self.get_contact(contact_id)
        if not contact:
            return None
        contact.ai_enabled = ai_enabled
        contact.attendance_status = attendance_status
        if assignee is not None:
            contact.assignee = assignee
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
            name=row["name"],
            phone=decrypt_field(row["phone"]),
            email=decrypt_field(row["email"]),
            channel=row["channel"],
            assignee=row["assignee"],
            ai_enabled=bool(row["ai_enabled"]) if "ai_enabled" in keys else True,
            attendance_status=row["attendance_status"] if "attendance_status" in keys else "bot",
            temperature=row["temperature"] if "temperature" in keys else "warm",
            lead_score=int(row["lead_score"]) if "lead_score" in keys else 50,
            tags=json.loads(row["tags"] or "[]"),
            custom_fields=decrypt_dict(row["custom_fields"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    # -----------------------------------------------------------------
    # Operações de Mensagens & Notas Internas
    # -----------------------------------------------------------------

    def create_message(self, message: Message) -> Message:
        with self.connection() as conn:
            conn.execute(
                """
                INSERT INTO messages (
                    id, contact_id, sender, channel, content,
                    is_internal, media_type, media_url, timestamp
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    message.timestamp,
                ),
            )
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
                    timestamp=r["timestamp"],
                )
                for r in rows
            ]

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
        for c in contacts:
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
