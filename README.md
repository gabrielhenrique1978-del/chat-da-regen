# 🌱 Chat da Regen — CRM Conversacional, Atendimento WhatsApp & Servidor MCP

[![Python](https://img.shields.io/badge/Python-3.11%20%7C%203.12-243E30?style=for-the-badge&logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![WhatsApp Evolution](https://img.shields.io/badge/WhatsApp-Evolution%20v2-25D366?style=for-the-badge&logo=whatsapp&logoColor=white)](https://evolution-api.com)
[![Security](https://img.shields.io/badge/Security-AES--256%20%2B%20HMAC-emerald?style=for-the-badge&logo=shield&logoColor=white)](https://cryptography.io)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

Plataforma executiva de **CRM Conversacional**, automação de vendas e atendimento omnichannel com **WhatsApp Real (Evolution API)**, **Fila Única com Anti-Fragmentação (Debouncer)**, **Kanban de Oportunidades Drag & Drop**, **Handoff Humano**, **Gravação de Áudio PTT**, **Base de Conhecimento (FAQ/IA)** e **Servidor Model Context Protocol (MCP)**.

---

## 🚀 Principais Funcionalidades

* 📱 **Integração Real com WhatsApp (Evolution API):** Conexão via QR Code oficial (Multi-Device Meta), sem desconectar o celular. Envio de texto, áudios gravados (PTT) e sincronização bidirecional.
* 💬 **Central Omnichannel com Ambientes Separados:**
  * **Atendimento Oficial:** Conversa direta com o cliente via WhatsApp/Instagram/Web.
  * **Notas da Equipe (Whisper):** Canal privado interno para a equipe alinhar estratégias sem o cliente ver.
  * **Simulador Inbound:** Ambiente para testar fluxos e automações antes de disparar para a base real.
* ⚡ **Produtividade de Vendas com Slash Commands (`/`):** Menu flutuante de respostas rápidas com filtro em tempo real e navegação por teclado (`↑`, `↓`, `Enter`, `Tab`, `Esc`).
* 🎧 **Player de Áudio com Velocímetro:** Reprodução de mensagens de voz com controle de velocidade em `1x`, `1.5x` e `2x`.
* 📋 **Funil Kanban Drag & Drop:** Movimentação visual de negociações entre etapas com atualização de valor e status em tempo real.
* 🛡️ **Segurança LGPD & Criptografia Militar:** Todos os telefones, e-mails e mensagens confidenciais são armazenados sob criptografia autenticada **AES-256 (Fernet) + HMAC-SHA256**.
* 🤖 **Servidor MCP Nativo (8 Ferramentas):** Integração padronizada com Cursor, Claude Desktop e ChatGPT (`create_contact`, `move_deal_stage`, `schedule_appointment`, `query_knowledge_base`, etc.).
* ☁️ **Deploy em 1 Clique no Render:** Blueprint pronto em [`render.yaml`](render.yaml) e suporte completo a contêineres Docker.

---

## 🛠️ Arquitetura do Projeto

```
cool-lovelace/
├── api/
│   └── routes.py            # Endpoints REST FastAPI, WebSockets (/ws) e Segurança
├── core/
│   ├── db.py                # Modelos Pydantic, transações SQLite e Seed executivo
│   └── security.py          # Motor criptográfico AES-256 + HMAC e mascaramento PII
├── engine/
│   ├── agent.py             # Agente conversacional e avanço automático de funil
│   ├── debouncer.py         # Anti-fragmentação temporal de mensagens concorrentes
│   ├── mcp.py               # Catálogo de 8 ferramentas do Model Context Protocol
│   ├── whatsapp.py          # Conector Evolution API (WhatsApp real, QR Code e PTT)
│   └── workflow.py          # Motor de regras declarativas por palavras-chave e tags
├── web/
│   └── index.html           # SPA executivo (Tailwind, Glassmorphism e Web Audio API)
├── tests/
│   └── test_engine.py       # Suíte de 8 testes automatizados (100% aprovados)
├── Dockerfile               # Imagem Docker leve Python 3.11
├── render.yaml              # Especificação de Blueprint para nuvem Render
└── requirements.txt         # Dependências do projeto
```

---

## 💻 Instalação e Execução Local

### 1. Clonar e Instalar Dependências
```powershell
git clone https://github.com/gabrielhenrique1978-del/chat-da-regen.git
cd chat-da-regen

# Criar e ativar ambiente virtual
python -m venv .venv
.\.venv\Scripts\Activate.ps1

# Instalar dependências
pip install -r requirements.txt
```

### 2. Iniciar o Servidor
```powershell
python main.py
```
Acesse o painel executivo em: **http://localhost:8000**

---

## 🧪 Testes Automatizados

Para rodar a suíte completa de testes de integridade, debounce, regras de workflow, ferramentas MCP e criptografia:

```powershell
.\.venv\Scripts\pytest -v
```

---

## ☁️ Deploy na Nuvem (Render)

1. Conecte o repositório ao [Render Dashboard](https://dashboard.render.com).
2. Selecione **New Blueprint** e aponte para este repositório.
3. O Render configurará automaticamente a porta dinâmica `$PORT`, compilará os pacotes e colocará o serviço no ar com HTTPS ativo.

---

## 📄 Licença
Distribuído sob licença comercial e open-source para implementação corporativa.
Desenvolvido por **Gabriel Henrique** — *Chat da Regen*.
