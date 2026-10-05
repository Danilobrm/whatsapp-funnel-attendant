# Rule — Error handling must be typed, centralized, and never crash the server

Errors are part of the API contract. Every failure that reaches an HTTP client MUST be a structured response — never a stack trace, never a process crash, never a hanging request.

## Non-negotiable invariants

1. **Async handlers cannot leak rejections.** In Nest, a rejected `async` handler is forwarded to the exception filter (no `asyncHandler` needed). Never swallow the rejection: a floating promise outside the request path (e.g. the webhook's post-response processing) MUST carry its own `.catch` that logs.
2. **`mapError` (applied by the `AllExceptionsFilter`) is the single mapper from Error → HTTP.** Controllers/services throw typed errors, the filter translates them. Do not `res.status(500).json(...)` inside a controller for a case that could be represented by an error class.
3. **Use typed error classes for known domain rejections.** Example: `InvalidSettingsError(code, field)` → mapped to HTTP 422 in `mapError`. When adding a new failure mode with its own HTTP status or client-facing payload, add a new class and a new `instanceof` branch in `common/http/errorMapping.ts`. Do NOT overload existing classes with unrelated codes.
4. **User-facing failure messages must be i18n keys or come from a translatable table** — never a raw pt-BR string frozen in the service. The service can return a stable `code`; the frontend or a translation layer resolves the human text. See `chat.errors.*` and `settings.errors.*` in `frontend/src/i18n/translations/*.ts` for the pattern.
5. **Guardrails return, never throw**, when they are checking user input for a **validation** result. `classifyMessage` (`modules/ai/guardrails.ts`) returns a `MessageQualityResult`; `verifyAuthToken` returns a discriminated union. Callers decide to throw a typed error or route the code differently. This keeps pure functions pure and testable.

## The crash lesson (inherited from faq-chatbot, Express era)

Under Express 4 a service that threw inside a bare `async` handler was never forwarded to the error middleware: Node hit `unhandledRejection` and exited, even though the mapper already knew the typed error. That whole class of bug is gone in Nest (the exception filter receives every rejection), but the lesson stands for anything OUTSIDE the request path — a promise nobody awaits needs its own `.catch` that logs.

## Correct patterns

**Controller — HTTP translation only, errors just propagate:**

```ts
@Controller("api/settings")
export class SettingsController {
  @Put()
  async put(@Tenant() tenantId: TenantId, @Body() body: unknown) {
    const settings = await updateBotSettings(tenantId, body);
    return { settings, preview: buildPersonaTexts(settings) };
  }
}
```

**Service — throw typed error:**

```ts
if (!gate.ok) {
  throw new InvalidSettingsError("name_required", "name");
}
```

**`mapError` — one branch per typed error, generic 500 fallback:**

```ts
if (error instanceof InvalidSettingsError) {
  return known(422, { status: "invalid", code: error.code, field: error.field });
}
// ...other typed branches...
return { status: 500, body: { status: "error", code: "internal_error", message: "Erro interno…" }, unhandled: true };
```

**Frontend — code drives the UI, not the raw message:**

```ts
if (res.status === "rejected") {
  // t() returns the raw key on a miss — compare and fall back.
  const text = t(`settings.errors.${code}`);
  show(text === `settings.errors.${code}` ? t("settings.errors.generic") : text);
}
```

## What NOT to do

- A floating promise (`somethingAsync()` without `await`/`.catch`) in a handler — the rejection escapes the filter.
- `try/catch` in every controller returning `res.status(500).json(...)` — duplicates the work of `mapError`.
- Throwing raw `Error("string in pt-BR that the frontend will render verbatim")` — kills i18n.
- Swallowing errors with `.catch(() => {})` inside services to "keep the endpoint working" — hides real bugs. If a failure is recoverable, return a value; if not, throw and let the middleware map it.
- Adding new HTTP status codes ad-hoc in controllers instead of extending `mapError`.
- Logging errors and silently returning 200 — a broken write must return a non-2xx.

## Adding a new domain error

1. Extend the union of codes (e.g. `InvalidSettingsCode`) in the module that owns the concept.
2. Reuse the existing error class if the HTTP semantics match; otherwise create a new class in the same module and export it.
3. Add an `instanceof` branch in `common/http/errorMapping.ts` (`mapError`); the `AllExceptionsFilter` applies it.
4. Add the code + translation key in `frontend/src/i18n/translations/<locale>.ts` for every locale.

## Why

Crashes lose in-flight requests, kill websocket subscribers, and rotate the container in prod — a single bad `POST` becomes an outage. Typed errors + a single mapper keep the API contract stable, the logs actionable, and the frontend able to render specific UX (retry vs. edit vs. contact support) per code instead of a generic "algo deu errado".

## NestJS

O backend é NestJS 12 (`PLAN.md`, Fase N, concluída).

- **Um único mapa Error → HTTP**: `common/http/errorMapping.ts` (`mapError`), aplicado pelo `AllExceptionsFilter`. Um erro tipado novo ganha UM branch em `mapError` — nunca um `res.status(...)` no controller nem um mapa paralelo.
- **Sem `asyncHandler`**: o Nest encaminha a rejeição de qualquer handler `async` ao filter. Não existe mais "handler nu que derruba o processo".
- **Guard global fechado por padrão**: `AuthGuard` (`CommonModule`) exige Bearer em todo handler; rota aberta só com `@Public()`. Guards e interceptors lançam erro tipado (`UnauthorizedError`, `RateLimitedError`, `MulterError`…) — não montam resposta.
- `@Tenant()` / `@Auth()` entregam o contexto do token; o `tenantId` vem do token, nunca do body.
- O filter trata `HttpException` do próprio Nest (rota inexistente → 404 `route_not_found`, JSON inválido → 400 `http_error`) e não escreve corpo se `res.headersSent` (SSE).
- **Não use `@Header(...)` no handler** para definir `Content-Type` de sucesso: o header vaza para o JSON de erro do filter. Defina com `res.type(...)` (`@Res({ passthrough: true })`) só no caminho de sucesso.
- POST que não cria recurso responde 200 (`@HttpCode(200)`); o padrão do Nest é 201.
- Injeção por tipo no construtor funciona em dev e nos testes porque `dev`/`seed` rodam com `@swc-node/register` e o Vitest usa `unplugin-swc` (que emitem `design:paramtypes`); `@Inject(Token)` só para tokens que não são classe (ex.: `PG_POOL`). Não volte o `dev` para `tsx`: a injeção quebraria em silêncio.
- Classes injetáveis logam com `new Logger(NomeDaClasse.name)`, não com `console`.
