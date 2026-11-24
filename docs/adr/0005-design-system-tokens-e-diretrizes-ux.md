# ADR-0005: Design System Dark de Alta Precisão, Tokens Semânticos e Diretrizes UX

* **Status:** Aceito
* **Data:** 2026-11-24
* **Autores:** Gabriel Henrique & Otavio Santana

## Contexto

Interfaces corporativas de atendimento omnichannel são utilizadas por vendedores durante 8 a 10 horas diárias. A mistura arbitrária de cores, tamanhos de fonte, emojis decorativos ou diálogos bloqueantes (`alert()`) degrada a legibilidade e gera fadiga visual.

## Decisão

### 1. Paleta Estrita de Tokens Semânticos (`frontend/tailwind.config.js`)
Toda cor da interface deve utilizar exclusivamente os tokens definidos no Tailwind:
* `bg-canvas` (`#0A0D14`): Fundo principal da aplicação e áreas de leitura profunda.
* `bg-surface` (`#121824`): Painéis laterais, cabeçalhos, cards e modais.
* `bg-elevated` (`#1B2333`): Estados de hover, item selecionado, badges neutros e balões recebidos.
* `primary` (`#00D2FF` / hover `#38BDF8`): Ação principal, indicadores ativos, contadores de não lidas (`CountPill`) e recibo de leitura (`CheckCheck`).
* `secondary` (`#0072FF`): Balões de mensagens enviadas pela equipe (`bg-secondary/15 border-secondary/30`).
* `accent` (`#6366F1` / `accent-deep` `#4C1D95`): Notas internas da equipe (`whisper`), modo supervisão/espelhamento, alertas de bloqueio e confirmação de ações destrutivas.
* `text-fg` (`#F8FAFC`) e `text-muted` (`#94A3B8`): Hierarquia tipográfica com fonte `Inter` e números tabulares (`tabular-nums`) para horários, contadores e valores monetários.
* `border-line` (`rgba(148, 163, 184, 0.10)`) e `border-line-strong` (`rgba(148, 163, 184, 0.18)`): Divisórias sutis de 1px.

### 2. Primitivas Unificadas (`frontend/src/components/ui.jsx`)
* Botões (`Button`, `IconButton`), etiquetas (`Badge`, `CountPill`), indicadores (`StatusDot`, `Avatar`), campos (`Field`, `fieldClass`, `textareaClass`), seletores (`Tabs`, `Segmented`), janelas (`Modal`) e estados vazios (`EmptyState`) são centralizados em `ui.jsx`.

### 3. Regras de Usabilidade e UX (Heurísticas de Nielsen)
* **Proibição de `alert()` / `confirm()` nativos do navegador:** Todo feedback de sucesso, erro ou confirmação destrutiva (como excluir membro da equipe ou anonimizar titular LGPD) deve usar banners inline ou confirmação em 2 etapas dentro da própria interface.
* **Atalhos e Eficiência de Operação:**
  * Digitar `/` no composer de mensagem abre automaticamente o menu flutuante de Respostas Rápidas; pressionar `Escape` fecha menus e modais.
  * Campo de busca de conversas possui botão `X` para limpeza em 1 clique.
  * Imagens recebidas ou enviadas no chat abrem em visualização ampliada (Lightbox Modal) ao clicar.
  * Cards do Funil Kanban suportam tanto avanço rápido em 1 clique quanto **Drag & Drop** com atualização otimista instantânea.
* **Acessibilidade:** Suporte obrigatório a `:focus-visible`, `aria-label` em botões de ícone e respeito à preferência `@media (prefers-reduced-motion: reduce)`.

## Consequências

* **Positivas:** Coerência visual absoluta em todas as telas (estilo Linear / WhatsApp Web Dark) e zero classes órfãs ou cores hardcoded fora do Design System.
