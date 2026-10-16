from typing import Any, Dict, List, Optional

from core.db import Contact, Database, Message
from engine.agent import ConversationalAgent
from engine.workflow import WorkflowEngine


class MCPServer:
    """
    Servidor compatível com a especificação Model Context Protocol (MCP).
    Expõe esquemas JSON padronizados e executores diretos para as 6 ferramentas
    essenciais de operação de CRM por agentes externos (Claude, Cursor, ChatGPT).
    """

    def __init__(self, db: Database, agent: Optional[ConversationalAgent] = None):
        self.db = db
        self.workflow = WorkflowEngine(db)
        self.agent = agent or ConversationalAgent(db, self.workflow)

    def list_tools(self) -> List[Dict[str, Any]]:
        """Retorna a lista de ferramentas MCP com seus respectivos JSON Schemas."""
        return [
            {
                "name": "create_contact",
                "description": "Cadastra um novo lead/contato no CRM com metadados, canal e tags iniciais, criando automaticamente sua oportunidade no Kanban.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Nome completo do lead ou contato"},
                        "phone": {"type": "string", "description": "Telefone ou WhatsApp do contato"},
                        "email": {"type": "string", "description": "Endereço de e-mail do contato"},
                        "channel": {
                            "type": "string",
                            "enum": ["whatsapp", "instagram", "web"],
                            "default": "whatsapp",
                            "description": "Canal de origem do lead",
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "Lista de etiquetas iniciais",
                        },
                        "custom_fields": {
                            "type": "object",
                            "description": "Campos personalizados (empresa, cargo, etc.)",
                        },
                    },
                    "required": ["name"],
                },
            },
            {
                "name": "list_contacts",
                "description": "Lista contatos do CRM ordenados por atividade mais recente, incluindo tags e estágio atual no funil.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "tag": {"type": "string", "description": "Filtro opcional por tag"},
                        "channel": {"type": "string", "description": "Filtro opcional por canal"},
                        "limit": {"type": "integer", "default": 50, "description": "Limite de registros"},
                    },
                },
            },
            {
                "name": "move_deal_stage",
                "description": "Altera a coluna/estágio da oportunidade de um contato ou negócio no painel Kanban.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "deal_id": {
                            "type": "string",
                            "description": "ID do Deal (ou informe contact_id para localizar automaticamente)",
                        },
                        "contact_id": {
                            "type": "string",
                            "description": "ID do contato dono da oportunidade (alternativa ao deal_id)",
                        },
                        "stage_name": {
                            "type": "string",
                            "description": "Nome ou ID do estágio de destino (ex: 'Proposta Apresentada', 'Fechado Ganho')",
                        },
                        "value": {
                            "type": "number",
                            "description": "Valor atualizado opcional da oportunidade (R$)",
                        },
                    },
                    "required": ["stage_name"],
                },
            },
            {
                "name": "add_contact_tag",
                "description": "Insere uma etiqueta (tag) em um contato e avalia gatilhos de automação associados.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "contact_id": {"type": "string", "description": "UUID do contato"},
                        "tag": {"type": "string", "description": "Etiqueta a ser adicionada"},
                    },
                    "required": ["contact_id", "tag"],
                },
            },
            {
                "name": "query_knowledge_base",
                "description": "Busca respostas oficiais na Base de Conhecimento para responder dúvidas de clientes sobre preços, planos e recursos.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Pergunta ou termos de busca"},
                        "top_k": {"type": "integer", "default": 3, "description": "Quantidade máxima de resultados"},
                    },
                    "required": ["query"],
                },
            },
            {
                "name": "send_chat_message",
                "description": "Envia uma mensagem ativa no canal do contato (WhatsApp, Instagram ou Web).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "contact_id": {"type": "string", "description": "UUID do contato destinatário"},
                        "content": {"type": "string", "description": "Conteúdo da mensagem a ser enviada"},
                        "sender": {
                            "type": "string",
                            "enum": ["agent", "human", "system"],
                            "default": "agent",
                            "description": "Identificador do remetente",
                        },
                    },
                    "required": ["contact_id", "content"],
                },
            },
        ]

    def call_tool(self, name: str, arguments: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Executa uma ferramenta MCP pelo nome e retorna resposta estruturada compatível com MCP."""
        args = arguments or {}

        if name == "create_contact":
            contact = Contact(
                name=args["name"],
                phone=args.get("phone"),
                email=args.get("email"),
                channel=args.get("channel", "whatsapp"),
                tags=args.get("tags") or [],
                custom_fields=args.get("custom_fields") or {},
            )
            created = self.db.create_contact(contact, create_default_deal=True)
            deal = self.db.get_contact_active_deal(created.id)
            return {
                "success": True,
                "tool": name,
                "result": {
                    "contact": created.model_dump(),
                    "deal": deal.model_dump() if deal else None,
                },
            }

        elif name == "list_contacts":
            contacts = self.db.list_contacts()
            tag_filter = (args.get("tag") or "").strip().lower()
            channel_filter = (args.get("channel") or "").strip().lower()
            limit = int(args.get("limit", 50))

            if tag_filter:
                contacts = [c for c in contacts if tag_filter in [t.lower() for t in c.tags]]
            if channel_filter:
                contacts = [c for c in contacts if c.channel.lower() == channel_filter]

            stages_map = {s.id: s.name for s in self.db.list_stages()}
            enriched = []
            for c in contacts[:limit]:
                deal = self.db.get_contact_active_deal(c.id)
                data = c.model_dump()
                data["deal"] = deal.model_dump() if deal else None
                data["stage_name"] = stages_map.get(deal.stage_id) if deal else None
                enriched.append(data)

            return {
                "success": True,
                "tool": name,
                "result": {"count": len(enriched), "contacts": enriched},
            }

        elif name == "move_deal_stage":
            deal_id = args.get("deal_id")
            contact_id = args.get("contact_id")
            stage_name = args["stage_name"]
            value = args.get("value")

            if not deal_id and contact_id:
                deal = self.db.get_contact_active_deal(contact_id)
                if deal:
                    deal_id = deal.id

            if not deal_id:
                return {"success": False, "tool": name, "error": "Deal não encontrado para os parâmetros informados."}

            moved = self.db.move_deal_stage(deal_id, stage_name, value=value)
            if not moved:
                return {"success": False, "tool": name, "error": f"Estágio '{stage_name}' ou Deal '{deal_id}' inválido."}

            stage_obj = self.db.get_stage(moved.stage_id)
            if stage_obj:
                self.workflow.evaluate(
                    contact_id=moved.contact_id,
                    event_type="stage_change",
                    event_value=stage_obj.name,
                )

            return {
                "success": True,
                "tool": name,
                "result": {
                    "deal": moved.model_dump(),
                    "stage_name": stage_obj.name if stage_obj else stage_name,
                },
            }

        elif name == "add_contact_tag":
            contact_id = args["contact_id"]
            tag = args["tag"]
            updated = self.db.add_contact_tag(contact_id, tag)
            if not updated:
                return {"success": False, "tool": name, "error": f"Contato '{contact_id}' não encontrado."}

            wf_actions = self.workflow.evaluate(
                contact_id=contact_id,
                event_type="tag",
                event_value=tag,
                channel=updated.channel,
            )
            return {
                "success": True,
                "tool": name,
                "result": {
                    "contact": updated.model_dump(),
                    "workflow_actions": wf_actions,
                },
            }

        elif name == "query_knowledge_base":
            query = args["query"]
            top_k = int(args.get("top_k", 3))
            matches = self.agent.search_knowledge_base(query, top_k=top_k)
            clean_matches = [
                {
                    "id": m["id"],
                    "question": m["question"],
                    "answer": m["answer"],
                    "category": m["category"],
                    "tags": m["tags"],
                    "score": m["score"],
                }
                for m in matches
            ]
            return {
                "success": True,
                "tool": name,
                "result": {
                    "query": query,
                    "matches": clean_matches,
                    "best_answer": clean_matches[0]["answer"] if clean_matches else None,
                },
            }

        elif name == "send_chat_message":
            contact_id = args["contact_id"]
            content = args["content"]
            sender = args.get("sender", "agent")
            contact = self.db.get_contact(contact_id)
            if not contact:
                return {"success": False, "tool": name, "error": f"Contato '{contact_id}' não encontrado."}

            msg = self.db.create_message(
                Message(
                    contact_id=contact_id,
                    sender=sender,
                    channel=contact.channel,
                    content=content,
                )
            )
            return {
                "success": True,
                "tool": name,
                "result": {"message": msg.model_dump()},
            }

        raise ValueError(f"Ferramenta MCP desconhecida: {name}")
