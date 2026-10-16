# Especificação de Engenharia Reversa e Arquitetura: OpenChatFunnel

## 1. Visão Geral da Engenharia Reversa (Clean-Room Design)

Esta especificação documenta a decomposição comportamental e arquitetural da plataforma de CRM e automação comercial [ChatFunnel](https://chatfunnel.com.br/), seguida pela concepção e implementação do projeto de código aberto **OpenChatFunnel**.

A metodologia aplicada segue o princípio de **Clean-Room Software Engineering**: nenhum código proprietário foi descompilado ou infringido; a reconstrução baseou-se exclusivamente na observação de fluxos operacionais públicos, contratos de interface (APIs e MCP), documentação técnica e requisitos funcionais de CRM conversacional.

---

## 2. Decomposição Funcional da Solução de Referência

O software comercial original integra subsistemas fundamentais:

| Módulo | Comportamento Observado | Especificação Reversa para o OpenChatFunnel |
| :--- | :--- | :--- |
| **Inbox & Canais** | Fila única para WhatsApp e Instagram com atribuição a atendentes e histórico cronológico. | Repositório central de contatos e mensagens com suporte a múltiplos canais (`whatsapp`, `instagram`, `web`), handoff humano e notas internas (`whisper`). |
| **Anti-Fragmentação** | Buffer de mensagens para evitar disparos múltiplos quando o cliente envia frases picadas no chat. | Módulo `MessageDebouncer` com janela temporal configurável (2 segundos) agrupando mensagens concorrentes. |
| **Agente Inteligente & KB** | Assistente 24/7 com base de conhecimento (preços, dúvidas) e extração de dados da conversa. | `ConversationalAgent` integrando busca por sobreposição de termos/tags e preenchimento de campos customizados. |
| **Funil Kanban Dinâmico** | Cards no Kanban que avançam automaticamente conforme a conversa evolui, sem depender de arrastar manual. | Mapeamento automático de intenções de compra (`proposta`, `orçamento`, `fechamento`) + suporte a Drag & Drop HTML5 e múltiplos funis. |
| **Automação, Agenda & Broadcast** | Gatilhos por palavra-chave, agendamento de calls, follow-up anti-vácuo e disparos em massa. | `WorkflowEngine`, módulo `Appointment`, radar anti-vácuo e motor de `BroadcastCampaign` com variáveis dinâmicas. |
| **Integração MCP** | Exposição de ferramentas para Claude, Cursor e ChatGPT operarem a ferramenta. | Módulo `MCPServer` com especificação padronizada de esquemas JSON e executores diretos de operações CRM. |
