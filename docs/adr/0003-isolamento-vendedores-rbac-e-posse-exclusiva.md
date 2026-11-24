# ADR-0003: Isolamento Estrito de Vendedores, Posse Exclusiva de Lead (HTTP 403), Roleta e Super Admin

* **Status:** Aceito
* **Data:** 2026-11-24
* **Autores:** Gabriel Henrique & Otavio Santana

## Contexto

Em operações comerciais com múltiplos vendedores atendendo no mesmo número de WhatsApp, é fundamental impedir que um vendedor veja ou atravesse a negociação de outro colega, enquanto o Supervisor mantém visão global e o Super Admin controla o acesso das empresas clientes (`Tenants`).

## Decisão

Estabelecemos quatro níveis estritos de governança e controle de acesso:

### 1. Isolamento de Interface e Carteira do Vendedor (`role = 'seller'`)
* Cada vendedor ou supervisor autentica sua sessão de operador com PIN individual (validado em tempo constante via `constant_time_compare` e armazenado criptografado com AES-256).
* Quando logado como **Vendedor comum** (`!isSupervisorMode`):
  * **Menu Lateral Enclausurado:** Exibe exclusivamente as abas **Atendimento** e **Funil de vendas**. As abas *Equipe*, *Conexões* e *Configurações/Administração* ficam ocultas.
  * **Lista de Conversas Isolada:** O vendedor enxerga apenas duas filas: `Meus atendimentos` (conversas atribuídas a ele) e `Fila de espera` (leads aguardando atendimento humano). Conversas de outros colegas ou em atendimento automático pela IA não são exibidas para ele.
  * **Funil Kanban Isolado:** Exibe apenas os negócios (`Deals`) cujo contato pertence à carteira daquele vendedor.

### 2. Trava de Posse Exclusiva no Backend (`HTTP 403 Forbidden`)
* Nos endpoints `POST /api/messages/send`, `POST /api/whatsapp/send-audio` e `POST /api/messages/send-template`:
  * Se o contato já estiver atribuído a um vendedor humano (`attendance_status == "human"` ou `not contact.ai_enabled`), o backend compara `req.sender_name` com `contact.assignee`.
  * Caso outro vendedor tente enviar mensagem sem flag de intervenção de supervisor (`is_supervisor_override`), a requisição é bloqueada imediatamente com **`HTTP 403 Forbidden`**.
  * Se o contato estava livre na fila ou com o `Agente IA`, o primeiro vendedor que responder assume automaticamente a posse exclusiva do lead.

### 3. Modo Supervisor, Roleta Round-Robin e Espelhamento de Conta (`Impersonate`)
* O **Supervisor** (`role = 'supervisor'`) visualiza todas as carteiras, fila de espera, atendimentos de colegas e conversas com a IA.
* **Roleta Round-Robin (`pick_next_round_robin_seller`):** Distribui leads da fila de espera automaticamente para o vendedor ativo com menor carga de conversas humanas abertas no momento.
* **Espelhamento (`Impersonate`) e Intervenção:** O supervisor pode entrar na visão de qualquer vendedor (`impersonatedSeller`) ou ativar a *Intervenção Direta* em um chat bloqueado, com registro de todas as ações na trilha de auditoria (`audit_logs`).

### 4. Super Admin e Bloqueio por Inadimplência (`Multi-Tenant`)
* O **Super Admin** gerencia todas as empresas clientes (`Tenants`), visualiza quantos usuários cada empresa possui e se estão **Em dia (`is_active = True`)** ou **Inadimplentes (`is_active = False`)**.
* Quando um Tenant é marcado como inadimplente pelo Super Admin, o middleware de segurança bloqueia imediatamente as operações daquela empresa com `HTTP 403 Forbidden` e exibe a tela de assinatura suspensa.

## Consequências

* **Positivas:** Blindagem completa contra conflitos entre vendedores na mesma loja e controle financeiro instantâneo de inadimplência no modelo SaaS.
