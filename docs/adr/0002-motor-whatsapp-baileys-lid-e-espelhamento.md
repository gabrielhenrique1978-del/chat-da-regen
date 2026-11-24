# ADR-0002: Motor Híbrido WhatsApp (Baileys 7 + Meta Cloud API), Roteamento LID, Espelhamento e Exclusão ao Desconectar

* **Status:** Aceito
* **Data:** 2026-11-24
* **Autores:** Gabriel Henrique & Otavio Santana

## Contexto

O sistema precisa oferecer duas saídas reais e funcionais para uso do WhatsApp:
1. **Saída Oficial (Meta Cloud API — Graph API v21.0)** para contas corporativas que utilizam WABA ID, Phone Number ID, janela de 24 horas e templates HSM.
2. **Saída Não-Oficial / Nativa via QR Code (`@whiskeysockets/baileys` v7)** que funcione em total sincronia com o aparelho celular físico da loja, suporte o padrão de privacidade **Meta LID (`@lid`)** e gerencie o ciclo de vida das conversas sem reter lixo na memória ao desconectar.

## Decisão

Determinamos as seguintes regras técnicas obrigatórias para o motor de WhatsApp:

### 1. Suporte Nativo a Meta LID (`@lid`) e Resolução de Telefone Real
* O motor opera sobre o `@whiskeysockets/baileys` v7 (`7.0.0-rc14`) com `enableRecentMessageCache: true` e o patch automático `whatsapp_bridge/patch-baileys.js` (que garante o atributo `recipient` em retries direcionados a dispositivos próprios `meLid`).
* Eventos `lid-mapping.update`, `lidPnMappings` do histórico, `senderPn` e `chats.phoneNumberShare` são mapeados bidirecionalmente em tempo real (`lidToPhoneMap` e `phoneToLidMap`).
* Quando o contato ainda está oculto sob um LID de 14–15 dígitos, a interface exibe o selo `Meta LID` e permite disparar a solicitação nativa oficial de compartilhamento de número (`requestPhoneNumber`).

### 2. Espelhamento Bidirecional Celular $\leftrightarrow$ CRM e Duplo Check em Tempo Real
* **Envio pelo Celular $\rightarrow$ CRM:** Toda mensagem ou mídia enviada a partir do celular físico da loja (`fromMe: true` ou envelope `deviceSentMessage`) é capturada pelo bridge, deduplicada contra ecos do próprio CRM, atribuída a `sender = "human"` com `delivery_status = "delivered"` e transmitida via WebSocket para a tela do CRM.
* **Envio pelo CRM $\rightarrow$ Cliente + Celular:** Toda mensagem enviada pelo CRM recebe um `messageId` (`generateMessageIDV2`), é pré-armazenada no `sentMessagesCache` antes do envio na rede e seu `external_id` é vinculado imediatamente no banco via `db.set_message_external_id()`.
* **Recibos de Entrega e Leitura (`1 risco` $\rightarrow$ `2 riscos`):** O evento `messages.update` no bridge monitora mudanças de `status` (`3 = DELIVERED`, `4/5 = READ`), dispara `messages.status_update` para o FastAPI, atualiza `delivery_status` sem permitir regressão de status e atualiza o ícone na interface de `<Check />` (1 risco) para `<CheckCheck />` (2 riscos cinzas ou ciano quando lida).

### 3. Exclusão Automática Total ao Desconectar o WhatsApp
* **Regra Invariante:** Ao desconectar o WhatsApp — seja clicando em **"Desconectar"** no CRM (`POST /api/whatsapp/disconnect`), seja desconectando pelo aparelho celular (`DisconnectReason.loggedOut`) — o sistema **DEVE**:
  1. Executar `clearBridgeMemoryAndAuth()` no Node.js (limpando todos os mapas em memória e removendo `auth_info_baileys/`).
  2. Executar `db.clear_whatsapp_data()` no backend Python (excluindo todas as mensagens, negócios, agendamentos e contatos do canal `whatsapp` no PostgreSQL e zerando `_contacts_cache`, `_messages_cache` e `_deals_cache`).
  3. Emitir `whatsapp_disconnected` via WebSocket para que o frontend limpe imediatamente `contactDetailCacheRef`, `contacts`, `selectedContactId` e `contactDetail`.

### 4. Sincronização Automática e Instantânea ao Conectar
* Ao escanear o QR Code, o evento `messaging-history.set` agrupa as mensagens recebidas por conversa (`byChat`), mantendo até as 35 mensagens mais recentes de **cada conversa ativa** e enviando-as em lotes de 200 para `bulk_import_whatsapp_history`, que grava em transação única no banco e atualiza o cache em memória via *Write-Through*.

## Consequências

* **Positivas:** O vendedor pode alternar livremente entre o celular e o computador; ao trocar de conta de WhatsApp ou desconectar, nenhuma conversa antiga fica retida na tela ou no banco.
