# ADR-0006: Agente Conversacional IA, Anti-Fragmentação (Debouncer), Funil Automático e Servidor MCP

* **Status:** Aceito
* **Data:** 2026-11-24
* **Autores:** Gabriel Henrique & Otavio Santana

## Contexto

Clientes no WhatsApp frequentemente enviam várias mensagens curtas em sequência ("Oi", "Tudo bem?", "Qual o valor?"). Além disso, o sistema precisa qualificar leads 24/7 com IA, avançar negócios automaticamente no Kanban, pausar a IA imediatamente quando um humano assume e expor ferramentas padronizadas para agentes externos via **Model Context Protocol (MCP)**.

## Decisão

### 1. Anti-Fragmentação Temporal (`engine/debouncer.py`)
* O `MessageDebouncer` agrupa fragmentos enviados pelo mesmo contato dentro de uma janela configurável (`window_seconds = 2.0s`) em um único texto consolidado antes de acionar o motor de IA, evitando respostas duplicadas ou picotadas.

### 2. Agente Conversacional e Pausa Automática em Atendimento Humano (`engine/agent.py`)
* **Governo de Handoff:**
  * Se `contact.ai_enabled == False` ou `contact.attendance_status in ("human", "waiting")`, o Agente de IA apenas registra a mensagem do cliente no histórico e **não envia resposta automática**.
  * Sempre que um vendedor humano envia mensagem pelo CRM (`POST /api/messages/send`) ou pelo celular físico da loja (`fromMe: true` no webhook), o sistema desativa `ai_enabled` e muda `attendance_status` para `"human"` automaticamente.
  * Caso o cliente solicite atendimento humano (`"falar com atendente"`, `"falar com vendedor"`), o Agente transfere a conversa para a `Fila de Espera Humana` (`attendance_status = "waiting"`).
* **Avanço Automático de Etapa no Kanban:**
  * O motor analisa a intenção da mensagem (`INTENT_RULES`) e move o negócio automaticamente para `Qualificação`, `Proposta Apresentada`, `Fechado Ganho` ou `Fechado Perdido`, ajustando a temperatura do lead (`hot`, `warm`, `cold`) e o `lead_score`.
* **Extração Automática de Dados:**
  * Extrai e-mail, nome da empresa, orçamento estimado e cargo a partir do texto natural do cliente e preenche `contact.custom_fields`.

### 3. Motor de Workflows (`engine/workflow.py`)
* Avalia regras baseadas em gatilhos (`keyword`, `stage_change`, `tag_added`) para aplicar tags de prioridade e disparar mensagens automáticas configuradas pela operação.

### 4. Servidor Model Context Protocol Nativo (`engine/mcp.py`)
* Expõe via `GET /api/mcp/tools` e `POST /api/mcp/execute` 8 ferramentas padronizadas com JSON Schema para operação por IAs externas (Claude, Cursor, ChatGPT):
  1. `create_contact`
  2. `list_contacts`
  3. `move_deal_stage`
  4. `add_contact_tag`
  5. `query_knowledge_base`
  6. `send_chat_message`
  7. `schedule_appointment`
  8. `get_pipeline_overview`

## Consequências

* **Positivas:** Harmonia completa entre automação de IA e operação humana, com funil comercial que se atualiza sozinho e interoperabilidade aberta via protocolo MCP.
