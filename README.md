# OpenChatFunnel — CRM Conversacional, Kanban Dinâmico & MCP Server

Implementação open-source (Clean-Room Design) de plataforma de CRM Conversacional com fila única omnichannel (`whatsapp`, `instagram`, `web`), anti-fragmentação de mensagens (`MessageDebouncer`), agente inteligente com base de conhecimento (`ConversationalAgent`), funil Kanban dinâmico por intenção de compra, motor de workflows (`WorkflowEngine`) e servidor **Model Context Protocol (MCP)**.

## Estrutura do Projeto

- [`core/db.py`](core/db.py): Modelos de domínio Pydantic (`Contact`, `Message`, `KnowledgeItem`, `Pipeline`, `Stage`, `Deal`, `WorkflowRule`) e camada de persistência transacional SQLite.
- [`engine/debouncer.py`](engine/debouncer.py): `MessageDebouncer` com janela temporal configurável (2s) para agrupar mensagens picadas concorrentes do mesmo contato.
- [`engine/agent.py`](engine/agent.py): `ConversationalAgent` com busca na base de conhecimento por sobreposição de termos/tags, extração de campos customizados e avanço automático de estágio no Kanban.
- [`engine/workflow.py`](engine/workflow.py): `WorkflowEngine` declarativo para avaliação de gatilhos (`keyword`, `tag`, `stage_change`) e execução de ações (`add_tag`, `send_message`, `move_stage`).
- [`engine/mcp.py`](engine/mcp.py): `MCPServer` expondo as 6 ferramentas MCP (`create_contact`, `list_contacts`, `move_deal_stage`, `add_contact_tag`, `query_knowledge_base`, `send_chat_message`).
- [`api/routes.py`](api/routes.py): Endpoints REST em FastAPI.
- [`web/index.html`](web/index.html): Dashboard SPA interativo com Tailwind CSS e FontAwesome.
- [`tests/test_engine.py`](tests/test_engine.py): Suíte de testes automatizados (5 testes unitários e de integração).

## Como Executar

```powershell
# Iniciar o servidor web FastAPI (porta 8000)
.\.venv\Scripts\python main.py
```

Acesse o painel em: **http://127.0.0.1:8000**

## Como Rodar os Testes

```powershell
.\.venv\Scripts\pytest -v
```
