# Rule — UI must follow the design system

Every new component, page, or style change MUST consume the design tokens defined in `frontend/src/styles/theme.css`. Do not hardcode raw colors, radii, or shadows. Do not introduce ad-hoc Tailwind color utilities that bypass the theme.

## What to use

- Colors and surfaces come from the `@theme inline` block in `theme.css`. Use the exposed Tailwind aliases: `bg-canvas`, `bg-canvas-alt`, `bg-surface`, `text-fg`, `text-muted`, `border-line`, `border-strong`, `hover:bg-hover`, `bg-accent`, `text-accent-fg`.
- Theme switching is driven by the `data-theme="dark"` attribute on `<html>` (see `hooks/useTheme.ts`). Any new palette entry MUST be defined in both `:root` and `[data-theme="dark"]` blocks so light + dark stay in sync.
- Layout primitives live in `frontend/src/components/` (`AdminLayout`, `PublicLayout`, `Sidebar`, `Topbar`). Reuse them instead of building a new shell.

## What NOT to do

- No `bg-white`, `text-black`, `bg-gray-*`, hex codes, or `rgb(...)` inline. They break dark mode and drift from the palette.
- No new `tailwind.config.js` — Tailwind v4 reads tokens from `@theme inline` directly.
- No `!important` or inline `style={{ color: ... }}` unless the value is dynamic and comes from a token.
- Do not duplicate spacing/radii constants — extend `theme.css` first, then consume the token.

## When adding a token

1. Add the CSS variable to both `:root` and `[data-theme="dark"]` in `theme.css`.
2. Expose it inside `@theme inline` with a `--color-*` / `--radius-*` / `--shadow-*` alias.
3. Use the resulting Tailwind utility in the component.

## Why

Dark mode, future themes (brand, high-contrast), and consistency across `Simulator`, `Settings`, `Login` and every future page all depend on a single palette source. Hardcoded colors force refactors every time the theme evolves.
