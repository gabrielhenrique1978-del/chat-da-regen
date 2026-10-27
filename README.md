# 🚀 OpenChatFunnel — SaaS Omnichannel, CRM Conversacional & Meta Cloud API

[![React](https://img.shields.io/badge/React-18.3%20%2B%20Vite-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL Neon](https://img.shields.io/badge/Neon_PostgreSQL-Cloud_SSL-336791?style=for-the-badge&logo=postgresql&logoColor=white)](https://neon.tech)
[![Meta Graph API](https://img.shields.io/badge/Meta_Cloud_API-v21.0-0668E1?style=for-the-badge&logo=meta&logoColor=white)](https://developers.facebook.com)

Plataforma SaaS Executiva de **Atendimento Omnichannel & CRM Conversacional** com **Single Page Application (SPA) em React + Vite + Tailwind CSS**, backend assíncrono em **Python (FastAPI + WebSockets)**, banco de dados **PostgreSQL Serverless (Neon Cloud com SSL)**, **API Oficial da Meta (Graph API v21.0 + Evolution API QR Code)**, **Gestão Dinâmica de Vendedores com Soft Delete** e **Controle Multi-Tenant / Super Admin**.

---

## ✨ Principais Funcionalidades

* 🎨 **SPA Moderna em React + Vite + Tailwind CSS:**
  * **Sidebar Retrátil:** Navegação fluida entre Atendimento Omnichannel, Funil CRM Kanban, Gestão de Vendedores, Conexões WhatsApp/Meta e Super Admin, com suporte nativo a **Dark / Light Mode**.
  * **Tela de Atendimento Omnichannel (3 Colunas):**
    1. **Painel de Conversas:** Busca rápida, filtros por status (Fila/Meus/Todos) e por canal (WhatsApp/Instagram/Web), avatares e preview da última mensagem com horário.
    2. **Área de Chat:** Cabeçalho do lead, balões diferenciados (Cliente vs. Vendedor/IA), recibos de leitura da Meta (`✓✓`), trava de exclusividade de carteira entre vendedores, atalhos rápidos (`/`) e disparador de Templates HSM Oficiais da Meta.
    3. **Gaveta Lateral do Contato (Retrátil):** Dados criptografados do lead, etapa do funil de vendas e seletor dinâmico do vendedor responsável (`seller_id`).
* 👥 **Gestão Dinâmica de Vendedores (`GET/POST/PATCH /api/sellers`):**
  * Cadastro, edição e ativação/desativação via **Soft Delete (`active: true/false`)**, preservando 100% do histórico de conversas vinculadas a cada vendedor.
* 📱 **Dupla Integração WhatsApp & Instagram:**
  * **API Oficial da Meta (Graph API v21.0):** Validação HMAC-SHA256 (`X-Hub-Signature-256`), controle automático da janela de 24h (`meta_window_expires_at`) e envio de Templates HSM.
  * **Evolution API v2 (QR Code):** Conexão rápida Multi-Device via QR Code.
* 👑 **Arquitetura Multi-Tenant & Identidade Root (`Super Admin` vs `Tenant`):**
  * Diferenciação nativa entre o proprietário da plataforma (`role = "superadmin"`) e empresas clientes (`Tenants`), com suspensão instantânea de inadimplentes (`HTTP 403`).
* ☁️ **Banco de Dados na Nuvem (Neon PostgreSQL + Fallback SQLite):**
  * Conexão automática via `DATABASE_URL` com `sslmode=require` e criptografia de campos sensíveis **AES-256 (Fernet) + HMAC-SHA256**.

---

## 🗂️ Estrutura de Pastas do Projeto

```text
cool-lovelace/
├── frontend/                        # Single Page Application (React 18 + Vite + Tailwind CSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── Sidebar.jsx          # Sidebar lateral retrátil + Seletor de Operador + Tema
│   │   │   ├── OmnichannelInbox.jsx # Tela de Atendimento Omnichannel em 3 Colunas
│   │   │   ├── ContactDrawer.jsx    # 3ª Coluna: Gaveta do Lead, Etapa do Funil e Vendedor
│   │   │   ├── SellersView.jsx      # Tela/Modal de Gestão Dinâmica de Vendedores (Soft Delete)
│   │   │   ├── KanbanView.jsx       # Funil CRM Kanban Drag & Drop
│   │   │   ├── ConnectionsView.jsx  # Conexão WhatsApp QR Code & Meta Cloud API v21.0
│   │   │   └── SettingsView.jsx     # Painel Root Super Admin (Tenants) & Segurança AES-256
│   │   ├── lib/
│   │   │   ├── api.js               # Cliente HTTP REST padronizado + Cliente WebSocket (/ws)
│   │   │   └── utils.js             # Utilitários Tailwind (clsx + tailwind-merge) e formatação
│   │   ├── App.jsx                  # Orquestrador global de estado, WebSocket e rotas SPA
│   │   ├── main.jsx                 # Entrypoint React
│   │   └── index.css                # Diretivas Tailwind CSS e estilos customizados
│   ├── index.html
│   ├── package.json                 # Scripts npm run dev / npm run build
│   ├── tailwind.config.js
│   └── vite.config.js               # Proxy automático de /api e /ws para http://localhost:8000
├── api/
│   └── routes.py                    # Rotas FastAPI, CORS, WebSockets (/ws) e entrega do build React
├── core/
│   ├── db.py                        # Camada de persistência híbrida (Neon PostgreSQL + SQLite)
│   ├── meta_cloud_service.py        # Conector Oficial Meta Cloud API v21.0 (WhatsApp & Instagram)
│   └── security.py                  # Criptografia AES-256 (Fernet) + HMAC-SHA256 e JWT
├── engine/
│   ├── agent.py                     # Agente conversacional IA e avanço de funil
│   ├── debouncer.py                 # Anti-fragmentação temporal de mensagens
│   ├── mcp.py                       # Servidor Model Context Protocol (8 ferramentas)
│   ├── whatsapp.py                  # Conector Evolution API v2
│   └── workflow.py                  # Motor de regras de automação
├── LICENSE                          # Licença de Software e Direitos Autorais
├── main.py                          # Inicializador do servidor Uvicorn / FastAPI (Porta 8000)
└── requirements.txt                 # Dependências Python
```

---

## 💻 Como Executar o Projeto

### 1. Backend Python (FastAPI + Neon PostgreSQL)
```powershell
# Ativar ambiente virtual e instalar dependências
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Iniciar o servidor FastAPI na porta 8000
python main.py
```

### 2. Frontend React (Vite + Tailwind CSS)
```powershell
cd frontend
npm install

# Rodar servidor de desenvolvimento Vite (http://localhost:5173)
npm run dev

# Gerar build otimizado de produção (servido também pelo FastAPI em http://localhost:8000)
npm run build
```

---

## 📄 Licença e Autoria

Este projeto e toda a sua arquitetura full stack foram desenvolvidos por:

* 👨‍💻 **Gabriel Henrique**
* 👨‍💻 **Otavio Santana**

Copyright © 2026 **Gabriel Henrique e Otavio Santana**. Todos os direitos reservados conforme especificado no arquivo [`LICENSE`](LICENSE).
