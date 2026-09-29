# Plano da v1 — Attendant para restaurantes e lanchonetes

Objetivo da v1: um restaurante recebe pedidos pelo atendente, do "oi" até o pedido na tela do balcão, sem ninguém vigiando a conversa. Tudo que não serve a isso está em "Fora da v1".

**O WhatsApp é a ÚLTIMA fase (Fase 7).** Até lá, todo o sistema é construído e testado pelo simulador do painel, que passa pelo mesmo `handleInboundMessage` que o webhook vai usar. Regra para as fases 1 a 6: nenhuma funcionalidade pode depender do WhatsApp estar ligado. Mensagens ao cliente saem por `sendOutbound` (canal-agnóstico) e avisos ao dono aparecem no painel.

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
- **Canal-agnóstico**: nenhum módulo fora de `modules/whatsapp/` chama o client da Meta. Toda mensagem ao cliente sai por `sendOutbound(tenantId, conversationId, text)`, que decide pelo canal da conversa.

---

## Fase 1 — Cardápio e Loja

Sem cardápio o agente não tem o que vender. Esta fase não mexe no agente.

### Backend
- [x] Tabelas:
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
- [x] Módulo `modules/menu/`: repository + service. CRUD de categorias, itens, tamanhos, grupos, opções. Reordenar por `position`. `getPublishedMenu(tenantId)` devolve o cardápio completo ativo (usado pelo agente na fase 2), com cache curto invalidado na escrita (mesmo padrão de `settings.service`).
- [x] Módulo `modules/store/`: settings + zonas. Funções puras em `store.hours.ts`:
  - `isOpenAt(settings, date): boolean`
  - `nextOpening(settings, date): Date | null`
  - `describeHours(settings): string` (texto pt-BR para o bot: "Seg a Sex 11h às 15h e 18h às 23h30")
- [x] Rotas guardadas: `/api/menu/*`, `/api/store`, `/api/store/zones`. Validação com erro tipado `InvalidMenuError(code, field)` → 422 (novo branch no `errorHandler`).
- [x] Seed: cardápio de lanchonete realista para a Pizzaria Demo (pizzas com tamanhos + borda + meio a meio, lanches com adicionais, bebidas), horários, 5 bairros com taxa, Pix + dinheiro + cartão.

### Frontend
- [x] `/admin/menu`: lista por categoria; criar/editar item em drawer lateral (nome, descrição, preço OU tamanhos, grupos de adicionais); toggle "esgotado" direto na lista (ação mais usada no dia a dia, um clique); reordenar.
- [x] `/admin/store`: horários por dia (vários intervalos), botão "fechar agora / reabrir", pedido mínimo, tempo estimado, retirada sim/não, formas de pagamento, chave Pix, WhatsApp do dono, tabela de bairros e taxas.
- [x] Sidebar ganha Cardápio e Loja. Autosave no padrão de `/admin/settings` onde fizer sentido.

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
- [x] `createChatLlm()` passa a escolher o provedor por env (`LLM_PROVIDER=ollama|anthropic|openai`, `LLM_MODEL`, chave correspondente). Ollama continua sendo o default de dev. Tool calling com modelo pequeno local é instável; para o piloto com restaurante real, use um modelo hospedado.
- [x] Toda chamada continua com `fetchWithTimeout` / timeout do SDK. `generateAgentReply` continua nunca lançando.

### Backend
- [x] Tabelas:
  - `customers (id, tenant_id, phone, name, last_address JSONB NULL, created_at, UNIQUE(tenant_id, phone))` — criado/atualizado a cada conversa de WhatsApp.
  - `carts (conversation_id PK REFERENCES conversations ON DELETE CASCADE, tenant_id, items JSONB, fulfillment NULL, address JSONB NULL, zone_id NULL, payment_method NULL, change_for_cents NULL, notes NULL, status, summary_hash NULL, updated_at)`
    - `status`: `open` | `awaiting_confirmation`.
    - Carrinho sem atividade por 3h é descartado (verificado na leitura, sem job).
- [x] Funções puras em `modules/order/`:
  - `pricing.ts` — `priceCart(cart, menu, zone, settings)` → `{ lines, subtotalCents, feeCents, totalCents, problems[] }`. Problemas: item indisponível, opção obrigatória faltando, acima do `max_select`, abaixo do pedido mínimo, bairro não atendido, troco menor que o total.
  - `summary.ts` — `formatOrderSummary(priced, cart)` → texto pt-BR para WhatsApp com itens, adicionais, subtotal, taxa, total, entrega/retirada, endereço, pagamento e troco. Termina com "Posso confirmar?".
  - `cartHash(cart, totalCents)` — hash estável do conteúdo + total (preço que mudou entre o resumo e o "sim" invalida a confirmação).
- [x] Ferramentas do agente (`modules/agent/tools/`), cada uma com schema de entrada validado e saída em JSON curto:
  - `search_menu(query)` → itens que casam (nome, preço/tamanhos, grupos). Para cardápio pequeno (< ~60 itens) o cardápio resumido também vai no system prompt.
  - `add_item(item_id, size_id?, option_ids[], quantity, notes?)` → valida contra o cardápio e devolve o carrinho precificado ou o problema.
  - `remove_item(line_number)` / `update_quantity(line_number, quantity)` (1-based, o número da linha em `view_cart`)
  - `view_cart()`
  - `set_fulfillment(type: delivery|pickup, address?, neighborhood?)` → resolve a zona e a taxa.
  - `set_payment(method, change_for?)`
  - `request_confirmation()` → só funciona com carrinho sem `problems`. O SISTEMA envia `formatOrderSummary` (não o LLM), grava `summary_hash` e muda para `awaiting_confirmation`.
  - `place_order()` → recusa se status ≠ `awaiting_confirmation` ou se `cartHash` mudou desde o resumo. Cria o pedido por `createOrder` (fase 3) e limpa o carrinho. A confirmação ao cliente é texto do SISTEMA, não do modelo.
  - `store_info()` → aberto/fechado, horários (`describeHours`), tempo estimado, pedido mínimo, formas de pagamento.
  - `call_human(reason)` → marca handoff (fase 4; até lá só registra).
- [x] Loop do agente: no máximo 6 iterações de ferramenta por mensagem; estourou → fallback da persona.
- [x] Loja fechada: o agente pode conversar e mostrar o cardápio, mas `request_confirmation` e `place_order` recusam com o próximo horário.
- [x] Cliente recorrente: `customers.last_address` e o último pedido entram no contexto ("quer o mesmo de sábado?", "entrega no mesmo endereço?").
- [x] Prompt (`agent.prompt.ts`): remover a regra "você não tem cardápio"; manter "nunca invente preço, item ou prazo — use as ferramentas"; nunca confirmar pedido sem `place_order` ter retornado sucesso; respostas curtas de WhatsApp.
- [x] Mídia não suportada continua com o aviso fixo. Áudio fica para depois (ver Fora da v1).

### Frontend
- [x] Simulador mostra, em modo dev (toggle), as ferramentas chamadas em cada turno e o carrinho atual ao lado da conversa. É a ferramenta de depuração do agente; o endpoint devolve isso só para o canal `simulator`.
- [x] **Clientes simulados**: o simulador deixa escolher ou criar um cliente de teste (nome + telefone fictício). Cada um é uma conversa própria (`contact = sim-<telefone>`) e um registro em `customers`. É o que permite testar cliente recorrente ("o mesmo de sábado") e, na Fase 3, vários pedidos simultâneos no kanban sem WhatsApp. Backend: `/api/simulator` passa a receber `contactId`.

### Testes obrigatórios
- `pricing`: tamanhos, adicionais somando, meio a meio com `max` e `average`, quantidade, taxa por bairro, mínimo, troco, item esgotado entre a adição e a confirmação.
- `summary`: snapshot de texto (aqui snapshot é aceitável, é o contrato com o cliente).
- `place_order`: recusa sem confirmação; recusa se o carrinho mudou depois do resumo; recusa com loja fechada.
- Agente com LLM mockado: sequência de tool calls simulada ponta a ponta (oi → pizza grande calabresa com borda → entrega no Centro → Pix → resumo → "sim" → pedido criado).

### Pronto quando
> **Estado:** implementado e coberto por testes (incluindo o fluxo ponta a ponta com LLM roteirizado) e verificado contra Postgres real. Ainda falta rodar o fluxo completo com um modelo HOSPEDADO (`LLM_PROVIDER=anthropic|openai`): com `llama3.2` local o laço de ferramentas funciona, mas leva 80–125 s por turno e às vezes escreve um "resumo" no lugar de chamar `request_confirmation` — por isso o piloto usa modelo hospedado.

No simulador, um pedido completo de pizza meio a meio com borda, entrega e troco sai do "oi" até o "pedido confirmado" com o total certo, e mudar o carrinho depois do resumo força um novo resumo.

---

## Fase 2.5 — Cardápio em link (o cliente vê o que escolhe)

Problema: pelo chat o cliente não vê fotos, tamanhos nem adicionais. Catálogo do WhatsApp não serve (item plano: sem tamanhos, grupos de opções nem meio a meio) e listar nomes no texto está descartado. Solução: o atendente manda um link para uma página web mobile com o cardápio real; o cliente monta o carrinho lá e volta ao WhatsApp, onde o pedido continua (entrega, pagamento, resumo, "sim") exatamente como na Fase 2.

Fluxo: `send_menu_link` → link `…/c/<código>` → página (fotos, tamanhos, sabores, adicionais, total ao vivo) → "Confirmar itens" → backend valida com `priceCart` e grava em `carts` → `sendOutbound` manda "Recebi seu carrinho…" na conversa → botão "Voltar ao WhatsApp" (`wa.me`, texto pré-preenchido) → agente segue de onde parou.

### Backend
- [x] Link curto: `/c/<código>` com código aleatório de 12 caracteres (72 bits) apontando para uma linha de `menu_links` (tenant, conversa e validade de 3h ficam no banco, não na URL — link curto e revogável). O link válido da conversa é reaproveitado. Nada de preço vem do navegador.
- [x] `PUBLIC_APP_URL` (base do frontend). Sem ela em produção, `send_menu_link` devolve erro e o agente segue pelo chat.
- [x] Ferramenta `send_menu_link`: o SISTEMA envia o texto com o link e encerra o turno (mesmo padrão do resumo). O prompt manda preferir o link para quem quer pedir e continuar de `view_cart` quando o carrinho já veio do cardápio.
- [x] `GET /api/public/menu/:token` (loja, cardápio público, carrinho atual, `whatsappUrl`) e `POST /api/public/cart/:token` (valida TODAS as linhas com `priceCart`, grava, avisa no chat). Público, autenticado só pelo token, com rate limit em memória por IP. Erros tipados: 401 `invalid_menu_link`/`expired_menu_link`, 422 `cart_empty`/`cart_invalid` (com os problemas por linha), 429 `rate_limited`.
- [x] `store_settings.whatsapp_number` (número do atendimento, só dígitos) para o `wa.me`; sem ele (ou no simulador) a página só pede para voltar à conversa.
- [x] Funil: `menu_link_events` (`sent` → `opened` → `confirmed` → `ordered`), contagem por conversa distinta nos últimos 7 dias em `GET /api/dashboard`.

### Frontend
- [x] Rota pública `/c/:token` (fora do painel, sem login): cabeçalho da loja com aberto/fechado, chips de categoria, cartões com foto, folha do item (tamanho, opções com mín./máx., quantidade, observação, preço ao vivo), barra do carrinho, folha do carrinho (editar/remover), tela final com "Voltar ao WhatsApp". Esqueleto no grid, erro de link inválido/expirado, mobile-first, só tokens de tema, i18n pt-BR + en-US.
- [x] Painel: campo "WhatsApp do atendimento" em Loja › Geral; bloco "Funil do cardápio" na Visão geral.
- [x] Simulador: links viram clicáveis no balão e a conversa recarrega ao voltar para a aba (o pedido feito na página chega como mensagem).

### Testes obrigatórios
- Código: formato, aleatoriedade, lixo recusado sem consultar o banco, desconhecido → `invalid_menu_link`, vencido → `expired_menu_link`, reaproveitamento, colisão, isolamento por tenant.
- Pura: `toPublicMenu` (só ativos, sem campos internos), `parseCartItems`, mensagens (link, carrinho recebido para cada próximo passo), `wa.me`.
- Confirmação: rejeita linha inválida (tamanho/opção/esgotado) sem gravar, aceita carrinho sem entrega/pagamento, grava e avisa o chat, falha do aviso não desfaz o carrinho, isolamento entre tenants.
- Ferramenta: `send_menu_link` com resposta do sistema; sem `PUBLIC_APP_URL` → erro.
- Frontend: cálculo de preço espelha o backend (tabela), folha do item respeita mín./máx., carrinho, envio, estados de erro.

### Pronto quando
> **Estado:** implementado e coberto por testes; o backend foi exercitado ao vivo (servidor real + Postgres: página pública, carrinho inválido recusado, carrinho válido gravado com preço 8250 = 7200 + média dos sabores 250 + borda 800, mensagem "Recebi seu carrinho" gravada na conversa, funil `sent/opened/confirmed`). **Falta** ver a página num navegador/celular de verdade e rodar o fluxo com um modelo hospedado que funcione (a chave do Gemini estava sem créditos).

No simulador o "quero pedir" devolve um link; o link abre o cardápio com fotos; montar meio a meio com borda mostra o total certo; "Confirmar itens" faz a mensagem "Recebi seu carrinho" aparecer na conversa e o agente continua com entrega, pagamento, resumo e "sim" até o pedido cair no kanban. O funil mostra os quatro passos.

---

## Fase 3 — Pedidos em tempo real

A tela que fica aberta no balcão.

### Backend
- [x] Tabelas (+ `order_counters` para o número atômico). **Desvio:** `customers` é da Fase 2, então por enquanto `orders` guarda `customer_name`/`customer_phone` como snapshot; `customer_id` entra na Fase 2 via `ADD COLUMN IF NOT EXISTS`.
  - `orders (id, tenant_id, number, customer_id, conversation_id, status, fulfillment, address JSONB, neighborhood, payment_method, change_for_cents, subtotal_cents, fee_cents, total_cents, notes, reject_reason, created_at, accepted_at, ready_at, completed_at, UNIQUE(tenant_id, number))`
    - `number`: sequencial por tenant (o que o balcão fala: "pedido 42").
  - `order_items (id, tenant_id, order_id, name, size_name, unit_price_cents, quantity, options JSONB, notes)` — snapshot.
- [x] `order.status.ts` puro: máquina de estados.
  - `pending → accepted | rejected`
  - `accepted → out_for_delivery | ready_for_pickup` (conforme fulfillment)
  - `out_for_delivery | ready_for_pickup → completed`
  - `pending | accepted → cancelled`
  - Transição inválida → `InvalidTransitionError` → 409.
- [x] Mensagem automática ao cliente em cada transição (texto fixo por status, com número e tempo estimado; rejeição inclui o motivo). Criar `sendOutbound(tenantId, conversationId, text)` no módulo conversation: grava a mensagem outbound e, só se o canal for `whatsapp`, envia pela Meta. Nas fases 1 a 6 só o simulador existe na prática, e as mensagens aparecem na conversa do cliente simulado.
- [x] Rotas guardadas: `GET /api/orders` (quadro: em andamento + encerrados de hoje no fuso da loja; filtros `?status=&date=` ficam para quando houver histórico), `GET /api/orders/:id`, `POST /api/orders/:id/transition { to, reason? }`.
- [x] Tempo real: `GET /api/orders/stream` (SSE) com EventEmitter em memória por tenant (instância única na v1; documentar que multi-instância exige Redis/pubsub). Autenticação via header no fetch streaming (não usar EventSource com token na URL).
- [ ] Alerta de pedido parado: pedido `pending` há mais de 5 min → mensagem ao cliente ("o restaurante já vai confirmar") via `sendOutbound` e evento `order_stale` no stream (o painel destaca). O aviso no WhatsApp pessoal do dono fica para a Fase 7. Varredura com `setInterval` iniciada só no `index.ts` (nunca no import, para não travar o vitest).

### Frontend
- [x] `/admin/orders` vira a tela inicial do painel. Kanban: Novos · Em preparo · Saiu / Pronto · Concluídos hoje. Cartão com número, cliente, total, tempo desde a criação (fica vermelho após 5 min em Novos).
- [x] Som e título da aba piscando a cada pedido novo. Navegador bloqueia áudio sem interação: botão "Ativar som" visível até o primeiro clique.
- [x] Aceitar / recusar (motivo obrigatório: esgotado, fora da área, fechando, outro).
- [x] Drawer de detalhe com itens, adicionais, observações, pagamento, troco, endereço, link para a conversa.
- [ ] Imprimir comanda: CSS de impressão para 80mm, número grande, itens em destaque, sem cores.
- [x] Reconexão automática do stream e indicador "ao vivo / reconectando".
- [x] Até a Fase 2 existir: pedidos de exemplo no seed e botão "Pedido de teste" (só em dev, `POST /api/orders/dev-sample`), montado do cardápio real e ligado à conversa do simulador de quem clicou. A Fase 2 chama o mesmo `createOrder`.

### Testes obrigatórios
- Máquina de estados: todas as transições válidas e inválidas.
- Criação do pedido a partir do carrinho: snapshot correto, `number` sequencial por tenant, isolamento entre tenants.
- Mensagem ao cliente disparada em cada transição (canal mockado).
- Frontend: novo pedido chegando pelo stream aparece em Novos; recusa sem motivo não envia.

### Pronto quando
Pedido feito no simulador aparece no kanban na hora com som, e aceitar/avançar/concluir manda as mensagens certas de volta na conversa do cliente simulado. Três clientes simulados com pedidos ao mesmo tempo aparecem corretamente.

---

## Fase 4 — Conversas e atendimento humano

### Backend
- [ ] `conversations` ganha `bot_paused BOOL DEFAULT false`, `handoff_requested_at NULL`, `handoff_reason NULL`.
- [ ] `handleInboundMessage`: com `bot_paused`, grava a mensagem e não responde (o humano está atendendo).
- [ ] Fallback da persona e a ferramenta `call_human` marcam `handoff_requested_at` e emitem evento `handoff` no stream (o painel mostra contador e som). Aviso no WhatsApp do dono fica para a Fase 7.
- [ ] Rotas: `GET /api/conversations?filter=handoff|all`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages` (humano envia via `sendOutbound`), `POST /api/conversations/:id/pause`, `POST /api/conversations/:id/resume`.
- [ ] Mensagens novas entram no mesmo stream SSE (evento `message`).

### Frontend
- [ ] `/admin/conversations`: mostra conversas de todos os canais (hoje, só as do simulador), com o canal indicado. Lista à esquerda (pedindo humano no topo, destacadas), conversa à direita, carrinho/último pedido do cliente no painel lateral, botões "Assumir" e "Devolver ao bot", composer para responder como a loja.

### Pronto quando
Uma conversa em que o bot não soube ajudar aparece destacada, o dono assume, responde pelo painel e devolve ao bot.

---

## Fase 5 — Onboarding e importação de cardápio

Decide se um restaurante novo entra em 10 minutos ou desiste.

### Backend
- [ ] `POST /api/menu/import` recebe foto(s) ou PDF do cardápio, usa um modelo com visão para extrair `{ categorias, itens, preços, tamanhos, adicionais }` em JSON validado por schema, e devolve uma PRÉVIA (nada é gravado).
- [ ] `POST /api/menu/import/confirm` grava a prévia revisada em lote, numa transação.
- [ ] Preços extraídos que não parecem preço, itens duplicados e categorias vazias voltam marcados na prévia para revisão.

### Frontend
- [ ] `/admin/onboarding`, aberto automaticamente enquanto a loja estiver incompleta: 1) dados da loja, 2) importar cardápio (upload → prévia editável → confirmar), 3) horários, entrega e pagamento, 4) testar no simulador. O passo de conexão do WhatsApp entra na Fase 7.
- [ ] Checklist de "loja pronta" visível no topo do painel até tudo estar completo.

### Pronto quando
Com a foto de um cardápio real de lanchonete, o dono chega a um cardápio revisado e cadastrado sem digitar item por item.

---

## Fase 6 — Resumo e conta

- [x] Resumo (adiantado, virou a primeira aba `/admin/dashboard` "Visão geral"): pedidos e faturamento de hoje e dos últimos 7 dias, ticket médio, itens mais vendidos, entrega × retirada, formas de pagamento, status da loja. Contando pedidos por `status`, não mensagens.
- [ ] Resumo: % de pedidos fechados pelo bot sem humano (depende do handoff da Fase 4).
- [ ] Conta: usuários da loja (convidar por e-mail, papel único `admin` na v1), status da assinatura (cobrança por Pix manual na v1, campo `subscription_status` no tenant controlado por você).
- [ ] LGPD mínima: aviso de privacidade no primeiro contato de cada cliente (texto fixo, uma vez) e rota para apagar os dados de um cliente.

---

## Fase 7 — WhatsApp (última)

O webhook, a assinatura, a deduplicação e o envio já existem desde a base (`modules/whatsapp/`, testados). Esta fase liga o que foi construído no simulador ao canal real.

### Backend
- [ ] Revisar que tudo das fases 1 a 6 passa por `handleInboundMessage` / `sendOutbound` — nenhum caminho exclusivo do simulador (exceto o modo dev de depuração do agente).
- [ ] `customers` a partir do `wa_id` e do nome de perfil do webhook (mesmo fluxo dos clientes simulados).
- [ ] Avisos ao dono no `owner_whatsapp`: pedido parado (Fase 3) e pedido de humano (Fase 4). Fora da janela de 24h a Meta exige template aprovado; na v1, aceitar que o aviso só chega se o dono tiver mandado mensagem ao número nas últimas 24h, ou cadastrar um template utilitário.
- [ ] Rota interna protegida para preencher `tenants.whatsapp_phone_number_id` (conexão manual, feita por você).
- [ ] Mensagens de status do pedido: confirmar que cabem na janela de 24h (o cliente acabou de escrever) e tratar o erro da Meta quando não couber (log + evento no painel, nunca derrubar a transição do pedido).
- [ ] Mídia: o aviso fixo de "só texto" já existe; conferir com áudio, imagem e localização reais.

### Frontend
- [ ] Passo "Conectar WhatsApp" no onboarding e status da conexão em `/admin/store`.
- [ ] Conversas mostram o canal e o nome de perfil do WhatsApp.

### Teste manual (número de teste da Meta, ver README)
- [ ] Pedido completo pelo celular, do "oi" à confirmação, aparecendo no kanban.
- [ ] Reenvio do mesmo webhook não duplica resposta nem pedido.
- [ ] Mudança de status no painel chega no celular.
- [ ] Handoff: assumir pelo painel, responder, devolver ao bot.

### Pronto quando
Um pedido feito do celular pelo WhatsApp percorre exatamente o mesmo caminho que já funcionava no simulador.

---

## Fase N — Migração do backend para NestJS

Branch `refactor/migrar-backend-nest` (parte do commit `9f75ab9`). **Sem mudança de contrato**: mesmas rotas, mesmos status, mesmo JSON, mesmo banco, frontend intocado. Uma fase por vez, cada módulo termina com `npm test && npm run lint && npm run typecheck` verdes.

### Decisões (tomadas na Etapa 0)

- [x] **Services continuam funções puras** (`tenantId` primeiro, `vi.mock` nos testes). Nest entra em controllers, módulos, guards, filters e pipes. Consequência honesta: DI quase não é usada nesta fase; converter service a service para `@Injectable()` é fase posterior, opcional.
- [x] **Nest 12** (ESM nativo, casa com o projeto `NodeNext`) sobre `@nestjs/platform-express`, que traz o próprio Express 5 aninhado. O `express` 4 direto do projeto só serve ao legado e sai na Etapa 3.
- [x] **Ponte de migração** (`src/bootstrap.ts`): `NestFactory.create(AppModule)` e `app.use(createServer())` ANTES de `init()`. O legado responde o que conhece; o resto cai no Nest. (Não usamos `ExpressAdapter(legacyApp)`: o Nest 12 traz Express 5, e passar um app Express 4 como instância é o caminho frágil.)
- [x] **Sem SWC**: `tsx` e o esbuild do Vitest respeitam `experimentalDecorators` mas não emitem `emitDecoratorMetadata`. Enquanto não houver injeção por tipo no construtor, isso não importa. Ao primeiro provider injetado: `@Inject(Token)` explícito.

### Etapa 0 — Setup (feito)

- [x] Deps: `@nestjs/common @nestjs/core @nestjs/platform-express @nestjs/testing reflect-metadata rxjs`.
- [x] `tsconfig`: `experimentalDecorators`, `emitDecoratorMetadata`; `npm run dev`, `build` e `start` continuam funcionando.
- [x] Boot na mesma ordem de hoje: `assertProductionSecrets` → `runMigrations` → `createApp()` → `listen` (`index.ts` segue como entrada; não virou `main.ts` para não mexer em scripts/Dockerfile).
- [x] `AppModule` vazio + ponte com o Express legado (`bootstrap.test.ts`: rota legada, guard 401, rota Nest, corpo JSON legado → controller Nest, 404, webhook com assinatura sobre bytes crus e com assinatura errada). Suíte inteira verde; subida real contra o Postgres respondeu `/health` 200 e `/api/orders` 401.
- [x] Corrigido `types/express.d.ts`, que apontava para o caminho antigo de `auth.types` (o `skipLibCheck` escondia).

Nota para a Etapa 1: o legado lê o corpo primeiro, então `rawBody` do Nest só existirá quando o `whatsapp` for portado e o `express.json` legado sair.

### Etapa 1 — Transversais (feito)

Tudo em `src/common/` (+ `modules/auth/utils/bearer.ts`, `modules/whatsapp/guards/`).

- [x] `AuthGuard` **global e fechado por padrão** (porta `requireAuth` via `readBearerAuth`, compartilhado com o middleware legado) + `@Public()` para abrir rota + `@Auth()` / `@Tenant()` no lugar de `authOf/tenantOf`. Melhor que o guard-no-mount: esquecer de marcar protege, não expõe.
- [x] `AllExceptionsFilter` (`@Catch()`) sobre `common/http/errorMapping.ts` (`mapError`), o mapa ÚNICO usado também pelo `errorHandler` legado: os 21 testes antigos do `errorHandler` seguem verdes e um teste de paridade compara filter × legado para os 13 tipos de erro. Trata `HttpException` (rota inexistente → 404 `route_not_found`, não 500) e `headersSent` (SSE).
- [x] `RateLimitGuard` + `@RateLimit({ windowMs, max })` sobre `SlidingWindowLimiter` (também usado pelo `createRateLimiter` legado). Um balde por handler, por IP.
- [x] `WebhookSignatureGuard` (`modules/whatsapp/guards/`) lê `req.rawBody`; `rawBody: true` ligado no `create`. **Prova**: teste Nest nativo (sem legado) com payload de espaços duplos/unicode — assinatura sobre os bytes originais passa, sobre `JSON.stringify(JSON.parse(x))` dá 403, sem cabeçalho dá 403.
- [x] Regra `error-handling.md` ganhou a seção NestJS. `asyncHandler` saiu na Etapa 3.
- [x] Mutação verificada: com `rawBody: false` e com o bypass de `@Public()` quebrado, os testes falham.

### Etapa 2 — Portar módulo a módulo (feito)

Ordem seguida: `health` → `auth` → `settings` → `dashboard` → `store` → `menu` → `simulator` → `order` → `menulink` → `whatsapp`. Um commit por módulo.

Por módulo: `<mod>.module.ts` + `controllers/<mod>.controller.ts` (a lógica segue nas funções de `services/`), testes de controller reescritos para HTTP real (`test/nestApp.ts` + supertest, services mockados), `routes/` e o mount em `api/server.ts` apagados. `api/server.test.ts` passou a rodar sobre `createApp()` e foi o contrato durante toda a migração.

Achados que os testes de contrato pegaram / decisões:
- **POST responde 200, não 201**, onde o legado usava `res.json` (`login`, `simulator/messages`, `orders/:id/transition`, `public/cart/:code`, webhook): `@HttpCode(200)` explícito.
- **Upload**: `ProductImageUploadInterceptor` sobre o multer. O `FileInterceptor` do Nest reescreve `LIMIT_FILE_SIZE` em 413; o contrato é 422 `image_too_large`. O guard global roda antes: sem login o corpo nem é lido.
- **SSE** (`order`): `@Res()` manual, mesmo formato de fio; testado com conexão real (headers, isolamento por tenant, ping, cleanup no `close`). Mutação confirmada: sem `unsubscribe()` e com tenant errado os testes falham.
- **`dev-sample`**: 404 em produção decidido na requisição (não ao montar a rota).
- **Webhook**: `@Header("Content-Type", "text/plain")` vazava para o JSON de erro do filter (403 saía como `text/plain`) — pego pelo teste de contrato; o tipo agora é definido só no sucesso.
- Mudanças de comportamento aceitas: rota inexistente e JSON malformado passam a responder JSON do projeto (`route_not_found` 404 / `http_error` 400) em vez de HTML do Express / 500.
- `menulink` público: `@Public()` + `RateLimitGuard`, balde separado para GET (60/min) e POST (20/min), 429 antes de tocar o serviço.

Smoke real contra o Postgres (build compilado): `/health`, login, `me`, `settings`, `dashboard`, `orders`, `menu`, `store`, `simulator/customers` → 200; `/api/orders` sem token → 401; rota desconhecida → 404 JSON; SSE abre com `: connected`.

Sobrou no legado (`api/server.ts`): CORS, `express.json` com `verify`, `express.static('/produtos')` e o `errorHandler`. Tudo vai embora na Etapa 3.

### Etapa 3 — Limpeza (feito)

- [x] `api/` inteiro removido: `server.ts`, `routes`, `middlewares` (`errorHandler`, `rateLimit`, `requireAuth`, `upload`), `utils` (`asyncHandler`, `authContext`), ponte com o legado. `createApp()` agora só monta o Nest.
- [x] Movido para o bootstrap: `rawBody: true`, `enableCors({ origin })` e `useStaticAssets(productImagesDir(), { prefix: "/produtos" })`. O `express.json` manual sumiu (o parser do Nest, com `rawBody`, lê o corpo do webhook).
- [x] Dependências: saíram `express`, `cors`, `@types/cors`; `@types/express` foi para `^5` (o Express real vem do `@nestjs/platform-express`).
- [x] Testes: `errorHandler.test.ts` (18 casos) virou `common/http/errorMapping.test.ts` exercitando o `AllExceptionsFilter` real; `server.test.ts` virou `src/app.test.ts` (matriz de rotas do app completo); `bootstrap.test.ts` cobre static, CORS (preflight), JSON, JSON malformado e 404. Testes de `asyncHandler`/`authContext`/`rateLimit`/`requireAuth` saíram com o código — o comportamento equivalente está em `auth.guard`, `bearer`, `slidingWindow`, `rateLimit.guard` e `common.integration`.
- [x] Docs: `CLAUDE.md` (stack, árvore, tabela de rotas, rate limit, webhook, erros), `error-handling.md` e `testing.md`.
- [x] Regressão minha achada na limpeza: ao mover `imageStorage.ts` para `storage/` na reorganização, `../../../produtos` passou a apontar para `src/produtos`; corrigido para `../../../../produtos` (`<backend>/produtos`) com teste.
- Smoke do build compilado contra o Postgres: `/health` 200, preflight CORS 204 com `Access-Control-Allow-Origin`, `/produtos/x.png` inexistente 404.

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
- [x] `createChatLlm()` passa a escolher o provedor por env (`LLM_PROVIDER=ollama|anthropic|openai`, `LLM_MODEL`, chave correspondente). Ollama continua sendo o default de dev. Tool calling com modelo pequeno local é instável; para o piloto com restaurante real, use um modelo hospedado.
- [x] Toda chamada continua com `fetchWithTimeout` / timeout do SDK. `generateAgentReply` continua nunca lançando.

### Backend
- [x] Tabelas:
  - `customers (id, tenant_id, phone, name, last_address JSONB NULL, created_at, UNIQUE(tenant_id, phone))` — criado/atualizado a cada conversa de WhatsApp.
  - `carts (conversation_id PK REFERENCES conversations ON DELETE CASCADE, tenant_id, items JSONB, fulfillment NULL, address JSONB NULL, zone_id NULL, payment_method NULL, change_for_cents NULL, notes NULL, status, summary_hash NULL, updated_at)`
    - `status`: `open` | `awaiting_confirmation`.
    - Carrinho sem atividade por 3h é descartado (verificado na leitura, sem job).
- [x] Funções puras em `modules/order/`:
  - `pricing.ts` — `priceCart(cart, menu, zone, settings)` → `{ lines, subtotalCents, feeCents, totalCents, problems[] }`. Problemas: item indisponível, opção obrigatória faltando, acima do `max_select`, abaixo do pedido mínimo, bairro não atendido, troco menor que o total.
  - `summary.ts` — `formatOrderSummary(priced, cart)` → texto pt-BR para WhatsApp com itens, adicionais, subtotal, taxa, total, entrega/retirada, endereço, pagamento e troco. Termina com "Posso confirmar?".
  - `cartHash(cart, totalCents)` — hash estável do conteúdo + total (preço que mudou entre o resumo e o "sim" invalida a confirmação).
- [x] Ferramentas do agente (`modules/agent/tools/`), cada uma com schema de entrada validado e saída em JSON curto:
  - `search_menu(query)` → itens que casam (nome, preço/tamanhos, grupos). Para cardápio pequeno (< ~60 itens) o cardápio resumido também vai no system prompt.
  - `add_item(item_id, size_id?, option_ids[], quantity, notes?)` → valida contra o cardápio e devolve o carrinho precificado ou o problema.
  - `remove_item(line_number)` / `update_quantity(line_number, quantity)` (1-based, o número da linha em `view_cart`)
  - `view_cart()`
  - `set_fulfillment(type: delivery|pickup, address?, neighborhood?)` → resolve a zona e a taxa.
  - `set_payment(method, change_for?)`
  - `request_confirmation()` → só funciona com carrinho sem `problems`. O SISTEMA envia `formatOrderSummary` (não o LLM), grava `summary_hash` e muda para `awaiting_confirmation`.
  - `place_order()` → recusa se status ≠ `awaiting_confirmation` ou se `cartHash` mudou desde o resumo. Cria o pedido por `createOrder` (fase 3) e limpa o carrinho. A confirmação ao cliente é texto do SISTEMA, não do modelo.
  - `store_info()` → aberto/fechado, horários (`describeHours`), tempo estimado, pedido mínimo, formas de pagamento.
  - `call_human(reason)` → marca handoff (fase 4; até lá só registra).
- [x] Loop do agente: no máximo 6 iterações de ferramenta por mensagem; estourou → fallback da persona.
- [x] Loja fechada: o agente pode conversar e mostrar o cardápio, mas `request_confirmation` e `place_order` recusam com o próximo horário.
- [x] Cliente recorrente: `customers.last_address` e o último pedido entram no contexto ("quer o mesmo de sábado?", "entrega no mesmo endereço?").
- [x] Prompt (`agent.prompt.ts`): remover a regra "você não tem cardápio"; manter "nunca invente preço, item ou prazo — use as ferramentas"; nunca confirmar pedido sem `place_order` ter retornado sucesso; respostas curtas de WhatsApp.
- [x] Mídia não suportada continua com o aviso fixo. Áudio fica para depois (ver Fora da v1).

### Frontend
- [x] Simulador mostra, em modo dev (toggle), as ferramentas chamadas em cada turno e o carrinho atual ao lado da conversa. É a ferramenta de depuração do agente; o endpoint devolve isso só para o canal `simulator`.
- [x] **Clientes simulados**: o simulador deixa escolher ou criar um cliente de teste (nome + telefone fictício). Cada um é uma conversa própria (`contact = sim-<telefone>`) e um registro em `customers`. É o que permite testar cliente recorrente ("o mesmo de sábado") e, na Fase 3, vários pedidos simultâneos no kanban sem WhatsApp. Backend: `/api/simulator` passa a receber `contactId`.

### Testes obrigatórios
- `pricing`: tamanhos, adicionais somando, meio a meio com `max` e `average`, quantidade, taxa por bairro, mínimo, troco, item esgotado entre a adição e a confirmação.
- `summary`: snapshot de texto (aqui snapshot é aceitável, é o contrato com o cliente).
- `place_order`: recusa sem confirmação; recusa se o carrinho mudou depois do resumo; recusa com loja fechada.
- Agente com LLM mockado: sequência de tool calls simulada ponta a ponta (oi → pizza grande calabresa com borda → entrega no Centro → Pix → resumo → "sim" → pedido criado).

### Pronto quando
> **Estado:** implementado e coberto por testes (incluindo o fluxo ponta a ponta com LLM roteirizado) e verificado contra Postgres real. Ainda falta rodar o fluxo completo com um modelo HOSPEDADO (`LLM_PROVIDER=anthropic|openai`): com `llama3.2` local o laço de ferramentas funciona, mas leva 80–125 s por turno e às vezes escreve um "resumo" no lugar de chamar `request_confirmation` — por isso o piloto usa modelo hospedado.

No simulador, um pedido completo de pizza meio a meio com borda, entrega e troco sai do "oi" até o "pedido confirmado" com o total certo, e mudar o carrinho depois do resumo força um novo resumo.

---

## Fase 2.5 — Cardápio em link (o cliente vê o que escolhe)

Problema: pelo chat o cliente não vê fotos, tamanhos nem adicionais. Catálogo do WhatsApp não serve (item plano: sem tamanhos, grupos de opções nem meio a meio) e listar nomes no texto está descartado. Solução: o atendente manda um link para uma página web mobile com o cardápio real; o cliente monta o carrinho lá e volta ao WhatsApp, onde o pedido continua (entrega, pagamento, resumo, "sim") exatamente como na Fase 2.

Fluxo: `send_menu_link` → link `…/c/<código>` → página (fotos, tamanhos, sabores, adicionais, total ao vivo) → "Confirmar itens" → backend valida com `priceCart` e grava em `carts` → `sendOutbound` manda "Recebi seu carrinho…" na conversa → botão "Voltar ao WhatsApp" (`wa.me`, texto pré-preenchido) → agente segue de onde parou.

### Backend
- [x] Link curto: `/c/<código>` com código aleatório de 12 caracteres (72 bits) apontando para uma linha de `menu_links` (tenant, conversa e validade de 3h ficam no banco, não na URL — link curto e revogável). O link válido da conversa é reaproveitado. Nada de preço vem do navegador.
- [x] `PUBLIC_APP_URL` (base do frontend). Sem ela em produção, `send_menu_link` devolve erro e o agente segue pelo chat.
- [x] Ferramenta `send_menu_link`: o SISTEMA envia o texto com o link e encerra o turno (mesmo padrão do resumo). O prompt manda preferir o link para quem quer pedir e continuar de `view_cart` quando o carrinho já veio do cardápio.
- [x] `GET /api/public/menu/:token` (loja, cardápio público, carrinho atual, `whatsappUrl`) e `POST /api/public/cart/:token` (valida TODAS as linhas com `priceCart`, grava, avisa no chat). Público, autenticado só pelo token, com rate limit em memória por IP. Erros tipados: 401 `invalid_menu_link`/`expired_menu_link`, 422 `cart_empty`/`cart_invalid` (com os problemas por linha), 429 `rate_limited`.
- [x] `store_settings.whatsapp_number` (número do atendimento, só dígitos) para o `wa.me`; sem ele (ou no simulador) a página só pede para voltar à conversa.
- [x] Funil: `menu_link_events` (`sent` → `opened` → `confirmed` → `ordered`), contagem por conversa distinta nos últimos 7 dias em `GET /api/dashboard`.

### Frontend
- [x] Rota pública `/c/:token` (fora do painel, sem login): cabeçalho da loja com aberto/fechado, chips de categoria, cartões com foto, folha do item (tamanho, opções com mín./máx., quantidade, observação, preço ao vivo), barra do carrinho, folha do carrinho (editar/remover), tela final com "Voltar ao WhatsApp". Esqueleto no grid, erro de link inválido/expirado, mobile-first, só tokens de tema, i18n pt-BR + en-US.
- [x] Painel: campo "WhatsApp do atendimento" em Loja › Geral; bloco "Funil do cardápio" na Visão geral.
- [x] Simulador: links viram clicáveis no balão e a conversa recarrega ao voltar para a aba (o pedido feito na página chega como mensagem).

### Testes obrigatórios
- Código: formato, aleatoriedade, lixo recusado sem consultar o banco, desconhecido → `invalid_menu_link`, vencido → `expired_menu_link`, reaproveitamento, colisão, isolamento por tenant.
- Pura: `toPublicMenu` (só ativos, sem campos internos), `parseCartItems`, mensagens (link, carrinho recebido para cada próximo passo), `wa.me`.
- Confirmação: rejeita linha inválida (tamanho/opção/esgotado) sem gravar, aceita carrinho sem entrega/pagamento, grava e avisa o chat, falha do aviso não desfaz o carrinho, isolamento entre tenants.
- Ferramenta: `send_menu_link` com resposta do sistema; sem `PUBLIC_APP_URL` → erro.
- Frontend: cálculo de preço espelha o backend (tabela), folha do item respeita mín./máx., carrinho, envio, estados de erro.

### Pronto quando
> **Estado:** implementado e coberto por testes; o backend foi exercitado ao vivo (servidor real + Postgres: página pública, carrinho inválido recusado, carrinho válido gravado com preço 8250 = 7200 + média dos sabores 250 + borda 800, mensagem "Recebi seu carrinho" gravada na conversa, funil `sent/opened/confirmed`). **Falta** ver a página num navegador/celular de verdade e rodar o fluxo com um modelo hospedado que funcione (a chave do Gemini estava sem créditos).

No simulador o "quero pedir" devolve um link; o link abre o cardápio com fotos; montar meio a meio com borda mostra o total certo; "Confirmar itens" faz a mensagem "Recebi seu carrinho" aparecer na conversa e o agente continua com entrega, pagamento, resumo e "sim" até o pedido cair no kanban. O funil mostra os quatro passos.

---

## Fase 3 — Pedidos em tempo real

A tela que fica aberta no balcão.

### Backend
- [x] Tabelas (+ `order_counters` para o número atômico). **Desvio:** `customers` é da Fase 2, então por enquanto `orders` guarda `customer_name`/`customer_phone` como snapshot; `customer_id` entra na Fase 2 via `ADD COLUMN IF NOT EXISTS`.
  - `orders (id, tenant_id, number, customer_id, conversation_id, status, fulfillment, address JSONB, neighborhood, payment_method, change_for_cents, subtotal_cents, fee_cents, total_cents, notes, reject_reason, created_at, accepted_at, ready_at, completed_at, UNIQUE(tenant_id, number))`
    - `number`: sequencial por tenant (o que o balcão fala: "pedido 42").
  - `order_items (id, tenant_id, order_id, name, size_name, unit_price_cents, quantity, options JSONB, notes)` — snapshot.
- [x] `order.status.ts` puro: máquina de estados.
  - `pending → accepted | rejected`
  - `accepted → out_for_delivery | ready_for_pickup` (conforme fulfillment)
  - `out_for_delivery | ready_for_pickup → completed`
  - `pending | accepted → cancelled`
  - Transição inválida → `InvalidTransitionError` → 409.
- [x] Mensagem automática ao cliente em cada transição (texto fixo por status, com número e tempo estimado; rejeição inclui o motivo). Criar `sendOutbound(tenantId, conversationId, text)` no módulo conversation: grava a mensagem outbound e, só se o canal for `whatsapp`, envia pela Meta. Nas fases 1 a 6 só o simulador existe na prática, e as mensagens aparecem na conversa do cliente simulado.
- [x] Rotas guardadas: `GET /api/orders` (quadro: em andamento + encerrados de hoje no fuso da loja; filtros `?status=&date=` ficam para quando houver histórico), `GET /api/orders/:id`, `POST /api/orders/:id/transition { to, reason? }`.
- [x] Tempo real: `GET /api/orders/stream` (SSE) com EventEmitter em memória por tenant (instância única na v1; documentar que multi-instância exige Redis/pubsub). Autenticação via header no fetch streaming (não usar EventSource com token na URL).
- [ ] Alerta de pedido parado: pedido `pending` há mais de 5 min → mensagem ao cliente ("o restaurante já vai confirmar") via `sendOutbound` e evento `order_stale` no stream (o painel destaca). O aviso no WhatsApp pessoal do dono fica para a Fase 7. Varredura com `setInterval` iniciada só no `index.ts` (nunca no import, para não travar o vitest).

### Frontend
- [x] `/admin/orders` vira a tela inicial do painel. Kanban: Novos · Em preparo · Saiu / Pronto · Concluídos hoje. Cartão com número, cliente, total, tempo desde a criação (fica vermelho após 5 min em Novos).
- [x] Som e título da aba piscando a cada pedido novo. Navegador bloqueia áudio sem interação: botão "Ativar som" visível até o primeiro clique.
- [x] Aceitar / recusar (motivo obrigatório: esgotado, fora da área, fechando, outro).
- [x] Drawer de detalhe com itens, adicionais, observações, pagamento, troco, endereço, link para a conversa.
- [ ] Imprimir comanda: CSS de impressão para 80mm, número grande, itens em destaque, sem cores.
- [x] Reconexão automática do stream e indicador "ao vivo / reconectando".
- [x] Até a Fase 2 existir: pedidos de exemplo no seed e botão "Pedido de teste" (só em dev, `POST /api/orders/dev-sample`), montado do cardápio real e ligado à conversa do simulador de quem clicou. A Fase 2 chama o mesmo `createOrder`.

### Testes obrigatórios
- Máquina de estados: todas as transições válidas e inválidas.
- Criação do pedido a partir do carrinho: snapshot correto, `number` sequencial por tenant, isolamento entre tenants.
- Mensagem ao cliente disparada em cada transição (canal mockado).
- Frontend: novo pedido chegando pelo stream aparece em Novos; recusa sem motivo não envia.

### Pronto quando
Pedido feito no simulador aparece no kanban na hora com som, e aceitar/avançar/concluir manda as mensagens certas de volta na conversa do cliente simulado. Três clientes simulados com pedidos ao mesmo tempo aparecem corretamente.

---

## Fase 4 — Conversas e atendimento humano

### Backend
- [ ] `conversations` ganha `bot_paused BOOL DEFAULT false`, `handoff_requested_at NULL`, `handoff_reason NULL`.
- [ ] `handleInboundMessage`: com `bot_paused`, grava a mensagem e não responde (o humano está atendendo).
- [ ] Fallback da persona e a ferramenta `call_human` marcam `handoff_requested_at` e emitem evento `handoff` no stream (o painel mostra contador e som). Aviso no WhatsApp do dono fica para a Fase 7.
- [ ] Rotas: `GET /api/conversations?filter=handoff|all`, `GET /api/conversations/:id/messages`, `POST /api/conversations/:id/messages` (humano envia via `sendOutbound`), `POST /api/conversations/:id/pause`, `POST /api/conversations/:id/resume`.
- [ ] Mensagens novas entram no mesmo stream SSE (evento `message`).

### Frontend
- [ ] `/admin/conversations`: mostra conversas de todos os canais (hoje, só as do simulador), com o canal indicado. Lista à esquerda (pedindo humano no topo, destacadas), conversa à direita, carrinho/último pedido do cliente no painel lateral, botões "Assumir" e "Devolver ao bot", composer para responder como a loja.

### Pronto quando
Uma conversa em que o bot não soube ajudar aparece destacada, o dono assume, responde pelo painel e devolve ao bot.

---

## Fase 5 — Onboarding e importação de cardápio

Decide se um restaurante novo entra em 10 minutos ou desiste.

### Backend
- [ ] `POST /api/menu/import` recebe foto(s) ou PDF do cardápio, usa um modelo com visão para extrair `{ categorias, itens, preços, tamanhos, adicionais }` em JSON validado por schema, e devolve uma PRÉVIA (nada é gravado).
- [ ] `POST /api/menu/import/confirm` grava a prévia revisada em lote, numa transação.
- [ ] Preços extraídos que não parecem preço, itens duplicados e categorias vazias voltam marcados na prévia para revisão.

### Frontend
- [ ] `/admin/onboarding`, aberto automaticamente enquanto a loja estiver incompleta: 1) dados da loja, 2) importar cardápio (upload → prévia editável → confirmar), 3) horários, entrega e pagamento, 4) testar no simulador. O passo de conexão do WhatsApp entra na Fase 7.
- [ ] Checklist de "loja pronta" visível no topo do painel até tudo estar completo.

### Pronto quando
Com a foto de um cardápio real de lanchonete, o dono chega a um cardápio revisado e cadastrado sem digitar item por item.

---

## Fase 6 — Resumo e conta

- [x] Resumo (adiantado, virou a primeira aba `/admin/dashboard` "Visão geral"): pedidos e faturamento de hoje e dos últimos 7 dias, ticket médio, itens mais vendidos, entrega × retirada, formas de pagamento, status da loja. Contando pedidos por `status`, não mensagens.
- [ ] Resumo: % de pedidos fechados pelo bot sem humano (depende do handoff da Fase 4).
- [ ] Conta: usuários da loja (convidar por e-mail, papel único `admin` na v1), status da assinatura (cobrança por Pix manual na v1, campo `subscription_status` no tenant controlado por você).
- [ ] LGPD mínima: aviso de privacidade no primeiro contato de cada cliente (texto fixo, uma vez) e rota para apagar os dados de um cliente.

---

## Fase 7 — WhatsApp (última)

O webhook, a assinatura, a deduplicação e o envio já existem desde a base (`modules/whatsapp/`, testados). Esta fase liga o que foi construído no simulador ao canal real.

### Backend
- [ ] Revisar que tudo das fases 1 a 6 passa por `handleInboundMessage` / `sendOutbound` — nenhum caminho exclusivo do simulador (exceto o modo dev de depuração do agente).
- [ ] `customers` a partir do `wa_id` e do nome de perfil do webhook (mesmo fluxo dos clientes simulados).
- [ ] Avisos ao dono no `owner_whatsapp`: pedido parado (Fase 3) e pedido de humano (Fase 4). Fora da janela de 24h a Meta exige template aprovado; na v1, aceitar que o aviso só chega se o dono tiver mandado mensagem ao número nas últimas 24h, ou cadastrar um template utilitário.
- [ ] Rota interna protegida para preencher `tenants.whatsapp_phone_number_id` (conexão manual, feita por você).
- [ ] Mensagens de status do pedido: confirmar que cabem na janela de 24h (o cliente acabou de escrever) e tratar o erro da Meta quando não couber (log + evento no painel, nunca derrubar a transição do pedido).
- [ ] Mídia: o aviso fixo de "só texto" já existe; conferir com áudio, imagem e localização reais.

### Frontend
- [ ] Passo "Conectar WhatsApp" no onboarding e status da conexão em `/admin/store`.
- [ ] Conversas mostram o canal e o nome de perfil do WhatsApp.

### Teste manual (número de teste da Meta, ver README)
- [ ] Pedido completo pelo celular, do "oi" à confirmação, aparecendo no kanban.
- [ ] Reenvio do mesmo webhook não duplica resposta nem pedido.
- [ ] Mudança de status no painel chega no celular.
- [ ] Handoff: assumir pelo painel, responder, devolver ao bot.

### Pronto quando
Um pedido feito do celular pelo WhatsApp percorre exatamente o mesmo caminho que já funcionava no simulador.

---

## Fase N — Migração do backend para NestJS

Branch `refactor/migrar-backend-nest` (parte do commit `9f75ab9`). **Sem mudança de contrato**: mesmas rotas, mesmos status, mesmo JSON, mesmo banco, frontend intocado. Uma fase por vez, cada módulo termina com `npm test && npm run lint && npm run typecheck` verdes.

### Decisões (tomadas na Etapa 0)

- [x] **Services continuam funções puras** (`tenantId` primeiro, `vi.mock` nos testes). Nest entra em controllers, módulos, guards, filters e pipes. Consequência honesta: DI quase não é usada nesta fase; converter service a service para `@Injectable()` é fase posterior, opcional.
- [x] **Nest 12** (ESM nativo, casa com o projeto `NodeNext`) sobre `@nestjs/platform-express`, que traz o próprio Express 5 aninhado. O `express` 4 direto do projeto só serve ao legado e sai na Etapa 3.
- [x] **Ponte de migração** (`src/bootstrap.ts`): `NestFactory.create(AppModule)` e `app.use(createServer())` ANTES de `init()`. O legado responde o que conhece; o resto cai no Nest. (Não usamos `ExpressAdapter(legacyApp)`: o Nest 12 traz Express 5, e passar um app Express 4 como instância é o caminho frágil.)
- [x] **Sem SWC**: `tsx` e o esbuild do Vitest respeitam `experimentalDecorators` mas não emitem `emitDecoratorMetadata`. Enquanto não houver injeção por tipo no construtor, isso não importa. Ao primeiro provider injetado: `@Inject(Token)` explícito.

### Etapa 0 — Setup (feito)

- [x] Deps: `@nestjs/common @nestjs/core @nestjs/platform-express @nestjs/testing reflect-metadata rxjs`.
- [x] `tsconfig`: `experimentalDecorators`, `emitDecoratorMetadata`; `npm run dev`, `build` e `start` continuam funcionando.
- [x] Boot na mesma ordem de hoje: `assertProductionSecrets` → `runMigrations` → `createApp()` → `listen` (`index.ts` segue como entrada; não virou `main.ts` para não mexer em scripts/Dockerfile).
- [x] `AppModule` vazio + ponte com o Express legado (`bootstrap.test.ts`: rota legada, guard 401, rota Nest, corpo JSON legado → controller Nest, 404, webhook com assinatura sobre bytes crus e com assinatura errada). Suíte inteira verde; subida real contra o Postgres respondeu `/health` 200 e `/api/orders` 401.
- [x] Corrigido `types/express.d.ts`, que apontava para o caminho antigo de `auth.types` (o `skipLibCheck` escondia).

Nota para a Etapa 1: o legado lê o corpo primeiro, então `rawBody` do Nest só existirá quando o `whatsapp` for portado e o `express.json` legado sair.

### Etapa 1 — Transversais (feito)

Tudo em `src/common/` (+ `modules/auth/utils/bearer.ts`, `modules/whatsapp/guards/`).

- [x] `AuthGuard` **global e fechado por padrão** (porta `requireAuth` via `readBearerAuth`, compartilhado com o middleware legado) + `@Public()` para abrir rota + `@Auth()` / `@Tenant()` no lugar de `authOf/tenantOf`. Melhor que o guard-no-mount: esquecer de marcar protege, não expõe.
- [x] `AllExceptionsFilter` (`@Catch()`) sobre `common/http/errorMapping.ts` (`mapError`), o mapa ÚNICO usado também pelo `errorHandler` legado: os 21 testes antigos do `errorHandler` seguem verdes e um teste de paridade compara filter × legado para os 13 tipos de erro. Trata `HttpException` (rota inexistente → 404 `route_not_found`, não 500) e `headersSent` (SSE).
- [x] `RateLimitGuard` + `@RateLimit({ windowMs, max })` sobre `SlidingWindowLimiter` (também usado pelo `createRateLimiter` legado). Um balde por handler, por IP.
- [x] `WebhookSignatureGuard` (`modules/whatsapp/guards/`) lê `req.rawBody`; `rawBody: true` ligado no `create`. **Prova**: teste Nest nativo (sem legado) com payload de espaços duplos/unicode — assinatura sobre os bytes originais passa, sobre `JSON.stringify(JSON.parse(x))` dá 403, sem cabeçalho dá 403.
- [x] Regra `error-handling.md` ganhou a seção NestJS. `asyncHandler` saiu na Etapa 3.
- [x] Mutação verificada: com `rawBody: false` e com o bypass de `@Public()` quebrado, os testes falham.

### Etapa 2 — Portar módulo a módulo (feito)

Ordem seguida: `health` → `auth` → `settings` → `dashboard` → `store` → `menu` → `simulator` → `order` → `menulink` → `whatsapp`. Um commit por módulo.

Por módulo: `<mod>.module.ts` + `controllers/<mod>.controller.ts` (a lógica segue nas funções de `services/`), testes de controller reescritos para HTTP real (`test/nestApp.ts` + supertest, services mockados), `routes/` e o mount em `api/server.ts` apagados. `api/server.test.ts` passou a rodar sobre `createApp()` e foi o contrato durante toda a migração.

Achados que os testes de contrato pegaram / decisões:
- **POST responde 200, não 201**, onde o legado usava `res.json` (`login`, `simulator/messages`, `orders/:id/transition`, `public/cart/:code`, webhook): `@HttpCode(200)` explícito.
- **Upload**: `ProductImageUploadInterceptor` sobre o multer. O `FileInterceptor` do Nest reescreve `LIMIT_FILE_SIZE` em 413; o contrato é 422 `image_too_large`. O guard global roda antes: sem login o corpo nem é lido.
- **SSE** (`order`): `@Res()` manual, mesmo formato de fio; testado com conexão real (headers, isolamento por tenant, ping, cleanup no `close`). Mutação confirmada: sem `unsubscribe()` e com tenant errado os testes falham.
- **`dev-sample`**: 404 em produção decidido na requisição (não ao montar a rota).
- **Webhook**: `@Header("Content-Type", "text/plain")` vazava para o JSON de erro do filter (403 saía como `text/plain`) — pego pelo teste de contrato; o tipo agora é definido só no sucesso.
- Mudanças de comportamento aceitas: rota inexistente e JSON malformado passam a responder JSON do projeto (`route_not_found` 404 / `http_error` 400) em vez de HTML do Express / 500.
- `menulink` público: `@Public()` + `RateLimitGuard`, balde separado para GET (60/min) e POST (20/min), 429 antes de tocar o serviço.

Smoke real contra o Postgres (build compilado): `/health`, login, `me`, `settings`, `dashboard`, `orders`, `menu`, `store`, `simulator/customers` → 200; `/api/orders` sem token → 401; rota desconhecida → 404 JSON; SSE abre com `: connected`.

Sobrou no legado (`api/server.ts`): CORS, `express.json` com `verify`, `express.static('/produtos')` e o `errorHandler`. Tudo vai embora na Etapa 3.

### Etapa 3 — Limpeza

- [ ] Remover `api/server.ts`, `api/routes`, `api/middlewares`, `api/utils` (`asyncHandler`, `authContext`), ponte legado, `express.json` manual.
- [ ] `createServer()` dos testes → helper `createTestApp()` sobre `Test.createTestingModule`.
- [ ] `Dockerfile`/`build`/`start` (`dist/main.js`), `seed`, `README`.
- [ ] Atualizar `CLAUDE.md` (stack, arquitetura, rotas, rules) e `.claude/rules/testing.md` (controller test = Nest testing module).

### Testes obrigatórios

- Contrato HTTP idêntico por rota (status + JSON + headers relevantes) antes/depois.
- Filter: um caso por classe de erro + 500 sem vazar `error.message`.
- Guard: sem token, token inválido, expirado, algoritmo fora do allowlist.
- Webhook: assinatura válida, inválida, ausente, sem secret (fail closed), retry duplicado.
- SSE: heartbeat, evento por tenant (não vaza entre tenants), desconexão limpa o listener.
- Boot: falha de `assertProductionSecrets`/migration → `exit(1)`.

### Pronto quando

`npm test`, `lint`, `typecheck` verdes; nenhum arquivo em `api/` além do que o Nest exigir; fluxo completo no simulador (mensagem → agente → pedido → quadro em tempo real) e webhook com assinatura real funcionam idênticos ao commit `9f75ab9`.

### Fora do escopo

Converter services/repositories em classes, trocar Express por Fastify, mexer no frontend, mudar rotas ou schema.

## Fase N2 — Injeção de dependência completa (padrão NestJS)

Continuação da Fase N. Hoje o Nest só cuida de controllers/guards/filters; services, repositories e clients são funções com estado em módulo. Objetivo: **todo colaborador com dependência ou I/O vira `@Injectable()` injetado por construtor, cada contexto tem seu `*.module.ts` com `imports`/`providers`/`exports` explícitos**, sem mudar contrato HTTP nem banco.

### Decisões

- [x] **Injeção por TIPO no construtor** (padrão Nest), não `@Inject(Token)` em todo parâmetro. Exige metadata de decorator: Vitest ganha o plugin SWC (`unplugin-swc`); `dev`/`seed` rodam com `node --import @swc-node/register/esm-register` (esbuild/`tsx` não emitem `design:paramtypes`); `tsc` (build/prod) já emite. Spike validado: teste com DI por tipo passa e `src/index.ts` sobe contra o Postgres.
- [x] **Fica função (sem classe)**: código puro sem dependência — `pricing`, `order.status`, `order.time`, `store.hours`, `neighborhood`, `owner`, `cart.hash`, `summary`, `order.messages`, `order.sample`, `dashboard.stats`, `menuLink.pure/code`, `whatsapp.payload/signature`, `google.parse`, `osm.parse`, `agent.prompt`, `agent/tools/{args,definitions,views}`, `guardrails`, `jwt`, `password`, `lib/*`. Classe aqui só adiciona invólucro.
- [x] **Vira classe injetável**: todo `*.service`, `*.repository`, `*.client`, `order.events`, `imageStorage`, o executor de ferramentas do agente e `store.location`. Cache que hoje é variável de módulo (settings, tenant, cardápio publicado, geo) passa a ser **campo da instância**, o que também elimina `vi.resetModules` nos testes.
- [x] **Banco**: `DatabaseModule` global com `Database` (pool, `query`, `connect`, `onModuleDestroy` fecha o pool) e `TenantDb`. **O backstop de tenant é mantido**: `TenantDb.query(tenantId, sql, params)` e `TenantTx.query(...)` (dentro de transação) continuam lançando antes de rodar se o SQL não citar `tenant_id` ou se o 1º parâmetro não for o `tenantId`. Repositories de tenant injetam `TenantDb`; os que não têm tenant (login, resolver tenant, link por código, health) injetam `Database`. Migrações rodam em `onModuleInit` (antes do `listen`); falha derruba o boot como hoje.
- [x] **Ciclo `Order → Conversation → Agent → Order` desfeito**: `sendOutbound` sai de `conversation.service` e vira `OutboundMessenger` (módulo `ConversationModule`: repository + outbound + client do WhatsApp). O tratador de mensagem de entrada (`handleInboundMessage`) fica em `InboundModule`. Sem `forwardRef`.
- [x] **Fora do escopo (decisão consciente)**: `env` continua importado (config estática, sem `@nestjs/config`: tests mutam `env` hoje e nada precisa de valor por instância); validação continua nos parsers puros (`parseSettings`, `parseCartItems`…) — trocar por `class-validator`/DTOs mudaria os códigos de erro que o frontend traduz. Ambos podem ser fases futuras.
- [x] **Logging**: `console.*` → `Logger` do Nest por classe, no fim.

### Grafo de módulos (sem ciclos)

```
DatabaseModule (global)
TenantsModule        AuthModule → Tenants          HealthModule        SettingsModule       CustomerModule
MenuModule (+ storage de imagem)                   GeoModule (OSM/Google clients + service)
StoreModule → Geo (StoreService, StoreLocationService)
ConversationModule (repository, OutboundMessenger, WhatsAppClient) → WhatsAppClientModule
OrderModule → Conversation, Menu, Store            MenuLinkModule → Conversation, Menu, Order, Store, Tenants
AgentModule (LlmClientFactory, context, service, tool executor) → Menu, MenuLink, Order, Store, Customer, Conversation
InboundModule (ConversationService) → Agent, Conversation, Customer, Settings, Store, Tenants
SimulatorModule → Inbound, Conversation, Customer, Menu, Order, Store
DashboardModule → MenuLink, Store              WhatsAppModule (controller + service) → Inbound, Tenants
AppModule imports todos
```

### Etapas

- [ ] **A — Infra (verde, um commit):** SWC no Vitest e nos scripts `dev`/`seed`; `Database`/`TenantDb`/`TenantTx` + `DatabaseModule` convivendo com o `config/db.ts` atual (mesmo pool).
- [ ] **B — Varredura (um commit):** converter tudo na ordem folha → topo, testando cada arquivo isolado enquanto o `tsc` global fica vermelho até fechar — não dá para ter commit verde no meio porque quem chama uma função vira classe junto: `tenants, auth, health, settings, customer → menu → geo → store → conversation/outbound + client → order → menulink → agent → inbound → simulator, dashboard, whatsapp`. Junto: controllers injetam services; um `*.module.ts` por contexto; `AppModule` importa todos; `createApp` recebe `configureApp` compartilhado com o teste de app inteiro; `seed.ts` usa `NestFactory.createApplicationContext`; erros que moram em `*.service.ts` (`InvalidSettingsError`, `TenantNotFoundError`) vão para `errors/`; `config/db.ts`, `tenantQuery.ts`, `transaction.ts` viram `common/database/`.
- [ ] **C — Logger e limpeza:** `console.*` → `Logger`; `enableShutdownHooks`; sobras de exports de função.
- [ ] **D — Docs:** `CLAUDE.md`, `testing.md` (unit test de service = `new Service(mockDeps)`, sem `vi.mock` de caminho; controller test = `createTestApp({ controllers, providers })` com `useValue`), `error-handling.md`.

### Como os testes mudam

- Unit de service/repository: `new XService(mockRepo, …)` — sem `vi.mock` de módulo e sem `vi.resetModules` para cache.
- Controller: `createTestApp({ controllers: [X], providers: [{ provide: XService, useValue: mock }] })`.
- App inteiro (`app.test.ts`): `Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Database)` (nada de `vi.mock("db.js")`).
- Contagem de testes não pode cair: cada arquivo de teste antigo tem equivalente. Backstop de tenant segue com teste próprio (`TenantDb`, `TenantTx`) cobrindo as duas formas de bug (SQL sem `tenant_id`, 1º parâmetro trocado) e o teste de isolamento por módulo.

### Pronto quando

`npm test`, `lint`, `typecheck` verdes; nenhum `import { funcaoDeService }` entre módulos (só classes injetadas ou funções puras); `grep -rn "vi.mock(.*services/\|vi.mock(.*repositories/"` vazio; boot real + smoke (login, `orders`, SSE, upload, webhook assinado, simulador ponta a ponta) idênticos ao commit `57a65e8`.

## Fora da v1

- Pix com confirmação automática de pagamento (link / cobrança dinâmica).
- Transcrição de áudio (provável primeira prioridade da v2 no Brasil).
- Integração com iFood ou outros marketplaces.
- Múltiplas unidades por conta.
- Fidelidade, cupons e campanhas (exigem templates pagos da Meta).
- Embedded Signup da Meta (autoatendimento da conexão do WhatsApp) e modo coexistência com o app WhatsApp Business.
- App mobile do dono (o painel precisa ser responsivo, e basta).
- Idiomas além de pt-BR no atendente.
