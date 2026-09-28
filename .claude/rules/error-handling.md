# Rule — Error handling must be typed, centralized, and never crash the server

Errors are part of the API contract. Every failure that reaches an HTTP client MUST be a structured response — never a stack trace, never a process crash, never a hanging request.

## Non-negotiable invariants

1. **Async handlers cannot leak rejections.** Express 4 does NOT auto-forward rejections from an `async` `RequestHandler` to the error middleware. An unhandled rejection eventually crashes Node. Wrap every async handler with `asyncHandler(fn)` from `backend/src/api/utils/asyncHandler.ts` OR call `next(err)` explicitly in a `try/catch`. **Never leave a bare `async (req, res) => { ... }` handler.**
2. **The terminal `errorHandler` middleware is the single mapper from Error → HTTP.** Controllers/services throw typed errors, the middleware translates them. Do not `res.status(500).json(...)` inside a controller for a case that could be represented by an error class.
3. **Use typed error classes for known domain rejections.** Example: `InvalidSettingsError(code, field)` → mapped to HTTP 422 in `errorHandler`. When adding a new failure mode with its own HTTP status or client-facing payload, add a new class and a new `instanceof` branch in `errorHandler`. Do NOT overload existing classes with unrelated codes.
4. **User-facing failure messages must be i18n keys or come from a translatable table** — never a raw pt-BR string frozen in the service. The service can return a stable `code`; the frontend or a translation layer resolves the human text. See `chat.errors.*` and `settings.errors.*` in `frontend/src/i18n/translations/*.ts` for the pattern.
5. **Guardrails return, never throw**, when they are checking user input for a **validation** result. `classifyMessage` (`modules/ai/guardrails.ts`) returns a `MessageQualityResult`; `verifyAuthToken` returns a discriminated union. Callers decide to throw a typed error or route the code differently. This keeps pure functions pure and testable.

## The crash lesson (inherited from faq-chatbot)

Before the fix, a service that threw inside a bare async handler flowed:

```
service(input) → guardrail returns { ok: false, code }
   → throw new SomeTypedError(code, ...)
   → async controller rejects
   → Express 4 does NOT forward the rejection
   → Node unhandledRejection → process exits
```

`errorHandler.ts` already knew how to map the typed error → 422, but the middleware never ran because the rejection was dropped between the handler and Express. The fix is at the wiring layer, not the throw site — wrap the handler.

## Correct patterns

**Controller — every async handler wrapped:**

```ts
import { asyncHandler } from "../utils/asyncHandler.js";
import { updateBotSettings } from "../../modules/settings/settings.service.js";

export const putSettings = asyncHandler(async (req, res) => {
  const settings = await updateBotSettings(tenantOf(req), req.body);
  res.json({ settings });
});
```

**Service — throw typed error:**

```ts
if (!gate.ok) {
  throw new InvalidSettingsError("name_required", "name");
}
```

**Middleware — one branch per typed error, generic 500 fallback:**

```ts
if (error instanceof InvalidSettingsError) {
  res.status(422).json({ status: "rejected", code: error.code, reason: error.reason });
  return;
}
// ...other typed branches...
res.status(500).json({ status: "error", message: safeMessage(error) });
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

- Bare `async (req, res) => { ... }` — will crash on throw.
- `try/catch` in every controller returning `res.status(500).json(...)` — duplicates work of `errorHandler`.
- Throwing raw `Error("string in pt-BR that the frontend will render verbatim")` — kills i18n.
- Swallowing errors with `.catch(() => {})` inside services to "keep the endpoint working" — hides real bugs. If a failure is recoverable, return a value; if not, throw and let the middleware map it.
- Adding new HTTP status codes ad-hoc in controllers instead of extending `errorHandler`.
- Logging errors and silently returning 200 — a broken write must return a non-2xx.

## Adding a new domain error

1. Extend the union of codes (e.g. `InvalidSettingsCode`) in the module that owns the concept.
2. Reuse the existing error class if the HTTP semantics match; otherwise create a new class in the same module and export it.
3. Add an `instanceof` branch in `errorHandler.ts`.
4. Add the code + translation key in `frontend/src/i18n/translations/<locale>.ts` for every locale.

## Why

Crashes lose in-flight requests, kill websocket subscribers, and rotate the container in prod — a single bad `POST` becomes an outage. Typed errors + a single mapper keep the API contract stable, the logs actionable, and the frontend able to render specific UX (retry vs. edit vs. contact support) per code instead of a generic "algo deu errado".
