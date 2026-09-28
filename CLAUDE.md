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

- Node **>= 22**, TypeScript ESM in both packages. Backend: Express 4 + `pg` + LangChain/Ollama, runs with `tsx`, builds with `tsc`. Frontend: Vite 5 + React 18 + Tailwind v4 + react-router v7.
- Postgres 16 and Ollama run in Docker; API and Vite run on the host in dev.

```bash
docker compose up -d postgres ollama
docker exec -it attendant_ollama ollama pull llama3.2

cd backend && cp .env.example .env && npm install
npm run seed        # tenant "pizzaria-demo", admin danilo@admin.com / 123456, bot Nina
npm run dev         # :3000
npm test && npm run lint && npm run typecheck

cd frontend && npm install && npm run dev   # :5173 → /admin/simulator
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
├── config/                  # env.ts (+ assertProductionSecrets), db.ts (query helper), migrate.ts
├── lib/fetchWithTimeout.ts  # EVERY outbound HTTP on a reply path uses this
├── types/express.d.ts       # req.auth (optional), req.rawBody (webhooks only)
├── scripts/seed.ts
├── api/
│   ├── server.ts            # mounts + guards (guard lives on the MOUNT)
│   ├── routes/*Routes.ts    # Router only, no logic
│   ├── controllers/*.ts     # req/res translation only
│   ├── utils/               # asyncHandler, authContext (tenantOf/authOf — the only req.auth readers)
│   └── middlewares/         # errorHandler (single Error→HTTP mapper), auth/requireAuth
└── modules/
    ├── tenants/             # TenantId brand, resolve by WhatsApp phone_number_id (cached, positive-only)
    ├── auth/                # jwt (HS256 allowlist), bcrypt, no user enumeration
    ├── settings/            # persona per tenant → deterministic texts (greeting/identity/fallback/junk)
    ├── menu/                # categories/items/sizes/option groups CRUD + getPublishedMenu (cached, agent-facing)
    ├── store/                # store settings, delivery zones, store.hours.ts (pure) + neighborhood.ts (pure)
    ├── ai/                  # guardrails.ts (message gate), ollama-client.ts
    ├── conversation/        # handleInboundMessage — THE single entry point for every channel
    ├── agent/               # generateAgentReply (LLM) + agent.prompt.ts (pure prompt building)
    ├── whatsapp/            # webhook signature, payload parsing, Graph API client, processWebhook
    ├── health/
    └── errors/              # InvalidInputError → 422, InvalidMenuError → 422 (menu + store)
```

Routes:

```ts
app.use("/health", healthRoutes);                          // public (compose healthcheck)
app.use("/api/auth", authRoutes);                          // POST /login open; GET /me guarded
app.use("/webhooks/whatsapp", whatsappRoutes);             // public, authenticated by HMAC signature
app.use("/api/settings", requireAuth, settingsRoutes);
app.use("/api/simulator", requireAuth, simulatorRoutes);   // GET/DELETE /conversation, POST /messages
app.use("/api/menu", requireAuth, menuRoutes);             // categories, items (+ sizes/option groups nested), reorder, availability
app.use("/api/store", requireAuth, storeRoutes);           // settings + /zones CRUD
```

### Multi-tenancy — `tenantId` is ALWAYS the first repository argument

- Every repository function and tenant-scoped service takes `tenantId: TenantId` first. Deliberate exceptions carry a comment: `findUserByEmail` (login precedes the tenant), `findUserById` (global PK, discovers the tenant), `findTenantById` (querying the `tenants` row by its own PK — no `tenant_id` column to check), and `findTenantByWhatsAppPhoneNumberId` (it is what discovers the tenant).
- `TenantId` is a **branded** number, minted only via `asTenantId()` at trust boundaries (JWT verification, WhatsApp phone_number_id resolution, seed). Argument transposition becomes a compile error.
- Tables with `tenant_id`: `tenants`, `users`, `bot_settings`, `conversations`, `messages`, `menu_categories`, `menu_items`, `item_sizes`, `option_groups`, `options`, `store_settings`, `delivery_zones`. Every FK is `ON DELETE CASCADE`.
- `insertMessage` guards `conversationId` with `EXISTS (... AND tenant_id = $1)` so a foreign id is a no-op.
- **`config/tenantQuery.ts` is the runtime backstop, not just a convention.** Every tenant-scoped repository call goes through `tenantQuery(tenantId, sql, params)` (outside a transaction) or `assertTenantScoped(tenantId, sql, params)` right before `client.query(...)` (inside `withTransaction`, see `modules/menu/menu.repository.ts`). Both throw before the query runs if the SQL text doesn't mention `tenant_id`, or if the first bound parameter isn't that exact `tenantId` — the two shapes a copy-paste bug takes. It does NOT verify the filter is semantically correct (right column, right place in the WHERE) — that is still the job of the isolation tests below.
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
   - everything else → `generateAgentReply`; `null` → `persona.fallback`.
   Mid-conversation, "ok", "blz", "obrigado" are answers to the bot and MUST reach the agent. Do not apply the greeting/junk shortcut there — it was the inherited gate's biggest trap.
5. Record outbound replies. A failure here is logged and swallowed: the reply is already decided.

Reply `provider` is `persona` (fixed text) or `agent` (LLM); the simulator shows it.

### Agent (`modules/agent/`)

- `generateAgentReply` **never throws**: model down, timeout or empty output → `{ reply: null }` → persona fallback. A customer on WhatsApp must always get an answer.
- `agent.prompt.ts` is pure. Behavior changes are text changes there, tested without infra.
- The current prompt forbids inventing menu, prices, hours and fees, because there is no menu in the system yet. **This is the main extension point**: menu, cart and order confirmation enter as agent tools here, not in the conversation service.
- Ollama timeout (`OLLAMA_TIMEOUT_MS`, default 30s) is on the hot path — keep it short.

### WhatsApp (`modules/whatsapp/`)

- `GET /webhooks/whatsapp` — Meta handshake: `hub.mode=subscribe` + `hub.verify_token === WHATSAPP_VERIFY_TOKEN` → echo `hub.challenge`; otherwise `ForbiddenError("invalid_verify_token")` → 403.
- `POST /webhooks/whatsapp` — `isValidSignature(req.rawBody, X-Hub-Signature-256, WHATSAPP_APP_SECRET)` **fails closed** (no secret → reject). `rawBody` is captured in `express.json({ verify })` only for `/webhooks/*`; `JSON.stringify(req.body)` does NOT reproduce the signed bytes.
- Responds 200 **before** processing (Meta retries slow webhooks; the LLM takes seconds). Dedup by `external_id` covers the retries that slip through. This assumes a long-running Node server; on serverless, put a queue here.
- `processWebhook` handles messages sequentially (order per customer) and isolates failures per message.
- Tenant routing: `metadata.phone_number_id` → `tenants.whatsapp_phone_number_id`.
- `sendWhatsAppText` skips (logs) when `WHATSAPP_ACCESS_TOKEN` is empty — dev works with the simulator only. Free text is only allowed inside the 24h window opened by the customer; proactive messages need approved templates (not implemented).

### Auth

- HS256 JWT `{ userId, tenantId }`, `algorithms: ['HS256']` allowlist, `exp` required. `verifyAuthToken` returns a union, never throws.
- bcryptjs cost 10; unknown e-mail runs `verifyPassword` against a dummy hash (no timing oracle); both failures → `invalid_credentials`.
- `JWT_SECRET` has no default in compose; `assertProductionSecrets()` refuses the dev value or < 32 chars in production.

### Errors

- `errorHandler` maps: `UnauthorizedError` 401, `ForbiddenError` 403, `TenantNotFoundError` 404, `InvalidSettingsError`/`InvalidInputError`/`InvalidMenuError` 422, anything else 500 with a fixed safe message (never `error.message` — it leaks host/port/columns, and this handler serves anonymous callers).
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
- `store.hours.ts` is pure (no DB): `isOpenAt`/`nextOpening` evaluate `opening_hours` JSON in the STORE's `timezone` (via `Intl.DateTimeFormat`, not the server's), never the container's local time. A day's interval crossing midnight (`["18:00","02:00"]`) is open into the next calendar day; `nextOpening` walks up to 14 days ahead. `describeHours` renders the pt-BR sentence the agent will use (fase 2).
- `neighborhood.ts` (`normalizeNeighborhood`) strips accents/case for `delivery_zones.neighborhood_key`, the column the agent will match against free-text neighborhood input in fase 2. `UNIQUE (tenant_id, neighborhood_key)`.

## Frontend architecture

- `src/api/*` all go through `client.ts` `request()` — single place for `Authorization: Bearer`, base URL, 401 handling and 204. Mapping a status in `onStatus` opts that call out of the global sign-out.
- `useAuth` hydrates synchronously from storage and revalidates via `/api/auth/me`; only a real 401 signs out. The 401 handler never navigates; `RequireAuth` does.
- Routes: `/login` (public); `/admin/simulator`, `/admin/menu`, `/admin/store`, `/admin/settings` (guarded); everything else → `/admin`.
- `pages/Simulator` + `hooks/useSimulator`: test conversation per admin (`contact = admin-<userId>`, channel `simulator`). `/reiniciar` is a panel command (`hooks/chatCommands`), handled locally, never sent to the attendant. Errors render `chat.errors.<code>` with fallback to `chat.error` — never `err.message`.
- `pages/Menu`: categories with nested items, up/down reorder (calls `/reorder`, no drag-and-drop), one-click "esgotado" toggle (`PATCH .../availability`, optimistic with rollback on failure), `ItemDrawer` for create/edit (name, description, single price OR sizes, option groups with nested options — mirrors `MenuItemFormInput`). `menu.errors.<code>` per `InvalidMenuError`, fallback `menu.errors.generic`.
- `pages/Store`: settings autosave on the `/admin/settings` 700ms-debounce pattern (`OpeningHoursEditor` for per-day intervals, pause/reopen, fulfillment, payment methods, Pix key, owner WhatsApp); `ZonesTable` is direct CRUD (create/update/delete per row, no debounce — it's a list, not a form).
- `lib/money.ts`: `formatBRL`/`parseBRLInput`, the ONLY place cents↔BRL-string conversion happens. Every price input in `Menu`/`Store` reads and writes cents; the text field is the only float-shaped thing, and it never reaches state or the API.
- `pages/Settings`: persona editor with 700ms autosave and live preview from the backend (same source the conversation uses).
- i18n: `pt-BR` canonical + `en-US`. This is the admin UI language, unrelated to the bot's language.

## Roadmap

The v1 plan lives in [`PLAN.md`](PLAN.md): phases in order, each with tables, endpoints, screens, required tests and a "done when". Execute one phase at a time, tick its checkboxes, and update this file when the architecture changes.

## Git

Branches `type/short-summary` (kebab-case, no accents). Commits `type: descrição no imperativo`. One logical change per commit. Never commit or push unless asked; branch off `main` first.
