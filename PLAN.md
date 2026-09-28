# Plano da v1 — Attendant para restaurantes e lanchonetes

Objetivo da v1: um restaurante recebe pedidos reais pelo WhatsApp, do "oi" até o pedido na tela do balcão, sem ninguém vigiando a conversa. Tudo que não serve a isso está em "Fora da v1".

## Como executar este plano

- Uma fase por vez, na ordem. Cada fase termina com o sistema funcionando e testado.
- Antes de começar uma fase: leia `CLAUDE.md` e `.claude/rules/`. Todas as regras valem (tenantId primeiro argumento, erros tipados, i18n pt-BR + en-US, tokens de tema, skeleton no elemento, testes em backend E frontend).
- Ao terminar uma fase: `npm test`, `npm run lint`, `npm run typecheck` nos dois pacotes, marque os checkboxes aqui e atualize `CLAUDE.md` com o que mudou na arquitetura.
- Um commit por item lógico, em branch `feat/<fase>-<assunto>`. Não faça push sem pedir.
- Prompt sugerido: "Leia CLAUDE.md e PLAN.md e execute a Fase N. Pare ao fim da fase e me mostre o resumo."

## Convenções da v1 (valem para todas as fases)

- **Dinheiro em centavos, inteiro** (`price_cents INT`). Nunca float. Formatação BRL só na borda (frontend e resumo do pedido).
- **Fuso da loja**: `store_settings.timezone`, default `America/Sao_Paulo`. Horário de funcionamento é sempre avaliado nesse fuso.
- **A IA nunca calcula preço, total, taxa ou troco.** Tudo sai de funções puras em código. O LLM só escolhe ferramentas e conversa.
- **Snapshot no pedido**: `order_items` guarda nome e preço do momento. Editar o cardápio depois não altera pedido antigo.
- Toda tabela nova tem `tenant_id INT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` e entra no `init.sql` de forma idempotente.
- Funções puras (preço, horário, transição de status, resumo) ficam em arquivos próprios, sem banco, com testes de tabela.

---

## Fase 1 — Cardápio e Loja

Sem cardápio o agente não tem o que vender. Esta fase não mexe no agente.

### Backend
- [ ] Tabelas:
  - `menu_categories (id, tenant_id, name, position, active)`
  - `menu_items (id, tenant_id, category_id, name, description, price_cents, image_url NULL, available BOOL DEFAULT true, position, active)`
    - `available` = "esgotado hoje" (volta a true sozinho? não na v1, é manual). `active` = removido do cardápio.
  - `item_sizes (id, tenant_id, item_id, name, price_cents, position)` — se o item tem tamanhos, o preço vem do tamanho e `menu_items.price_cents` é ignorado.
  - `option_groups (id, tenant_id, item_id, name, min_select, max_select, pricing_rule, position)`
    - `pricing_rule`: `sum` (adicionais somam) | `max` | `average` (para pizza meio a meio: sabores num grupo com `max_select = 2`).
  - `options (id, tenant_id, group_id, name, price_cents, available, position)`
  - `store_settings (tenant_id PK, timezone, opening_hours JSONB, paused BOOL, min_order_cents, estimated_minutes, pickup_enabled, delivery_enabled, payment_methods TEXT[], pix_key NULL, owner_whatsapp NULL, updated_at)`
    - `opening_hours`: `{ "mon": [["11:00","15:00"],["18:00","23:30"]], ... }`. Intervalo que cruza meia-noite (`["18:00","02:00"]`) precisa funcionar.
    - `payment_methods`: subconjunto de `pix`, `cash`, `card_on_delivery`.
  - `delivery_zones (id, tenant_id, neighborhood, fee_cents, active)` — entrega por bairro na v1. Busca normalizada (sem acento, minúsculas).
- [ ] Módulo `modules/menu/`: repository + service. CRUD de categorias, itens, tamanhos, grupos, opções. Reordenar por `position`. `getPublishedMenu(tenantId)` devolve o cardápio completo ativo (usado pelo agente na fase 2), com cache curto invalidado na escrita (mesmo padrão de `settings.service`).
- [ ] Módulo `modules/store/`: settings + zonas. Funções puras em `store.hours.ts`:
  - `isOpenAt(settings, date): boolean`
  - `nextOpening(settings, date): Date | null`
  - `describeHours(settings): string` (texto pt-BR para o bot: "Seg a Sex 11h às 15h e 18h às 23h30")
- [ ] Rotas guardadas: `/api/menu/*`, `/api/store`, `/api/store/zones`. Validação com erro tipado `InvalidMenuError(code, field)` → 422 (novo branch no `errorHandler`).
- [ ] Seed: cardápio de lanchonete realista para a Pizzaria Demo (pizzas com tamanhos + borda + meio a meio, lanches com adicionais, bebidas), horários, 5 bairros com taxa, Pix + dinheiro + cartão.

### Frontend
- [ ] `/admin/menu`: lista por categoria; criar/editar item em drawer lateral (nome, descrição, preço OU tamanhos, grupos de adicionais); toggle "esgotado" direto na lista (ação mais usada no dia a dia, um clique); reordenar.
- [ ] `/admin/store`: horários por dia (vários intervalos), botão "fechar agora / reabrir", pedido mínimo, tempo estimado, retirada sim/não, formas de pagamento, chave Pix, WhatsApp do dono, tabela de bairros e taxas.
- [ ] Sidebar ganha Cardápio e Loja. Autosave no padrão de `/admin/settings` onde fizer sentido.

### Testes obrigatórios
- `store.hours`: intervalo normal, dois intervalos no dia, cruzando meia-noite, dia fechado, fuso diferente do servidor, loja pausada.
- Validação de item: sem preço e sem tamanho → 422; `min_select > max_select` → 422.
- Isolamento: toda query com `tenant_id`.

### Pronto quando
O dono cadastra o cardápio inteiro de uma lanchonete e as regras de entrega pelo painel, e a Pizzaria Demo nasce do seed com tudo preenchido.

---

## Fase 2 — Agente com ferramentas, carrinho e confirmação

O coração do produto. O agente para de só conversar e passa a montar pedido.

### 2.0 Provedor de LLM
- [ ] `createChatLlm()` passa a escolher o provedor por env (`LLM_PROVIDER=ollama|anthropic|openai`, `LLM_MODEL`, chave correspondente). Ollama continua sendo o default de dev. Tool calling com modelo pequeno local é instável; para o piloto com restaurante real, use um modelo hospedado.
- [ ] Toda chamada continua com `fetchWithTimeout` / timeout do SDK. `generateAgentReply` continua nunca lançando.

### Backend
- [ ] Tabelas:
  - `customers (id, tenant_id, phone, name, last_address JSONB NULL, created_at, UNIQUE(tenant_id, phone))` — criado/atualizado a cada conversa de WhatsApp.
  - `carts (conversation_id PK REFERENCES conversations ON DELETE CASCADE, tenant_id, items JSONB, fulfillment NULL, address JSONB NULL, zone_id NULL, payment_method NULL, change_for_cents NULL, notes NULL, status, summary_hash NULL, updated_at)`
    - `status`: `open` | `awaiting_confirmation`.
    - Carrinho sem atividade por 3h é descartado (verificado na leitura, sem job).
- [ ] Funções puras em `modules/order/`:
  - `pricing.ts` — `priceCart(cart, menu, zone, settings)` → `{ lines, subtotalCents, feeCents, totalCents, problems[] }`. Problemas: item indisponível, opção obrigatória faltando, acima do `max_select`, abaixo do pedido mínimo, bairro não atendido, troco menor que o total.
  - `summary.ts` — `formatOrderSummary(priced, cart)` → texto pt-BR para WhatsApp com itens, adicionais, subtotal, taxa, total, entrega/retirada, endereço, pagamento e troco. Termina com "Posso confirmar?".
  - `cartHash(cart)` — hash estável do conteúdo.
- [ ] Ferramentas do agente (`modules/agent/tools/`), cada uma com schema de entrada validado e saída em JSON curto:
  - `search_menu(query)` → itens que casam (nome, preço/tamanhos, grupos). Para cardápio pequeno (< ~60 itens) o cardápio resumido também vai no system prompt.
  - `add_item(item_id, size_id?, option_ids[], quantity, notes?)` → valida contra o cardápio e devolve o carrinho precificado ou o problema.
  - `remove_item(line_index)` / `update_quantity(line_index, quantity)`
  - `view_cart()`
  - `set_fulfillment(type: delivery|pickup, address?, neighborhood?)` → resolve a zona e a taxa.
  - `set_payment(method, change_for?)`
  - `request_confirmation()` → só funciona com carrinho sem `problems`. O SISTEMA envia `formatOrderSummary` (não o LLM), grava `summary_hash` e muda para `awaiting_confirmation`.
  - `place_order()` → recusa se status ≠ `awaiting_confirmation` ou se `cartHash` mudou desde o resumo. Cria o pedido (fase 3; até lá, grava em tabela provisória ou retorna mock) e limpa o carrinho.
  - `store_info()` → aberto/fechado, horários (`describeHours`), tempo estimado, pedido mínimo, formas de pagamento.
  - `call_human(reason)` → marca handoff (fase 4; até lá só registra).
- [ ] Loop do agente: no máximo 6 iterações de ferramenta por mensagem; estourou → fallback da persona.
- [ ] Loja fechada: o agente pode conversar e mostrar o cardápio, mas `request_confirmation` e `place_order` recusam com o próximo horário.
- [ ] Cliente recorrente: `customers.last_address` e o último pedido entram no contexto ("quer o mesmo de sábado?", "entrega no mesmo endereço?").
- [ ] Prompt (`agent.prompt.ts`): remover a regra "você não tem cardápio"; manter "nunca invente preço, item ou prazo — use as ferramentas"; nunca confirmar pedido sem `place_order` ter retornado sucesso; respostas curtas de WhatsApp.
- [ ] Mídia não suportada continua com o aviso fixo. Áudio fica para depois (ver Fora da v1).

### Frontend
- [ ] Simulador mostra, em modo dev (toggle), as ferramentas chamadas em cada turno e o carrinho atual ao lado da conversa. É a ferramenta de depuração do agente; o endpoint devolve isso só para o canal `simulator`.

### Testes obrigatórios
- `pricing`: tamanhos, adicionais somando, meio a meio com `max` e `average`, quantidade, taxa por bairro, mínimo, troco, item esgotado entre a adição e a confirmação.
- `summary`: snapshot de texto (aqui snapshot é aceitável, é o contrato com o cliente).
- `place_order`: recusa sem confirmação; recusa se o carrinho mudou depois do resumo; recusa com loja fechada.
- Agente com LLM mockado: sequência de tool calls simulada ponta a ponta (oi → pizza grande calabresa com borda → entrega no Centro → Pix → resumo → "sim" → pedido criado).

### Pronto quando
No simulador, um pedido completo de pizza meio a meio com borda, entrega e troco sai do "oi" até o "pedido confirmado" com o total certo, e mudar o carrinho depois do resumo força um novo resumo.

---

## Fase 3 — Pedidos em tempo real

A tela que fica aberta no balcão.

### Backend
- [ ] Tabelas:
  - `orders (id, tenant_id, number, customer_id, conversation_id, status, fulfillment, address JSONB, neighborhood, payment_method, change_for_cents, subtotal_cents, fee_cents, total_cents, notes, reject_reason, created_at, accepted_at, ready_at, completed_at, UNIQUE(tenant_id, number))`
    - `number`: sequencial por tenant (o que o balcão fala: "pedido 42").
  - `order_items (id, tenant_id, order_id, name, size_name, unit_price_cents, quantity, options JSONB, notes)` — snapshot.
- [ ] `order.status.ts` puro: máquina de estados.
  - `pending → accepted | rejected`
  - `accepted → out_for_delivery | ready_for_pickup` (conforme fulfillment)
  - `out_for_delivery | ready_for_pickup → completed`
  - `pending | accepted → cancelled`
  - Transição inválida → `InvalidTransitionError` → 409.
- [ ] Mensagem automática ao cliente em cada transição (texto fixo por status, com número e tempo estimado; rejeição inclui o motivo). Envio por canal: WhatsApp via `sendWhatsAppText`, simulador gravando mensagem outbound. Criar `sendOutbound(tenantId, conversationId, text)` no módulo conversation — nenhum outro módulo chama o client do WhatsApp direto.
- [ ] Rotas guardadas: `GET /api/orders?status=&date=`, `GET /api/orders/:id`, `POST /api/orders/:id/transition { to, reason? }`.
- [ ] Tempo real: `GET /api/orders/stream` (SSE) com EventEmitter em memória por tenant (instância única na v1; documentar que multi-instância exige Redis/pubsub). Autenticação via header no fetch streaming (não usar EventSource com token na URL).
- [ ] Alerta de pedido parado: pedido `pending` há mais de 5 min → mensagem ao cliente ("o restaurante já vai confirmar") e aviso no `owner_whatsapp`. Varredura com `setInterval` iniciada só no `index.ts` (nunca no import, para não travar o vitest).

### Frontend
- [ ] `/admin/orders` vira a tela inicial do painel. Kanban: Novos · Em preparo · Saiu / Pronto · Concluídos hoje. Cartão com número, cliente, total, tempo desde a criação (fica vermelho após 5 min em Novos).
- [ ] Som e título da aba piscando a cada pedido novo. Navegador bloqueia áudio sem interação: botão "Ativar som" visível até o primeiro clique.
- [ ] Aceitar / recusar (motivo obrigatório: esgotado, fora da área, fechando, outro).
- [ ] Drawer de detalhe com itens, adicionais, observações, pagamento, troco, endereço, link para a conversa.
- [ ] Imprimir comanda: CSS de impressão para 80mm, número grande, itens em destaque, sem cores.
- [ ] Reconexão automática do stream e indicador "ao vivo / reconectando".

### Testes obrigatórios
- Máquina de estados: todas as transições válidas e inválidas.
- Criação do pedido a partir do carrinho: snapshot correto, `number` sequencial por tenant, isolamento entre tenants.
- Mensagem ao cliente disparada em cada transição (canal mockado).
- Frontend: novo pedido chegando pelo stream aparece em Novos; recusa sem motivo não envia.

### Pronto quando
Pedido feito no simulador aparece no kanban na hora com som, e aceitar/avançar/concluir manda as mensagens certas de volta na conversa.

---

## Fase 4 — Conversas e atendimento humano

### Backend
- [ ] `conversations` ganha `bot_paused BOOL DEFAULT false`, `handoff_requested_at NULL`, `handoff_reason NULL`.
- [ ] `handleInboundMessage`: com `bot_paused`, grava a mensagem e não responde (o humano está atendendo).
- [ ] Fallback da persona e a ferramenta `call_human` marcam `handoff_requested_at` e avisam o `owner_whatsapp`.
- [ ] Rotas: `GET /api/conversations?filter=handoff|all`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages` (humano envia via `sendOutbound`), `POST /api/conversations/:id/pause`, `POST /api/conversations/:id/resume`.
- [ ] Mensagens novas entram no mesmo stream SSE (evento `message`).

### Frontend
- [ ] `/admin/conversations`: lista à esquerda (pedindo humano no topo, destacadas), conversa à direita, carrinho/último pedido do cliente no painel lateral, botões "Assumir" e "Devolver ao bot", composer para responder como a loja.

### Pronto quando
Uma conversa em que o bot não soube ajudar aparece destacada, o dono assume, responde pelo painel e devolve ao bot.

---

## Fase 5 — Onboarding e importação de cardápio

Decide se um restaurante novo entra em 10 minutos ou desiste.

### Backend
- [ ] `POST /api/menu/import` recebe foto(s) ou PDF do cardápio, usa um modelo com visão para extrair `{ categorias, itens, preços, tamanhos, adicionais }` em JSON validado por schema, e devolve uma PRÉVIA (nada é gravado).
- [ ] `POST /api/menu/import/confirm` grava a prévia revisada em lote, numa transação.
- [ ] Preços extraídos que não parecem preço, itens duplicados e categorias vazias voltam marcados na prévia para revisão.
- [ ] Conexão do WhatsApp na v1 é **manual**: o `phone_number_id` é preenchido por você (suporte) numa rota interna protegida. O Embedded Signup da Meta fica para depois; verificar o modo coexistência (número continua no app WhatsApp Business do dono).

### Frontend
- [ ] `/admin/onboarding`, aberto automaticamente enquanto a loja estiver incompleta: 1) dados da loja, 2) importar cardápio (upload → prévia editável → confirmar), 3) horários, entrega e pagamento, 4) testar no simulador, 5) status da conexão do WhatsApp.
- [ ] Checklist de "loja pronta" visível no topo do painel até tudo estar completo.

### Pronto quando
Com a foto de um cardápio real de lanchonete, o dono chega a um cardápio revisado e cadastrado sem digitar item por item.

---

## Fase 6 — Resumo e conta

- [ ] `/admin/summary`: pedidos e faturamento de hoje e dos últimos 7 dias, ticket médio, % de pedidos fechados pelo bot sem humano, itens mais vendidos. Contar pedidos por `status`, não mensagens (lição do dashboard do faq-chatbot).
- [ ] Conta: usuários da loja (convidar por e-mail, papel único `admin` na v1), status da assinatura (cobrança por Pix manual na v1, campo `subscription_status` no tenant controlado por você).
- [ ] LGPD mínima: aviso de privacidade no primeiro contato de cada cliente (texto fixo, uma vez) e rota para apagar os dados de um cliente.

---

## Fora da v1

- Pix com confirmação automática de pagamento (link / cobrança dinâmica).
- Transcrição de áudio (provável primeira prioridade da v2 no Brasil).
- Integração com iFood ou outros marketplaces.
- Múltiplas unidades por conta.
- Fidelidade, cupons e campanhas (exigem templates pagos da Meta).
- Embedded Signup da Meta (autoatendimento da conexão do WhatsApp).
- App mobile do dono (o painel precisa ser responsivo, e basta).
- Idiomas além de pt-BR no atendente.
