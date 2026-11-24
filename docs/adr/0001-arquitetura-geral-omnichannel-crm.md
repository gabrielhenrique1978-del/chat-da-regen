# ADR-0001: Arquitetura Geral Unificada (FastAPI + React SPA + Baileys Bridge)

* **Status:** Aceito
* **Data:** 2026-11-24
* **Autores:** Gabriel Henrique & Otavio Santana

## Contexto

Plataformas de atendimento omnichannel e CRM conversacional precisam operar com latência próxima de zero (estilo WhatsApp Web), suportar múltiplos operadores simultâneos via WebSockets e manter conexão persistente com o WhatsApp sem depender obrigatoriamente de intermediários pagos.

## Decisão

Adotamos uma arquitetura unificada composta por três camadas coordenadas por um único ponto de entrada (`main.py`):

1. **Frontend Single Page Application (`frontend/`)**:
   * Construído em **React 18 + Vite + Tailwind CSS**.
   * Compilado para `frontend/dist` e servido diretamente pelo FastAPI na porta `8000` (ou via proxy Vite em desenvolvimento), eliminando problemas de CORS em produção.
   * Mantém conexão persistente via WebSocket (`/ws`) com reconexão automática e cache otimista local (`contactDetailCacheRef`) para troca instantânea entre conversas.

2. **Backend Principal e Orquestrador (`api/routes.py`, `core/`, `engine/`)**:
   * Construído em **Python (FastAPI + Uvicorn)**.
   * Gerencia autenticação JWT, isolamento Multi-Tenant, regras de posse de vendedores, criptografia LGPD, Funil Kanban, Agente de IA e servidor MCP.
   * Distribui eventos em tempo real para todos os clientes conectados via `ConnectionManager` (`ws_manager.broadcast_event`).

3. **Microsserviço Isolado WhatsApp Bridge (`whatsapp_bridge/server.js`)**:
   * Processo **Node.js (Express + `@whiskeysockets/baileys` v7)** iniciado e monitorado automaticamente como subprocesso pelo `main.py` na porta local `127.0.0.1:8080`.
   * Protegido por middleware defensivo que aceita apenas tráfego de loopback (`127.0.0.1` / `::1`) ou requisições autenticadas com `EVOLUTION_API_KEY`.
   * Encaminha todos os eventos de mensagens, histórico, QR Code e recibos de entrega para o webhook interno `POST http://localhost:8000/api/webhooks/evolution`.

## Consequências

* **Positivas:** Um único comando (`python main.py`) sobe toda a infraestrutura; falhas ou reconexões no socket do WhatsApp nunca bloqueiam o event loop do FastAPI.
* **Restrições:** O bridge Node.js nunca deve ser exposto publicamente na internet sem a chave `EVOLUTION_API_KEY`; toda interação do frontend ocorre exclusivamente via FastAPI (`/api/*`).
