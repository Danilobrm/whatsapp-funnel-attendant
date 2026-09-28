# Rule — UI must consider all languages available in the system

Every user-facing string in the frontend MUST go through the i18n layer at `frontend/src/i18n/index.tsx`. Never hardcode a label, placeholder, tooltip, aria-label, or error message directly in JSX.

## Where languages live

- Locale contract: `type Locale` in `frontend/src/i18n/index.tsx`. The `availableLocales` array is the authoritative list — every new locale MUST be added here.
- Translation dictionaries: `frontend/src/i18n/translations/<locale>.ts`. `pt-BR.ts` is the canonical file. New locales must mirror its full key tree — no missing keys.
- Access strings via the `t(key)` function from the `useI18n()` hook. Nested keys use dot notation (e.g. `t("chat.commands.placeholder")`).

## Required steps for any UI addition

1. Add the new key to `pt-BR.ts` first (canonical language of the project).
2. Add the same key to every other locale file listed in `availableLocales`. If translation is not ready, add the pt-BR value as a placeholder and mark it with a `// TODO(i18n:<locale>)` comment.
3. Consume via `t("...")` — never a string literal.
4. If the UI has a component that only makes sense in some locales (rare), gate it with `locale === "..."` instead of duplicating components.

## Language selection

- User locale is stored in the `I18nProvider` state and switched via `setLocale`. Never read `navigator.language` directly inside a component — the provider handles detection.
- Attendant replies (simulator, WhatsApp) come from the backend in the bot's language; never translate them on the client. The admin UI locale is unrelated to the bot's language.

## What NOT to do

- No inline strings in JSX, alerts, toast messages, error boundaries, or `<title>` tags.
- No parallel translation systems (custom `messages.ts`, `en.json`, etc.). One layer only: `src/i18n/`.
- No skipping locale files "temporarily" — a missing key throws at runtime under strict lookup.
- No language switching by reloading the page — `setLocale` must be instant.

## Why

Adding a locale later must be a data-only change (drop a new file in `translations/`, add to `availableLocales`) — never a JSX refactor. Hardcoded strings turn a 1-hour locale addition into a full audit.
