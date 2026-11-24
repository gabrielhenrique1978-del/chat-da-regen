# ADR-0004: Persistência Neon PostgreSQL, Cache Write-Through em Memória e Criptografia LGPD (AES-256)

* **Status:** Aceito
* **Data:** 2026-11-24
* **Autores:** Gabriel Henrique & Otavio Santana

## Contexto

O banco de dados principal roda em **Neon PostgreSQL Serverless** na nuvem (com fallback transparente para SQLite em ambiente de testes automatizados) e armazena todos os dados sensíveis criptografados com **AES-256 (Fernet)**. Consultar o banco na nuvem e descriptografar centenas de contatos e mensagens a cada requisição HTTP gerava latência de 350ms a 600ms, prejudicando a fluidez do chat.

## Decisão

### 1. Cache Write-Through em Memória RAM (`core/db.py`)
* A classe `Database` mantém uma camada de cache *thread-safe* protegida por `threading.RLock` (`_cache_lock`):
  * `_contacts_cache`: Lista ordenada de contatos já descriptografados em memória.
  * `_messages_cache`: Dicionário `contact_id -> List[Message]` com o histórico de cada conversa em memória.
  * `_sellers_cache`, `_pipelines_cache`, `_stages_cache`, `_deals_cache`: Entidades operacionais do CRM e Kanban.
* **Estratégia Write-Through:** Toda escrita (`create_contact`, `update_contact`, `create_message`, `set_message_external_id`, `update_message_delivery_status`, `bulk_import_whatsapp_history`) persiste no Neon PostgreSQL **e** atualiza imediatamente as estruturas em memória RAM em `O(1)`.
* Ao desconectar o WhatsApp (`clear_whatsapp_data`), todos os caches em memória são limpos simultaneamente à exclusão no banco.

### 2. Criptografia em Repouso (AES-256) e Índice Cego (`Blind Index`)
* Campos pessoais sensíveis (`contacts.phone`, `contacts.email`, `contacts.custom_fields`, `messages.content`, `appointments.notes`, `sellers.pin`, `meta_configs.access_token`) são criptografados antes de entrar no banco com prefixo `enc:v1:` via `encrypt_field` / `encrypt_dict` (`core/security.py`).
* Para permitir busca rápida por telefone sem descriptografar toda a tabela no SQL, cada contato armazena `phone_hash` calculado via **HMAC-SHA256** (`blind_index`) sobre os últimos 11 dígitos numéricos.

### 3. Conformidade Estrita com a LGPD (Lei nº 13.709/2018)
* **Opt-Out Automático e Manual (Art. 7º e 8º):** Contatos com `consent_status` em `opted_out` ou `anonymized` são bloqueados automaticamente de disparos de campanhas em massa (`execute_broadcast`).
* **Portabilidade e Acesso (Art. 18, II e V):** O endpoint `GET /api/contacts/{id}/lgpd-export` gera o dossiê JSON auditável completo do titular.
* **Direito ao Esquecimento / Anonimização Irreversível (Art. 18, VI):** O método `anonymize_contact_lgpd` apaga nome, telefone, hash, e-mail, agendamentos e histórico de mensagens do titular, registrando a operação na tabela imutável `audit_logs` (Art. 37).

## Consequências

* **Positivas:** Latência de leitura de contatos e mensagens reduzida de ~500ms para **< 25ms** (instantâneo como WhatsApp Web), mantendo 100% dos dados cifrados em repouso no Neon PostgreSQL.
