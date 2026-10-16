import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

from core.db import Appointment, Contact, Database, Deal, KnowledgeItem, Message
from engine.workflow import WorkflowEngine


def normalize_text(text: str) -> str:
    """Remove acentos e converte para minúsculas para busca resiliente."""
    if not text:
        return ""
    nfkd = unicodedata.normalize("NFKD", text.lower())
    return "".join(c for c in nfkd if not unicodedata.combining(c))


def tokenize(text: str) -> List[str]:
    norm = normalize_text(text)
    tokens = re.findall(r"[a-z0-9]+", norm)
    stopwords = {
        "o", "a", "os", "as", "de", "do", "da", "dos", "das", "em", "no", "na",
        "um", "uma", "para", "com", "por", "que", "qual", "quais", "como", "e",
        "ou", "se", "eu", "voce", "voces", "me", "meu", "minha", "ter", "tem",
        "sao", "ser", "esta", "estao", "oi", "ola", "bom", "boa", "dia", "tarde", "noite",
    }
    return [t for t in tokens if len(t) > 1 and t not in stopwords]


class ConversationalAgent:
    """
    Motor de Atendimento e Qualificação Comercial com:
    - Busca na Base de Conhecimento por sobreposição de termos e tags
    - Extração automática de dados/campos customizados da conversa
    - Mapeamento dinâmico de intenção de compra para avanço automático no Kanban
    - Handoff automático para atendente humano e agendamento de reuniões
    - Integração com WorkflowEngine
    """

    INTENT_RULES: List[Tuple[str, str, List[str]]] = [
        (
            "closing_won",
            "Fechado Ganho",
            [
                "fechar",
                "fechamento",
                "contratar",
                "comprar",
                "assinar",
                "aceito a proposta",
                "vamos fechar",
                "quero contratar",
                "quero assinar",
                "pode gerar o contrato",
                "pagamento confirmado",
                "vou levar",
            ],
        ),
        (
            "closing_lost",
            "Fechado Perdido",
            [
                "nao tenho interesse",
                "desistir",
                "cancelar",
                "muito caro",
                "fechamos com outro",
                "nao quero mais",
            ],
        ),
        (
            "proposal",
            "Proposta Apresentada",
            [
                "proposta",
                "orcamento",
                "preco",
                "precos",
                "valor",
                "valores",
                "quanto custa",
                "mensalidade",
                "plano",
                "planos",
                "cotacao",
                "tabela de precos",
            ],
        ),
        (
            "qualification",
            "Qualificação",
            [
                "como funciona",
                "duvida",
                "integracao",
                "whatsapp",
                "instagram",
                "atendentes",
                "equipe",
                "demonstracao",
                "conhecer",
            ],
        ),
    ]

    HANDOFF_KEYWORDS = [
        "falar com atendente",
        "atendente humano",
        "falar com humano",
        "transferir para atendente",
        "falar com vendedor",
        "falar com especialista",
        "pessoa real",
    ]

    SCHEDULE_KEYWORDS = [
        "agendar reuniao",
        "marcar reuniao",
        "agendar demonstracao",
        "marcar demonstracao",
        "agendar call",
        "marcar call",
    ]

    def __init__(self, db: Database, workflow_engine: Optional[WorkflowEngine] = None):
        self.db = db
        self.workflow = workflow_engine or WorkflowEngine(db)

    def search_knowledge_base(self, query: str, top_k: int = 2) -> List[Dict[str, Any]]:
        """
        Busca itens na base de conhecimento por sobreposição de termos e tags.
        """
        query_norm = normalize_text(query)
        query_tokens = set(tokenize(query))
        if not query_tokens and not query_norm:
            return []

        scored: List[Dict[str, Any]] = []
        for item in self.db.list_knowledge_items():
            q_tokens = set(tokenize(item.question))
            a_tokens = set(tokenize(item.answer))
            tag_norms = [normalize_text(t) for t in item.tags]
            tag_tokens = set()
            for t in tag_norms:
                tag_tokens.update(tokenize(t))

            score = 0.0
            for tag_norm in tag_norms:
                if tag_norm and tag_norm in query_norm:
                    score += 4.0

            score += len(query_tokens & tag_tokens) * 3.0
            score += len(query_tokens & q_tokens) * 2.5
            score += len(query_tokens & a_tokens) * 1.0

            if score > 0:
                scored.append(
                    {
                        "item": item,
                        "score": round(score, 2),
                        "id": item.id,
                        "question": item.question,
                        "answer": item.answer,
                        "category": item.category,
                        "tags": item.tags,
                    }
                )

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def extract_custom_fields(self, text: str) -> Dict[str, Any]:
        """Extrai entidades e metadados comerciais do texto da conversa."""
        extracted: Dict[str, Any] = {}
        norm = normalize_text(text)

        email_match = re.search(r"[\w\.-]+@[\w\.-]+\.\w+", text)
        if email_match:
            extracted["email_capturado"] = email_match.group(0)

        if "enterprise" in norm:
            extracted["plano_interesse"] = "Enterprise"
            extracted["valor_estimado"] = 997.0
        elif re.search(r"\bpro\b", norm):
            extracted["plano_interesse"] = "Pro"
            extracted["valor_estimado"] = 497.0
        elif "starter" in norm:
            extracted["plano_interesse"] = "Starter"
            extracted["valor_estimado"] = 197.0

        team_match = re.search(r"(\d+)\s*(atendentes|vendedores|usuarios|pessoas|consultores)", norm)
        if team_match:
            extracted["tamanho_equipe"] = int(team_match.group(1))

        comp_match = re.search(r"(?:empresa|agencia|grupo)\s+([A-ZÀ-Ú][\wÀ-ú\s]{1,25})", text)
        if comp_match:
            extracted["empresa"] = comp_match.group(1).strip()

        return extracted

    def detect_intent_and_target_stage(self, text: str) -> Tuple[Optional[str], Optional[str]]:
        """
        Retorna (intent_name, target_stage_name) baseado nas palavras-chave e expressões do lead.
        """
        norm = normalize_text(text)
        for intent_name, target_stage, keywords in self.INTENT_RULES:
            for kw in keywords:
                if kw in norm:
                    return intent_name, target_stage
        return None, None

    def process_incoming_message(
        self,
        contact_id: str,
        content: str,
        channel: Optional[str] = None,
        persist_user_message: bool = True,
        media_type: str = "text",
        media_url: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Fluxo completo de processamento de mensagem do cliente:
        1. Registra a mensagem consolidada no histórico
        2. Extrai campos customizados e atualiza o contato
        3. Executa automações de palavra-chave (WorkflowEngine)
        4. Verifica pedido de Handoff Humano ou Agendamento de Reunião
        5. Consulta a Base de Conhecimento (KB)
        6. Detecta intenção de compra e avança o card no Kanban dinamicamente
        7. Formula e persiste a resposta (se ai_enabled estiver ativo)
        """
        contact = self.db.get_contact(contact_id)
        if not contact:
            raise ValueError(f"Contato {contact_id} não encontrado.")

        active_channel = channel or contact.channel or "whatsapp"

        user_msg: Optional[Message] = None
        if persist_user_message:
            user_msg = self.db.create_message(
                Message(
                    contact_id=contact.id,
                    sender="contact",
                    channel=active_channel,
                    content=content,
                    media_type=media_type,
                    media_url=media_url,
                )
            )

        # 1. Extração de campos customizados
        extracted_fields = self.extract_custom_fields(content)
        if extracted_fields:
            if "email_capturado" in extracted_fields and not contact.email:
                contact.email = extracted_fields["email_capturado"]
                self.db.update_contact(contact)
            self.db.update_contact_custom_fields(contact.id, extracted_fields)

        # 2. Disparo de Workflows por palavra-chave
        workflow_actions = self.workflow.evaluate(
            contact_id=contact.id,
            event_type="keyword",
            event_value=content,
            channel=active_channel,
        )

        norm_content = normalize_text(content)
        deal = self.db.get_contact_active_deal(contact.id)

        # 3. Detecção de Pedido de Agendamento de Reunião
        scheduled_appointment: Optional[Dict[str, Any]] = None
        if any(kw in norm_content for kw in self.SCHEDULE_KEYWORDS):
            appt = self.db.create_appointment(
                Appointment(
                    contact_id=contact.id,
                    deal_id=deal.id if deal else None,
                    title=f"Demonstração Comercial - {contact.name}",
                    notes=f"Solicitado via chat ({active_channel}): {content}",
                )
            )
            self.db.add_contact_tag(contact.id, "reuniao-agendada")
            scheduled_appointment = appt.model_dump()

        # 4. Detecção de Pedido de Handoff para Atendente Humano
        handoff_triggered = False
        if any(kw in norm_content for kw in self.HANDOFF_KEYWORDS):
            self.db.set_contact_handoff(
                contact_id=contact.id,
                ai_enabled=False,
                attendance_status="waiting",
                assignee="Fila de Espera Humana",
            )
            self.db.add_contact_tag(contact.id, "handoff-humano")
            handoff_triggered = True

        # 5. Consulta à Base de Conhecimento
        kb_hits = self.search_knowledge_base(content, top_k=2)

        # 6. Progressão dinâmica de estágio no Funil Kanban
        intent, target_stage_name = self.detect_intent_and_target_stage(content)
        stage_transition: Optional[Dict[str, Any]] = None

        if deal and target_stage_name:
            current_stage = self.db.get_stage(deal.stage_id)
            target_stage = self.db.get_stage_by_name(target_stage_name, deal.pipeline_id)
            if target_stage and current_stage and target_stage.id != current_stage.id:
                should_move = (
                    target_stage.is_won
                    or target_stage.is_lost
                    or target_stage.order > current_stage.order
                )
                if should_move:
                    new_val = extracted_fields.get("valor_estimado", deal.value)
                    moved_deal = self.db.move_deal_stage(deal.id, target_stage.id, value=new_val)
                    if moved_deal:
                        stage_transition = {
                            "deal_id": moved_deal.id,
                            "from_stage": current_stage.name,
                            "to_stage": target_stage.name,
                            "intent": intent,
                            "status": moved_deal.status,
                        }
                        stage_wf = self.workflow.evaluate(
                            contact_id=contact.id,
                            event_type="stage_change",
                            event_value=target_stage.name,
                            channel=active_channel,
                        )
                        workflow_actions.extend(stage_wf)

        # Se o contato já estava com IA pausada (em atendimento humano) e não foi um pedido de handoff agora:
        if not contact.ai_enabled and not handoff_triggered:
            updated_contact = self.db.get_contact(contact.id)
            updated_deal = self.db.get_contact_active_deal(contact.id)
            return {
                "contact": updated_contact.model_dump() if updated_contact else None,
                "user_message": user_msg.model_dump() if user_msg else None,
                "agent_message": None,
                "ai_paused": True,
                "kb_matches": [
                    {"id": h["id"], "question": h["question"], "score": h["score"], "category": h["category"]}
                    for h in kb_hits
                ],
                "extracted_fields": extracted_fields,
                "intent_detected": intent,
                "stage_transition": stage_transition,
                "workflow_actions": workflow_actions,
                "scheduled_appointment": scheduled_appointment,
                "deal": updated_deal.model_dump() if updated_deal else None,
            }

        # 7. Construção da resposta
        reply_parts: List[str] = []
        if handoff_triggered:
            reply_parts.append(
                "🎧 Transferi seu atendimento para a nossa **Fila de Especialistas Humanos** e pausei o assistente automático. Um consultor assumirá esta conversa em instantes!"
            )
        else:
            if kb_hits:
                reply_parts.append(kb_hits[0]["answer"])

            if scheduled_appointment:
                reply_parts.append(
                    f"📅 **Reunião Agendada!** Criei seu compromisso na nossa agenda comercial para `{scheduled_appointment['scheduled_at']}`.\nLink da sala: {scheduled_appointment['meeting_link']}"
                )

            if stage_transition:
                to_st = stage_transition["to_stage"]
                if to_st == "Proposta Apresentada":
                    if not kb_hits:
                        reply_parts.append(
                            "Preparei os detalhes da nossa proposta comercial para o seu cenário (Planos Starter R$ 197, Pro R$ 497 e Enterprise R$ 997)."
                        )
                    reply_parts.append(
                        "📋 Atualizei sua oportunidade para **Proposta Apresentada** no nosso funil. Qual plano faz mais sentido para sua operação hoje?"
                    )
                elif to_st == "Fechado Ganho":
                    reply_parts.append(
                        "🚀 Perfeito! Registrei o fechamento e movi seu negócio para **Fechado Ganho**. Nossa equipe já iniciou a ativação da sua conta!"
                    )
                elif to_st == "Fechado Perdido":
                    reply_parts.append(
                        "Entendido! Agradeço o seu tempo e deixei seu registro atualizado. Caso precise no futuro, estaremos à disposição."
                    )
                elif to_st == "Qualificação" and not kb_hits:
                    reply_parts.append(
                        "Ótima pergunta! No OpenChatFunnel centralizamos WhatsApp, Instagram e Web com Kanban automático. Quantos atendentes vocês têm hoje?"
                    )

            if not reply_parts:
                reply_parts.append(
                    f"Olá {contact.name.split()[0]}! Recebi sua mensagem. Posso te ajudar com informações sobre nossos planos (Starter, Pro, Enterprise), agendar uma demonstração ou enviar uma proposta personalizada."
                )

        reply_text = "\n\n".join(reply_parts)
        agent_msg = self.db.create_message(
            Message(
                contact_id=contact.id,
                sender="agent",
                channel=active_channel,
                content=reply_text,
            )
        )

        updated_contact = self.db.get_contact(contact.id)
        updated_deal = self.db.get_contact_active_deal(contact.id)

        return {
            "contact": updated_contact.model_dump() if updated_contact else None,
            "user_message": user_msg.model_dump() if user_msg else None,
            "agent_message": agent_msg.model_dump(),
            "ai_paused": handoff_triggered,
            "kb_matches": [
                {"id": h["id"], "question": h["question"], "score": h["score"], "category": h["category"]}
                for h in kb_hits
            ],
            "extracted_fields": extracted_fields,
            "intent_detected": intent,
            "stage_transition": stage_transition,
            "workflow_actions": workflow_actions,
            "scheduled_appointment": scheduled_appointment,
            "deal": updated_deal.model_dump() if updated_deal else None,
        }
