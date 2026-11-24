# Architecture Decision Records (ADRs) — Regen Flow

Este diretório contém os **Architecture Decision Records (ADRs)** oficiais do **Regen Flow** (SaaS Omnichannel, CRM Conversacional & Motor Nativo WhatsApp). Cada documento registra uma decisão arquitetural vinculante e as regras invariantes de negócio que todo código do sistema deve respeitar.

---

## Índice de ADRs

| ADR | Título | Status | Escopo Principal |
| :--- | :--- | :--- | :--- |
| [ADR-0001](file:///c:/Users/USER/Documents/antigravity/cool-lovelace/docs/adr/0001-arquitetura-geral-omnichannel-crm.md) | Arquitetura Geral Unificada (FastAPI + React SPA + Baileys Bridge) | Aceito | Inicialização unificada (`main.py`), WebSockets em tempo real (`/ws`) e comunicação interprocessos. |
| [ADR-0002](file:///c:/Users/USER/Documents/antigravity/cool-lovelace/docs/adr/0002-motor-whatsapp-baileys-lid-e-espelhamento.md) | Motor Híbrido WhatsApp (Baileys 7 + Meta Cloud API), Roteamento LID, Espelhamento e Exclusão ao Desconectar | Aceito | Suporte oficial/não-oficial, resolução `@lid`, espelhamento Celular $\leftrightarrow$ CRM, recibos `DELIVERED`/`READ` e limpeza total ao desconectar. |
| [ADR-0003](file:///c:/Users/USER/Documents/antigravity/cool-lovelace/docs/adr/0003-isolamento-vendedores-rbac-e-posse-exclusiva.md) | Isolamento Estrito de Vendedores, Posse Exclusiva de Lead (HTTP 403), Roleta e Super Admin | Aceito | RBAC por PIN, enclausuramento de abas/carteira, bloqueio `403 Forbidden`, modo Impersonate do Supervisor e bloqueio por inadimplência. |
| [ADR-0004](file:///c:/Users/USER/Documents/antigravity/cool-lovelace/docs/adr/0004-persistencia-neon-cache-memoria-e-lgpd.md) | Persistência Neon PostgreSQL, Cache Write-Through em Memória e Criptografia LGPD (AES-256) | Aceito | Cache `O(1)` em RAM para latência estilo WhatsApp Web, criptografia Fernet AES-256 em repouso, índice cego HMAC-SHA256 e Direito ao Esquecimento. |
| [ADR-0005](file:///c:/Users/USER/Documents/antigravity/cool-lovelace/docs/adr/0005-design-system-tokens-e-diretrizes-ux.md) | Design System Dark de Alta Precisão, Tokens Semânticos e Diretrizes UX | Aceito | Paleta estrita (`#0A0D14`, `#121824`, `#00D2FF`), proibição de cores fora dos tokens, acessibilidade e heurísticas de Nielsen. |
| [ADR-0006](file:///c:/Users/USER/Documents/antigravity/cool-lovelace/docs/adr/0006-agente-ia-debouncer-workflows-e-mcp.md) | Agente Conversacional IA, Anti-Fragmentação (Debouncer), Funil Automático e Servidor MCP | Aceito | Pausa automática da IA em intervenção humana, qualificação automática no Kanban, workflows e exposição das 8 ferramentas MCP. |

---

## Regras Invariantes do Sistema (Resumo Executivo)

1. **Posse Exclusiva de Conversa (`HTTP 403`)**: Quando um cliente está atribuído a um vendedor humano (`attendance_status = 'human'`), nenhum outro vendedor comum pode visualizar ou enviar mensagens naquela conversa. Apenas o dono da conversa ou um Supervisor (via intervenção ou espelhamento) pode operar.
2. **Pausa Automática da IA**: Sempre que um vendedor responde pelo CRM ou diretamente pelo aparelho celular físico da loja (`fromMe: true`), o Agente de IA é pausado automaticamente (`ai_enabled = False`, `attendance_status = 'human'`) para não atropelar o atendimento humano.
3. **Espelhamento Bidirecional Celular $\leftrightarrow$ CRM**: Mensagens enviadas pelo celular físico da loja aparecem instantaneamente no CRM como enviadas pela equipe (`sender = 'human'`), e mensagens enviadas pelo CRM chegam ao cliente e espelham no celular da loja com atualização de status em tempo real (`sent` $\rightarrow$ `delivered` $\rightarrow$ `read`).
4. **Exclusão Automática ao Desconectar o WhatsApp**: Ao desconectar o WhatsApp (pelo botão no CRM ou desconectando pelo celular), todas as conversas, mensagens, negócios do canal WhatsApp e caches em memória (Node.js, Python RAM e React State) são excluídos imediatamente, garantindo que nenhuma conversa fique retida na memória.
5. **Sincronização Instantânea ao Conectar**: Ao escanear o QR Code, o motor agrupa o histórico por conversa (`byChat`), resolve os mapeamentos `lidPnMappings` e grava em lote com atualização *Write-Through* em memória RAM.
6. **Bloqueio de Inadimplência Multi-Tenant**: Empresas clientes (`Tenants`) marcadas como inadimplentes (`is_active = False`) pelo Super Admin têm o acesso bloqueado imediatamente com `HTTP 403`.
