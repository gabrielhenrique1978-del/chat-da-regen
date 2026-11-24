# 🚀 Regen Flow — SaaS Omnichannel, CRM Conversacional & WhatsApp Native Engine

[![React](https://img.shields.io/badge/React-18.3%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Baileys Native](https://img.shields.io/badge/WhatsApp-Native%20Baileys%20Multi--Device-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://github.com/WhiskeySockets/Baileys)
[![PostgreSQL Neon](https://img.shields.io/badge/Neon_PostgreSQL-Cloud_SSL-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech)
[![Meta Graph API](https://img.shields.io/badge/Meta_Cloud_API-v21.0-0668E1?style=for-the-badge&logo=meta&logoColor=white)](https://developers.facebook.com)

Plataforma SaaS Executiva de **Atendimento Omnichannel & CRM Conversacional** com **Single Page Application (SPA) em React + Vite + Tailwind CSS**, backend assíncrono em **Python (FastAPI + WebSockets)**, banco de dados **PostgreSQL Serverless (Neon Cloud com SSL)**, **Motor Nativo Autônomo de WhatsApp Multi-Device (Baileys Node.js)** integrado, **Roteamento Inteligente de Meta LIDs**, **Isolamento Estrito de Vendedores** e **Controle Multi-Tenant / Super Admin**.

---

## 💡 A Grande Sacada Arquitetural: Motor Próprio de WhatsApp + Isolamento Blindado de Vendedores

Diferente de sistemas comuns que dependem de APIs pagas de terceiros ou servidores externos pesados que caem a todo momento, o **Regen Flow** foi projetado com uma engenharia autônoma e enxuta:

### 1. ⚡ WhatsApp Native Engine (Zero Custo & Sem Intermediários)
* **Microsserviço Embutido (`whatsapp_bridge/`):** Um servidor interno Node.js roda diretamente na porta `8080` utilizando **Baileys Multi-Device**.
* **Protocolo Oficial Multi-Device:** Comunica-se diretamente com a infraestrutura do WhatsApp via WebSocket seguro (Criptografia Noise, Curve25519 e pacotes binários Protobuf).
* **Persistência de Sessão Instantânea:** As chaves criptográficas da sessão são salvas em `auth_info_baileys/`. Após parear uma única vez pelo QR Code no celular, o sistema reconecta automaticamente em milissegundos a cada inicialização, sem requerer nova leitura.
* **Compatibilidade e Transparência:** Expõe endpoints REST padronizados (`/instance/connect`, `/message/sendText`, `/message/sendWhatsAppAudio`, etc.) e Webhooks locais em tempo real para o FastAPI (`http://localhost:8000/api/webhooks/evolution`).
* **Suporte Híbrido:** Além do motor nativo via QR Code, o sistema possui suporte nativo à **Meta Cloud API Oficial (Graph API v21.0)** para contas corporativas via Token.

### 2. 🛡️ Inteligência de Roteamento de Meta LIDs (Privacidade WhatsApp Business)
* **Resolução Transparente de LIDs:** Contas do WhatsApp Business utilizam identificadores internos de 15 dígitos (**LIDs** da Meta) para proteção de dados. O motor detecta automaticamente o destino (`@lid` vs `@s.whatsapp.net`), garantindo 100% de entrega tanto no envio quanto no recebimento.
* **Detecção Automática do Telefone Real:** Captura o número real do chip via stanzas de mensagens (`sender_pn`), eventos de agenda e `chats.phoneNumberShare`.
* **Solicitação Oficial de Telefone (1-Clique):** Caso o cliente esteja com o número protegido pela Meta, o operador pode clicar em **"Solicitar Telefone"** no CRM, disparando a solicitação interativa oficial no WhatsApp do cliente com botão nativo de compartilhamento.

### 3. 🔒 Isolamento Estrito de Vendedores (Multi-Atendente de Alta Segurança)
* **Sessão Individual Travada por PIN:** Cada colaborador possui sua credencial única.
* **Menu Enclausurado para o Vendedor:** O vendedor comum **só enxerga duas abas**:
  * **Atendimento (Inbox):** Apenas os clientes da sua carteira pessoal (`Meus atendimentos`) e a `Fila de Espera` para puxar novos leads. Chats de colegas de equipe desaparecem completamente da tela dele.
  * **Funil de Vendas (Kanban CRM):** Exibe exclusivamente os seus próprios negócios, permitindo que ele passe o cliente de etapa no funil com total autonomia e foco.
  * **Abas Administrativas Ocultas:** As abas *Equipe*, *Conexões (WhatsApp/QR Code)* e *Configurações* são 100% invisíveis para o vendedor comum.
* **Trava de Posse no Backend (HTTP 403 Forbidden):** Mesmo se houver tentativa de injeção direta de requisição, o backend valida estritamente a posse do lead. Se um atendente tentar responder a um lead de outro colega, o servidor bloqueia o envio com erro `403`.
* **Modo Supervisor Global:** O supervisor tem visão total de todas as conversas, roleta de distribuição de leads, botão de intervenção em chats e gestão completa de equipe e conexões.

---

## ✨ Principais Funcionalidades

* 🎨 **SPA Moderna em React + Vite + Tailwind CSS:**
  * **Design System Sóbrio e de Alta Precisão:** Paleta rigorosa `#0A0D14` (Canvas), `#121824` (Cards/Superfícies), `#1B2333` (Hover), `#00D2FF` (Ação primária) e tipografia fluida.
  * **Feed de Chat em Tempo Real:** Balões diferenciados, envio de áudio nativo (PTT), envio de imagens/documentos, atalhos rápidos (`/`) e disparador de Templates HSM.
  * **Gaveta de Contexto do Lead (Retrátil):** Histórico completo, movimentação de etapa no funil, edição rápida de telefone real e notas internas colaborativas.
* 👥 **Gestão Dinâmica de Equipe:**
  * Cadastro de vendedores e supervisores com PIN individual, soft delete (`active: true/false`) e preservação histórica de conversas.
* 📊 **Funil CRM Kanban Drag & Drop:**
  * Visualização clara das colunas e valores de negócios, com filtros automáticos por vendedor logado.
* 👑 **Arquitetura Multi-Tenant & Super Admin:**
  * Isolamento entre instâncias de empresas clientes (`Tenants`) e gestão de suspensão por inadimplência.
* ☁️ **Persistência em Nuvem com Neon PostgreSQL:**
  * Banco de dados serverless com SSL ativo e criptografia AES-256 (Fernet) de dados sensíveis em conformidade com a LGPD.

---

## 🗂️ Estrutura de Pastas do Projeto

```text
cool-lovelace/
├── frontend/                        # Single Page Application (React 18 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx          # Menu lateral com controle estrito de permissões (Vendedor vs Supervisor)
│   │   │   ├── OmnichannelInbox.jsx # Chat Omnichannel com filtragem isolada de carteira
│   │   │   ├── ContactDrawer.jsx    # Gaveta lateral: detalhes, edição de fone, solicitação Meta e CRM
│   │   │   ├── KanbanView.jsx       # Funil CRM com filtragem automática por vendedor
│   │   │   ├── SellersView.jsx      # Gestão de Vendedores, PINs e Supervisão
│   │   │   ├── ConnectionsView.jsx  # QR Code do WhatsApp Nativo e status de conexão
│   │   │   └── SettingsView.jsx     # Painel Administrativo Root e Tenants
│   │   ├── lib/
│   │   │   ├── api.js               # Cliente HTTP REST padronizado + Cliente WebSocket (/ws)
│   │   │   └── utils.js             # Utilitários de design e formatação
│   │   ├── App.jsx                  # Orquestrador global, segurança de rotas e WebSocket
│   │   ├── main.jsx                 # Entrypoint React
│   │   └── index.css                # Diretivas Tailwind CSS
│   ├── package.json                 # Scripts npm run dev / npm run build
│   └── vite.config.js               # Proxy de desenvolvimento para backend
├── whatsapp_bridge/                 # Motor Nativo de WhatsApp (Node.js + Baileys Multi-Device)
│   ├── server.js                    # Servidor WebSocket Baileys, roteador LID/PN e endpoints REST
│   ├── auth_info_baileys/           # Sessão criptografada persistente do WhatsApp (Noise/Curve25519)
│   └── package.json                 # Dependências Baileys e Pino
├── api/
│   └── routes.py                    # Rotas FastAPI, WebSockets (/ws), Webhooks e bloqueio estrito 403
├── core/
│   ├── db.py                        # Persistência Neon PostgreSQL com fallback SQLite
│   ├── meta_cloud_service.py        # Conector Oficial Meta Cloud API v21.0
│   └── security.py                  # Criptografia AES-256 (Fernet) + HMAC-SHA256
├── engine/
│   ├── whatsapp.py                  # Conector com o microsserviço Baileys e controle de estado
│   ├── agent.py                     # Agente conversacional e qualificação de leads
│   ├── debouncer.py                 # Anti-fragmentação temporal de mensagens
│   └── mcp.py                       # Servidor Model Context Protocol
├── docs/
│   └── adr/                         # Architecture Decision Records (ADRs 0001 a 0006 e regras do sistema)
├── main.py                          # Inicializador unificado (inicia Baileys e FastAPI juntos)
├── requirements.txt                 # Dependências Python
└── README.md                        # Documentação técnica da plataforma
```

---

## 💻 Como Executar o Projeto

Com apenas um comando, o sistema inicia automaticamente o **Motor WhatsApp Baileys (porta 8080)** e o **Backend FastAPI (porta 8000)**:

```powershell
# Ativar ambiente virtual
.\.venv\Scripts\Activate.ps1

# Iniciar o servidor unificado (FastAPI + WhatsApp Bridge)
python main.py
```

Acesse no navegador: **`http://localhost:8000`**

---

## 📄 Licença e Autoria

Este projeto e toda a sua arquitetura inovadora foram desenvolvidos por:

* 👨‍💻 **Gabriel Henrique**
* 👨‍💻 **Otavio Santana**

Copyright © 2026 **Gabriel Henrique e Otavio Santana**. Todos os direitos reservados.
