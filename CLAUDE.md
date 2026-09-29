# CLAUDE.md

Guidance for Claude Code in this repository.

## What this is

**Attendant** — an AI attendant that takes orders over WhatsApp for independent restaurants. Testing starts in Brazil (pt-BR); Europe comes later. The restaurant owner uses the web panel; the end customer only ever talks through WhatsApp.

This repo was bootstrapped from `faq-chatbot-analytics`. What came over: the multi-tenant + auth + error-handling + i18n + design-system foundation, the persona (`bot_settings`), the message gate (`guardrails.ts`) and the chat UI primitives. What did NOT come over: FAQ retrieval, pgvector, curation, the dashboard and the public web chat.

## Project rules

Rules in `.claude/rules/` MUST be followed for any change in their scope:

- [`error-handling.md`](.claude/rules/error-handling.md) — every async Express handler wrapped in `asyncHandler`; typed error classes mapped to HTTP status in `errorHandler`; frontend renders per-code UX, never raw messages.
- [`testing.md`](.claude/rules/testing.md) — every change ships with tests in BOTH `backend/` and `frontend/` (Vitest). No "tests later".
- [`ui-design-system.md`](.claude/rules/ui-design-system.md) — UI consumes tokens from `frontend/src/styles/theme.css`; no hardcoded colors.
- [`ui-i18n.md`](.claude/rules/ui-i18n.md) — every user-facing string goes through `frontend/src/i18n/`; every locale in `availableLocales` gets the key.
- [`ui-loading-skeleton.md`](.claude/rules/ui-loading-skeleton.md) — skeletons render on the loading element, never on the wrapper.

## Stack & commands

- Node **>= 22**, TypeScript ESM in both packages. Backend: Express 4 + `pg` + LangChain (Ollama | Anthropic | OpenAI | Gemini, chosen by `LLM_PROVIDER`), runs with `tsx`, builds with `tsc`. Frontend: Vite 5 + React 18 + Tailwind v4 + react-router v7.
- Postgres 16 and Ollama run in Docker; API and Vite run on the host in dev.

```bash
docker compose up -d postgres ollama
docker exec -it attendant_ollama ollama pull llama3.2

cd backend && cp .env.example .env && npm install
npm run seed        # tenant "pizzaria-demo", admin danilo@admin.com / 123456, bot Nina
npm run dev         # :3000
npm test && npm run lint && npm run typecheck

cd frontend && npm install && npm run dev   # :5173 → /admin/dashboard
npm test && npm run lint && npm run typecheck
```

Do NOT ship without `npm run lint` and `npm test` in every package you touched.

## TypeScript conventions

- Backend: `module/moduleResolution: NodeNext` — **relative imports end in `.js`**. `strict` + `noUncheckedIndexedAccess`.
- Frontend: `moduleResolution: bundler` + `allowImportingTsExtensions` — local imports use `.ts`/`.tsx`. `strict` + `noUnusedLocals/Parameters`.
- `backend/src/index.ts` imports `dotenv/config` first; `.env` is loaded automatically.

## Backend architecture

```
src/
├── index.ts                 # boot: assertProductionSecrets → migrations → listen
├── config/                  # env.ts (+ assertProductionSecrets), db.ts (query helper), migrate.ts, tenantQuery.ts, transaction.ts (withTransaction + clientTenantQuery)
├── lib/fetchWithTimeout.ts  # EVERY outbound HTTP on a reply path uses this
├── types/express.d.ts       # req.auth (optional), req.rawBody (webhooks only)
├── scripts/seed.ts
├── api/
│   ├── server.ts            # mounts + guards (guard lives on the MOUNT)
│   ├── utils/               # asyncHandler, authContext (tenantOf/authOf — the only req.auth readers)
│   └── middlewares/         # errorHandler (single Error→HTTP mapper), auth/requireAuth, rateLimit, upload
└── modules/                 # each module owns its role folders (below)
    ├── tenants/             # TenantId brand, resolve by WhatsApp phone_number_id (cached, positive-only)
    ├── auth/                # jwt (HS256 allowlist), bcrypt, no user enumeration
    ├── settings/            # persona per tenant → deterministic texts (greeting/identity/fallback/junk)
    ├── menu/                # categories/items/sizes/option groups CRUD + getPublishedMenu (cached, agent-facing)
    ├── store/                # store settings, delivery zones, store.hours.ts (pure) + neighborhood.ts (pure)
    ├── geo/                 # city + neighborhood outlines from OpenStreetMap (Nominatim/Overpass; address geocoding is Google), cached in store_geo
    ├── ai/                  # guardrails.ts (message gate), llm-client.ts (createChatLlm: ollama|anthropic|openai|gemini by LLM_PROVIDER)
    ├── conversation/        # handleInboundMessage — THE single entry point for every channel; sendOutbound (proactive, channel-agnostic)
    ├── dashboard/           # read-only business summary (today, last 7 days, top items, breakdowns, store open/closed)
    ├── order/               # orders board: status machine (pure), createOrder, transitions + customer messages, SSE event bus; cart (cart.types/repository/service), pricing.ts, summary.ts, cart.hash.ts (all pure except repo/service)
    ├── agent/               # generateAgentReply (LLM tool loop), agent.prompt.ts (pure), agent.context.ts, tools/ (definitions, args, views = pure; executor = I/O)
    ├── menulink/            # cardápio em link (Fase 2.5): code (menuLink.code, menu_links table), pure (toPublicMenu, parseCartItems, textos, wa.me), service (createMenuLink/getPublicMenuView/confirmPublicCart), funil (repository)
    ├── customer/            # customers (one per tenant+phone): upsert on each agent turn, last_address
    ├── simulator/           # panel test customers (sim-<phone> conversations) + priced cart view for the dev panel
    ├── whatsapp/            # webhook signature, payload parsing, Graph API client, processWebhook
    ├── health/
    └── errors/              # InvalidInputError → 422, InvalidMenuError → 422 (menu + store); order errors live in order/order.errors.ts
```

**Module layout** — every module groups files by role, tests colocated next to the file they test:
`controllers/` (req/res only) · `routes/` (Router only) · `services/` · `repositories/` (SQL, `tenantId` first) · `types/` · `errors/` · `clients/` (outbound HTTP/SDK) · `utils/` (pure helpers) · `events/` · `storage/`. Only folders a module needs exist. `agent/tools/` and `modules/errors/` (shared typed errors) stay as they are. Never mix a service and a repository in the same folder; cross-module imports go by explicit file path (`../../order/services/order.service.js`), no barrels. Paths named elsewhere in this file (e.g. `order.service.ts`) live in these subfolders.

Routes:

```ts
app.use("/health", healthRoutes);                          // public (compose healthcheck)
app.use("/api/auth", authRoutes);                          // POST /login open; GET /me guarded
app.use("/webhooks/whatsapp", whatsappRoutes);             // public, authenticated by HMAC signature
app.use("/api/public", createPublicRoutes());              // cardápio em link: GET /menu/:code, POST /cart/:code — public, authenticated by the short URL code, per-IP rate limit
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/simulator", requireAuth, simulatorRoutes);   // GET/DELETE /conversation, POST /messages (+ debug), GET /cart, GET/POST /customers; all take ?contactId= / body contactId (phone of a test customer; absent = the admin's own)
app.use("/api/menu", requireAuth, menuRoutes);             // categories, items (+ sizes/option groups nested), reorder, availability
app.use("/api/store", requireAuth, storeRoutes);           // settings + /zones CRUD + /geo (city/outlines) + /geo/cities?q= + /geo/geocode?q=
app.use("/api/orders", requireAuth, createOrderRoutes());  // GET / (board), GET /stream (SSE), GET /:id, POST /:id/transition, POST /dev-sample (non-production only)
app.use("/api/dashboard", requireAuth, dashboardRoutes);   // GET / → { dashboard }
```

### Multi-tenancy — `tenantId` is ALWAYS the first repository argument

- Every repository function and tenant-scoped service takes `tenantId: TenantId` first. Deliberate exceptions carry a comment: `findUserByEmail` (login precedes the tenant), `findUserById` (global PK, discovers the tenant), `findTenantById` (querying the `tenants` row by its own PK — no `tenant_id` column to check), and `findTenantByWhatsAppPhoneNumberId` (it is what discovers the tenant).
- `TenantId` is a **branded** number, minted only via `asTenantId()` at trust boundaries (JWT verification, WhatsApp phone_number_id resolution, seed). Argument transposition becomes a compile error.
- Tables with `tenant_id`: `tenants`, `users`, `bot_settings`, `conversations`, `messages`, `menu_categories`, `menu_items`, `item_sizes`, `option_groups`, `options`, `store_settings`, `delivery_zones`, `store_geo`, `orders`, `order_items`, `order_counters`, `customers`, `carts`, `menu_link_events`. Every FK to `tenants` is `ON DELETE CASCADE` (`orders.conversation_id` is `ON DELETE SET NULL`: resetting the simulator never deletes an order).
- `insertMessage` guards `conversationId` with `EXISTS (... AND tenant_id = $1)` so a foreign id is a no-op.
- **`config/tenantQuery.ts` is the runtime backstop, not just a convention.** Every tenant-scoped repository call goes through `tenantQuery(tenantId, sql, params)` (outside a transaction) or `assertTenantScoped(tenantId, sql, params)` right before `client.query(...)` (inside `withTransaction` via `clientTenantQuery`, both in `config/transaction.ts`). Both throw before the query runs if the SQL text doesn't mention `tenant_id`, or if the first bound parameter isn't that exact `tenantId` — the two shapes a copy-paste bug takes. It does NOT verify the filter is semantically correct (right column, right place in the WHERE) — that is still the job of the isolation tests below.
- Unit tests mock `query`; they prove the filter was typed, not that it isolates. Verify isolation end to end.

### Conversation flow (`modules/conversation/conversation.service.ts`)

WhatsApp webhook and the panel simulator call the SAME `handleInboundMessage(tenantId, input)`. Never add a second path — the simulator must show exactly what the customer gets.

1. Validate text (`text_required`, `text_too_long` → `InvalidInputError`).
2. `upsertConversation` returns `previousMessageAt` (read in a CTE before the upsert).
3. `insertMessage(inbound, externalId)` **before** deciding. `false` = duplicate (Meta retries webhooks) → return `{ duplicate: true, replies: [] }`, answer nothing. This is also what puts the current message into the agent's history.
4. Decide:
   - unsupported media (audio, image…) → fixed notice, no agent;
   - `classifyMessage` = identity → `persona.identity` (always; the LLM would invent a name);
   - **conversation start only** (no message in `CONVERSATION_IDLE_MS`, 2h): greeting → `persona.greeting`, junk → `persona.junk`;
   - everything else → `resolveCustomer` (upsert by phone; failure → `null`, never blocks) then `generateAgentReply`; `null` → `persona.fallback`.
   Mid-conversation, "ok", "blz", "obrigado" are answers to the bot and MUST reach the agent. Do not apply the greeting/junk shortcut there — it was the inherited gate's biggest trap.
5. Record outbound replies. A failure here is logged and swallowed: the reply is already decided.

Reply `provider` is `persona` (fixed text) or `agent` (LLM); the simulator shows it. `ConversationReply.trace` carries the agent's tool calls for the turn; only `simulatorController` exposes it (`debug: { toolCalls, cart }`), the WhatsApp path ignores it.

`sendOutbound(tenantId, conversationId, text)` is the proactive counterpart (order status updates): it always records the outbound message (the simulator shows it) and only calls the Meta client when the conversation's channel is `whatsapp`. No module outside `whatsapp/` and this function decides by channel.

### Orders (`modules/order/`)

- `orders` + `order_items` (snapshot: name/size/unit price/options JSON at order time — editing the menu never changes an old order; `unit_price_cents` already includes chosen options). `customer_name`/`customer_phone` stay a snapshot; `customer_id` (nullable FK, `ON DELETE SET NULL`, validated against the tenant in the INSERT) links to `customers`. `findLastOrderForCustomer` (ignores rejected/cancelled) feeds "quer o mesmo de sábado?".
- `number` comes from `order_counters` (atomic upsert `last_number + 1` inside the order's transaction), never `MAX()+1`.
- `order.status.ts` (pure) is the state machine: `pending → accepted|rejected|cancelled`, `accepted → out_for_delivery` (delivery) `| ready_for_pickup` (pickup) `| cancelled`, `out_for_delivery|ready_for_pickup → completed`. `updateOrderStatus` has `WHERE status = <from>`: two tabs clicking at once → second gets 0 rows → `InvalidTransitionError` (409).
- `transitionOrder` writes, publishes `order_updated`, THEN sends `customerMessageFor` (pure, pt-BR bot text) via `sendOutbound`; a send failure is logged and swallowed — the status already changed.
- `createOrder` is the single creation path (publishes `order_created`). Fed by the agent's `place_order`, the seed and `POST /api/orders/dev-sample` (`order.sample.ts`, pure: only items without required option groups, attaches the clicking admin's simulator conversation).
- **Cart/pricing (Fase 2)**: `carts` = one row per conversation (`items` JSONB holds ONLY ids: item, size, option ids, quantity, notes; price is recomputed from the published menu on every read, so an item that sells out between add and confirm is caught). Idle > 3h (`CART_TTL_MS`) → discarded on read, no job. `priceCart(cart, menu, zone, settings)` (pure) → `{ lines, subtotalCents, feeCents, totalCents, problems[] }`; option-group extra = `sum|max|average` (integer cents, `Math.round`) added to the size/base price — option prices are SURCHARGES (half-and-half: average of the two flavors' surcharges). `formatOrderSummary` / `formatOrderPlaced` (pure, `summary.ts`) are the texts the SYSTEM sends. `cartHash(cart, totalCents)` includes the total: a price change after the summary invalidates the confirmation.
- The board (`GET /api/orders`) = every non-terminal order (any day) + terminal ones since the start of today in the STORE's timezone (`order.time.ts`).
- Realtime: `order.events.ts` is an in-memory `EventEmitter` per tenant; `GET /api/orders/stream` is SSE (`event: order_created|order_updated`, `: ping` every 25s). Single-instance only — multiple backend instances need Redis pub/sub / Postgres LISTEN behind the same interface. Auth is the normal Bearer header (the panel uses `fetch` streaming, never `EventSource` with a token in the URL).
- Errors: `OrderNotFoundError` 404, `InvalidTransitionError` 409 (`from`/`to` in the body), `InvalidOrderError` 422 (`reject_reason_required`, `reject_note_required`, `invalid_status`, …).

### Dashboard (`modules/dashboard/`)

- Counts ORDERS by status, never messages. "Valid" = everything except `rejected`/`cancelled`; revenue = `SUM(total_cents)` of valid orders (in-progress included); rejected+cancelled is a separate count.
- Every "day" is the STORE's day: SQL groups by `(created_at AT TIME ZONE <store tz>)::date`, the window starts at `startOfDayInZone` 6 days back. `dashboard.stats.ts` (pure) fills missing days with zeros (`fillDays`), computes the integer ticket, and `dayKeyInZone`.
- `topItems` joins `order_items`/`orders` with `tenant_id = $1` on BOTH sides. `breakdown` only accepts the two literal columns (`fulfillment`, `payment_method`) — never interpolate input there.
- Store status reuses `isOpenAt`/`nextOpening` from `store.hours.ts`.

### Agent (`modules/agent/`)

- `generateAgentReply` **never throws**: model down, missing API key, no tool support, timeout, > `MAX_TOOL_ITERATIONS` (6) rounds, total budget (`LLM_TIMEOUT_MS × 2`) or empty output → `{ reply: null, trace }` → persona fallback. A customer on WhatsApp must always get an answer.
- **LLM provider** (`ai/llm-client.ts`): `LLM_PROVIDER=ollama|anthropic|openai|gemini` (+ `LLM_MODEL`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`, `LLM_TIMEOUT_MS` per call — the agent passes it as `invoke(..., { timeout })` for every provider; unknown provider fails at boot). SDKs are imported on demand. Tools are bound in the OpenAI "function" format (`tools/definitions.ts`). Local `llama3.2` runs the loop but takes 80–125 s/turn (over the default 30 s timeout → always falls back) and is unreliable at tool calling: use a hosted model for anything real.
- The loop (`agent.service.ts`): system prompt + history → `model.invoke` → for each tool call `executeTool` → `ToolMessage` back → repeat. **Three replies are written by the SYSTEM, not the model, and end the turn immediately** (`ToolOutcome.finalReply`; the remaining tool calls of that message are skipped): the order summary (`request_confirmation`), the placed-order confirmation (`place_order`) and the menu link (`send_menu_link`). So the model can never paraphrase values or alter the URL, and summary + `place_order` can never happen in the same turn.
- Tools (`tools/executor.ts`, never throws — failures become `{ ok:false, error }` for the model): `send_menu_link` (third system-written reply: the SYSTEM sends the link text and ends the turn; no `PUBLIC_APP_URL` → `menu_link_unavailable` and the model continues in chat), `search_menu`, `add_item` (validates the WHOLE line via `priceCart` before saving; merges identical lines), `remove_item`/`update_quantity` (1-based `line_number` as shown by `view_cart`), `view_cart`, `set_fulfillment` (zone resolved by `normalizeNeighborhood`, exact then unique-substring; not served → lists served neighborhoods), `set_payment` (`change_for_reais` → cents in `args.ts`; only cash), `request_confirmation`, `place_order`, `store_info`, `call_human` (phase 4 will mark the handoff; today it only logs). Args parsers (`tools/args.ts`) return `{ok}|{error}`, tolerate what small models produce (numeric strings, nulls, address as text).
- The prompt tells the model to prefer `send_menu_link` for anyone who wants to order, and to CONTINUE from `view_cart` (delivery → address → payment → summary) when the cart already came from the page.
- **Confirmation invariants**: every cart-mutating tool goes through `saveEditedCart` (status back to `open`, `summaryHash` cleared). `place_order` refuses unless status is `awaiting_confirmation` AND `cartHash(now)` equals the stored hash, re-prices (problems refuse), refuses with the store closed/paused (`store_closed` carries `nextOpening` in the store timezone), then claims the cart with an atomic `DELETE ... WHERE status = 'awaiting_confirmation' AND summary_hash = $3` (`claimConfirmedCart`): two racing "sim" → one order. If `createOrder` fails the cart is put back; errors AFTER the order exists (saving `last_address`) are logged and swallowed, never undo it.
- `agent.prompt.ts` is pure (prompt, `buildMenuSummary` — names/prices only, `null` above 60 active items —, customer/store blocks); `agent.context.ts` loads store/menu/last order into it. Behavior changes are text changes there.
- The customer context (name, last address, last order) is only offered to the model as something to CONFIRM ("mesmo endereço?"); the cart is rebuilt with `search_menu` + `add_item`.

### Cardápio em link (`modules/menulink/`, Fase 2.5)

The customer cannot see what they pick in chat, so the agent sends a link to a web page with the real menu (photos, sizes, flavors, add-ons); the customer builds the cart there and returns to WhatsApp, where the order continues exactly as in Fase 2 (delivery → payment → SYSTEM summary → "sim" → `place_order`).

- **Code** (`menuLink.code.ts` + `menu_links` table): the URL carries only a short RANDOM code (`randomBytes(9)` → 12 base64url chars, 72 bits), a pointer to a `menu_links` row `(code PK, tenant_id, conversation_id, expires_at)`; tenant, conversation and validity live in the DB, never in the URL (so the link is short and revocable). TTL 3h (= cart TTL). `findMenuLinkByCode` is a deliberate exception to the tenant-first rule (it is what DISCOVERS the tenant, like `findUserById`); everything after uses the row's tenant. Malformed codes are rejected before touching the DB; unknown → 401 `invalid_menu_link`; past `expires_at` → 401 `expired_menu_link`. `resolveSession` also requires the conversation to exist (`ON DELETE CASCADE` on the link, so resetting the simulator kills its links). A panel JWT is just a malformed/unknown code here.
- **Link**: `createMenuLink` → `<PUBLIC_APP_URL>/c/<code>` (+ `sent` event); REUSES the conversation's still-valid link (same address when the customer asks again), retries on a code collision, and sweeps links expired > 1 day on creation (no job). `PUBLIC_APP_URL` defaults to `http://localhost:5173` outside production and to `""` in production (tool turns itself off rather than sending a broken link).
- **`GET /api/public/menu/:code`** → `{ restaurant { name, logoUrl, open, paused, nextOpening (ISO), timezone, minOrderCents }, menu, cart { items }, whatsappUrl }` (+ `opened` event). `toPublicMenu` builds the public shape field by field (active only, sold-out kept and flagged; no `position`/`active`/`categoryId`). Reopening the link resumes the saved cart.
- **`POST /api/public/cart/:code`** `{ items: [{ itemId, sizeId, optionIds, quantity, notes }] }`: `parseCartItems` (shape only, strict types, ≤ 50 lines) → `priceCart` on the whole candidate cart → only LINE problems (`lineIndex !== null`) block (`InvalidPublicCartError` 422 `cart_invalid` + `problems[{code,lineIndex}]`, `cart_empty`); delivery/payment/minimum are NOT required here, the chat collects them (the minimum is checked at `request_confirmation`). Then `saveEditedCart` (keeps fulfillment/payment already collected), `confirmed` event, and `sendOutbound` with `formatCartReceived` ("Recebi seu carrinho…" + the next question by cart state). A failed notice is logged and does NOT undo the saved cart (`notified: false` → the page tells the customer to send a message). The browser is never a price source.
- **`whatsappUrl`**: `https://wa.me/<store_settings.whatsapp_number>?text=<RETURN_TEXT>`, only for `whatsapp` conversations with a valid number; `null` on the simulator. `whatsapp_number` = the restaurant's service number (digits, DDI, validated 10–15 in `parseStoreSettings`, `whatsapp_number_invalid`), separate from `owner_whatsapp` (the owner's personal number for location messages).
- **Rate limit** (`api/middlewares/rateLimit.ts`): in-memory sliding window per IP (GET 60/min, POST 20/min) → `RateLimitedError` 429. Single instance only, like the order bus; several instances → Redis behind the same signature.
- **Errors**: `UnauthorizedError` codes `invalid_menu_link`/`expired_menu_link` (401, code only), `InvalidPublicCartError` 422, `RateLimitedError` 429 — all mapped in `errorHandler`.
- **Funnel** (`menu_link_events`: `sent → opened → confirmed → ordered`): counted by DISTINCT conversation, last 7 days, in `GET /api/dashboard` as `menuFunnel`. `ordered` is written by `place_order` only if the conversation already has a `confirmed` (`insertMenuLinkOrdered`), so chat-typed orders don't count. Funnel writes are best-effort where they must not block (order creation).

### WhatsApp (`modules/whatsapp/`)

- `GET /webhooks/whatsapp` — Meta handshake: `hub.mode=subscribe` + `hub.verify_token === WHATSAPP_VERIFY_TOKEN` → echo `hub.challenge`; otherwise `ForbiddenError("invalid_verify_token")` → 403.
- `POST /webhooks/whatsapp` — `isValidSignature(req.rawBody, X-Hub-Signature-256, WHATSAPP_APP_SECRET)` **fails closed** (no secret → reject). `rawBody` is captured in `express.json({ verify })` only for `/webhooks/*`; `JSON.stringify(req.body)` does NOT reproduce the signed bytes.
- Responds 200 **before** processing (Meta retries slow webhooks; the LLM takes seconds). Dedup by `external_id` covers the retries that slip through. This assumes a long-running Node server; on serverless, put a queue here.
- `processWebhook` handles messages sequentially (order per customer) and isolates failures per message.
- Tenant routing: `metadata.phone_number_id` → `tenants.whatsapp_phone_number_id`.
- **Location messages** (`type: "location"`): `parseWebhookPayload` extracts `location {latitude, longitude}` (range-checked). `handleInboundMessage` (`unsupportedType: "location"` + `location`) → `decideLocation`: only when the sender matches `store_settings.owner_whatsapp` (`store/owner.ts` `isOwnerNumber`: digits only, assumes DDI 55, tolerates the Brazilian 9th-digit difference between the panel text and the Meta `wa_id`) it calls `setStoreLocation` (`store/store.location.ts`: Google reverse geocoding → saves lat/lng + address text together; on geocoder failure saves the point and clears the old address) and replies with a fixed confirmation; from any other number it is plain unsupported media (customer location = future delivery-fee phase). No owner number registered → nobody can set it. The simulator cannot send locations.
- `sendWhatsAppText` skips (logs) when `WHATSAPP_ACCESS_TOKEN` is empty — dev works with the simulator only. Free text is only allowed inside the 24h window opened by the customer; proactive messages need approved templates (not implemented).

### Auth

- HS256 JWT `{ userId, tenantId }`, `algorithms: ['HS256']` allowlist, `exp` required. `verifyAuthToken` returns a union, never throws.
- bcryptjs cost 10; unknown e-mail runs `verifyPassword` against a dummy hash (no timing oracle); both failures → `invalid_credentials`.
- `JWT_SECRET` has no default in compose; `assertProductionSecrets()` refuses the dev value or < 32 chars in production.

### Errors

- `errorHandler` maps: `UnauthorizedError` 401, `ForbiddenError` 403, `TenantNotFoundError`/`OrderNotFoundError` 404, `InvalidTransitionError` 409, `InvalidSettingsError`/`InvalidInputError`/`InvalidMenuError`/`InvalidOrderError` 422, `GeoUnavailableError` 502, anything else 500 with a fixed safe message (never `error.message` — it leaks host/port/columns, and this handler serves anonymous callers).
- Auth/forbidden/not-found branches return `code` only, no message.

### Database

`backend/db/init.sql` runs on the first Postgres start AND on every backend boot (`runMigrations`). Everything must be idempotent (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DO $$ … EXCEPTION WHEN duplicate_object $$`). Destructive changes need a reset: `docker compose down && docker volume rm attendant_postgres_data && docker compose up -d`, then `npm run seed`.

### Menu (`modules/menu/`)

- `menu_categories` → `menu_items` → `item_sizes` / `option_groups` → `options`, all `tenant_id`-scoped, `ON DELETE CASCADE`.
- An item's price comes from `price_cents` (no sizes) OR from `item_sizes` (sizes present, `price_cents` is `NULL` and ignored). Validated at write time: `InvalidMenuError("price_or_sizes_required", ...)`.
- `option_groups.pricing_rule`: `sum` (add-ons stack) | `max` | `average` — `average` with `max_select = 2` is the half-and-half pizza pattern (two flavor options, price is their average).
- `createItem`/`updateItem` replace the item's sizes and option groups wholesale (delete-all, reinsert) inside one transaction — simpler and safer than a granular diff, and matches how the drawer submits (always the full nested state).
- `getFullMenu(tenantId)` (panel — everything, active or not) vs. `getPublishedMenu(tenantId)` (agent, fase 2 — only `active` categories/items, short-TTL cache invalidated on every write, same pattern as `settings.service`).

### Store (`modules/store/`)

- `store_settings`: one row per tenant, defaults applied in the service (same lazy-default pattern as `bot_settings`).
- `store.hours.ts` is pure (no DB): `isOpenAt`/`nextOpening` evaluate `opening_hours` JSON in the STORE's `timezone` (via `Intl.DateTimeFormat`, not the server's), never the container's local time. A day's interval crossing midnight (`["18:00","02:00"]`) is open into the next calendar day; `nextOpening` walks up to 14 days ahead. `describeHours` renders the pt-BR sentence the agent uses; `describeNextOpening` gives "hoje às 18h" / "amanhã às 11h" / "sexta-feira às 18h" (days compared in the store timezone) for closed-store refusals.
- `neighborhood.ts` (`normalizeNeighborhood`) strips accents/case for `delivery_zones.neighborhood_key`, the column the agent will match against free-text neighborhood input in fase 2. `UNIQUE (tenant_id, neighborhood_key)`.

### Geo (`modules/geo/`)

- The owner picks the served city once (`PUT /api/store/geo { osmId }`): the backend fetches the city outline (Nominatim `lookup`, simplified) and the neighborhood outlines (Overpass `out geom`, `place=suburb|neighbourhood|quarter` + `admin_level` 9/10), and upserts one `store_geo` row per tenant. The panel map never calls OSM for outlines at view time.
- `osm.parse.ts` is pure: `assembleRings` joins a relation's way segments into closed rings; unclosed ones are dropped. Neighborhood `key` = `normalizeNeighborhood(name)` — the same key as `delivery_zones.neighborhood_key`, so a map click matches a zone by name (no FK between them).
- Overpass instances are tried in order (`OSM_OVERPASS_URLS`); a busy instance answers 200 + HTML, so a JSON parse failure means "try the next one". Every failure → `GeoUnavailableError` → 502 `geo_unavailable`. Nominatim/Overpass require a real `OSM_USER_AGENT`.
- Address geocoding is Google, not OSM (`google.client.ts` + pure `google.parse.ts`; `GET /api/store/geo/geocode` free text → points is currently unused by the UI, `reverseGeocodeGoogle(lat,lng)` point → address is used by `store.location.ts`): `google.client.ts` (+ pure `google.parse.ts`), server key `GOOGLE_GEOCODING_API_KEY` (separate from the browser map key), Google answers 200 on errors so the body `status` also decides (`OK`/`ZERO_RESULTS` only; anything else or no key → `GeoUnavailableError`). City search and outlines stay OSM.
- OSM neighborhood coverage is partial (Luziânia: ~49). Neighborhoods without an outline currently have no way to get a fee in the panel (`POST /api/store/zones` still accepts them).

## Frontend architecture

- `src/api/*` all go through `client.ts` `request()` — single place for `Authorization: Bearer`, base URL, 401 handling and 204. Mapping a status in `onStatus` opts that call out of the global sign-out.
- `useAuth` hydrates synchronously from storage and revalidates via `/api/auth/me`; only a real 401 signs out. The 401 handler never navigates; `RequireAuth` does.
- Routes: `/login` (public); `/admin` → `/admin/dashboard` ("Visão geral", first sidebar item); `/admin/orders` (second item, the counter screen); `/admin/whatsapp` (mocked WhatsApp Web replica), `/admin/simulator`, `/admin/menu` (Cardápio, its own sidebar item in the day-to-day group; old `/admin/store/menu` redirects here), `/admin/store` (`StoreLayout` = fixed title + tabs + `<Outlet/>`; tabs Geral, `/hours`, `/payment`, `/delivery` only when `features.maps`; sidebar puts Loja + Simulador in the bottom group); everything else → `/admin`.
- `pages/Dashboard` ("Visão geral"): `StoreStatus` (dot + text, never color alone; next opening in the store timezone) → 4 `StatCard`s (orders/revenue/ticket today, in progress now → link to Pedidos) → `RevenueChart` (7 days, single series, plain divs: ≤24px columns, 4px rounded top, today full accent / other days faded, value label only on today, per-column tooltip on hover/focus, `sr-only` table with every number) → `RankedList` ×3 (best sellers, delivery × pickup, payment — proportional bars instead of pies). `hooks/useDashboard` refreshes every 60s and keeps the last numbers if a refresh fails (not realtime — that is Pedidos). `components/dashboard/format.ts`: `fill()` for `{n}`/`{when}` placeholders (the project `t()` does not interpolate), weekday from the day key anchored at noon UTC.
- `pages/Orders`: kanban Novos · Em preparo · Saiu / Pronto · Concluídos hoje (`components/orders/orderView.ts` is the pure part: column per status, primary action per status/fulfillment — mirrors backend `order.status.ts` — and "late" = pending > 5 min). `hooks/useOrdersBoard` = initial GET + SSE via `api/orders/orderStream.ts` (`fetch` streaming + `lib/sse.ts` parser, 401 → `notifyUnauthorized()`), reconnect with backoff 1s→15s, **re-GET on every (re)connect** (events missed while down are lost), optimistic transition with rollback. `hooks/useNewOrderAlert`: WebAudio beep (only after the "Ativar som" click — browsers block audio before a gesture) + tab title flashing while unfocused. `RejectDialog` requires a reason ("other" requires text); `OrderDrawer` cancels with an inline confirm (no `window.confirm`). "Pedido de teste" button only when `import.meta.env.DEV`. Errors render `orders.errors.<code>`; `invalid_transition` also re-fetches the board.
- `pages/PublicMenu` (`/c/:code`, OUTSIDE `RequireAuth` and outside `PublicLayout`, which has the panel Topbar — a standalone mobile-first page): `hooks/usePublicMenu(token)` (load by token, cart = ids + quantity only, merges identical lines via `sameLine`, cap 50; a 401 takes over the screen, a 422/429 stays in the cart with the lines intact and re-fetches the menu on `cart_invalid`), `components/publicMenu/*` (`Sheet` = dialog/aria-modal/Escape/focus restore; `ItemSheet`: size radios, option groups as checkboxes or radios when `maxSelect = 1`, blocks the extra choice at max, live price, disabled "Adicionar" with the reason in TEXT; `CartSheet`; `ConfirmedScreen` with the wa.me button; `PublicItemCard` — sold-out shown, marked, not openable). `lib/cartPricing.ts` MIRRORS backend `priceCart` for the live total only (same table in both tests; the server recalculates and its number is what the chat message says). `api/publicMenu` uses `auth: false` and maps 401/422/429 in `onStatus`, which also keeps a customer's expired link from triggering the admin's global sign-out. All copy under `publicMenu.*` (pt-BR + en-US); errors by `code` with a generic fallback, never `err.message`. Cart bar/sheet close on confirm, so "Alterar itens" lands on the menu.
- Panel bits of Fase 2.5: Loja › Geral has the "WhatsApp do atendimento" field (`whatsappNumber`); the dashboard has the "Funil do cardápio" panel (share of those who got the link per step); `ChatMessage` renders `http(s)` URLs as safe links (`linkify.ts`, never `javascript:`); `useSimulator` re-fetches history + cart when the tab becomes visible again (the "Recebi seu carrinho" message arrives while the customer is on the page), replacing the list only when the server has messages the screen does not know.
- `pages/Simulator` + `hooks/useSimulator(contactId)` + `hooks/useSimulatedCustomers`: test conversation per admin (`contact = admin-<userId>`, channel `simulator`) OR a simulated customer (`components/simulator/CustomerPicker`: name + fake phone → `contact = sim-<phone>`, its own conversation/cart/orders, creates the `customers` row). Switching customer reloads history + cart, clears debug, and drops a reply that lands after the switch. "Modo dev" toggle shows `components/simulator/DebugPanel`: the priced cart (money from cents via `lib/money`, status in words) and the tool calls of the LAST turn (`<details>` with args/result JSON; ok/refused in text + icon, never color alone). Cart skeleton sits on the cart, not the panel. `/reiniciar` is a panel command (`hooks/chatCommands`), handled locally, never sent to the attendant. Errors render `chat.errors.<code>` / `simulator.customers.errors.<code>` with a generic fallback — never `err.message`. `pending`/tool JSON in the debug panel are raw backend/model-facing data, not translated.
- `pages/Menu`: `CategoryChips` row on top ("Todos" + one chip per category, filters only) → selected category gets a toolbar (rename, active, ←/→ reorder, delete); items render as an `ItemCard` grid (photo, category, name, price, availability switch; card click = edit). Item ←/→ reorder only inside a selected category, never under "Todos" (calls `/reorder`, no drag-and-drop), one-click "esgotado" toggle (`PATCH .../availability`, optimistic with rollback on failure), `ItemDrawer` for create/edit (name, description, single price OR sizes, option groups with nested options — mirrors `MenuItemFormInput`). `menu.errors.<code>` per `InvalidMenuError`, fallback `menu.errors.generic`.
- `pages/Store*` + `pages/Menu` + `pages/Delivery` (tabs Geral / Horários / Pagamento / Entrega inside `StoreLayout`, one page each, no page header of their own; settings tabs each use their own `useStoreSettings` copy): settings autosave on a 700ms debounce (`useStoreSettings` + `SyncStatus`). Geral = restaurant info (`restaurantName`, `logoUrl` via the menu image upload, `contactEmail`, `ownerWhatsapp`, `address`) + pause/reopen + `LocationMap` pin (`latitude`/`longitude`, both or neither; gated by `features.storeLocation`, independent of `features.maps`). The address is READ-ONLY and the map is display-only: the panel has NO button to set them. They are set by the OWNER sending a WhatsApp location message to the restaurant's number (see WhatsApp); "Remover pino" clears lat/lng/address together; Horários = `OpeningHoursEditor`; Pagamento = payment methods as rounded toggle buttons (`aria-pressed`) + Pix key; Entrega = city map only (full width, fee panel floats over it). Pickup/delivery toggles, min order and estimated time have NO UI right now (fields still in `store_settings`); zones exist only via map clicks (no by-name table).
- **Maps are switched OFF** (`frontend/src/config/features.ts`, `features.maps = false`): no Entrega tab/route (`/admin/store/delivery` falls to `/admin`), no restaurant pin section in Geral, no map/geo fetches, Google Maps never loads. All code and tests stay; flip the flag to `true` (and set the keys in `.env`) to bring it back. Tests of the map UI set `features.maps = true` in `beforeEach`. The notes below describe the feature when ON.
- `pages/Delivery` map: `components/store/DeliveryMap` wraps Google Maps imperatively (`lib/googleMaps.ts` `loadGoogleMaps()` = memoized `@googlemaps/js-api-loader`, shared with `LocationMap`; key `VITE_GOOGLE_MAPS_API_KEY`, build-time; missing key/load failure → `MapStatus` overlay with `maps.errors.*`, never `err.message`). Colors read from `theme.css` tokens at runtime (`mapTheme.ts`), dark mode = JSON `styles` built from tokens, re-applied on `data-theme` change. With `VITE_GOOGLE_MAPS_MAP_ID` (vector Map ID, Locality boundary layer on) the city outline is Google's own (`cityBoundary.ts`: Geocoder → `place_id` → `LOCALITY` feature layer style, the dotted perimeter of google.com/maps; `styles` is forbidden with a Map ID, dark = `colorScheme`); otherwise the OSM municipality is drawn, with a mask polygon (world minus city, hole winding normalized in `maskRings` — Google needs opposite winding) hides everything outside the city; the view fits the neighborhoods' extent; `restriction` limits panning. Google has no polygon tooltips/dashes: hover label is a React `role=tooltip` div, states differ by stroke weight/opacity/`zIndex`. `mapGeometry.ts` is the pure part (GeoJSON [lon,lat] → [lat,lng] happens only there). Tests mock `lib/googleMaps` with a fake `google.maps` — jsdom has no layout.
- `lib/money.ts`: `formatBRL`/`parseBRLInput`, the ONLY place cents↔BRL-string conversion happens. Every price input in `Menu`/`Store` reads and writes cents; the text field is the only float-shaped thing, and it never reaches state or the API.
- i18n: `pt-BR` canonical + `en-US`. This is the admin UI language, unrelated to the bot's language.

## Roadmap

The v1 plan lives in [`PLAN.md`](PLAN.md): phases in order, each with tables, endpoints, screens, required tests and a "done when". Execute one phase at a time, tick its checkboxes, and update this file when the architecture changes.

## Git

Branches `type/short-summary` (kebab-case, no accents). Commits `type: descrição no imperativo`. One logical change per commit. Never commit or push unless asked; branch off `main` first.
