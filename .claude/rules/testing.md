# Rule — Every change ships with tests (backend AND frontend)

Any change that adds or modifies behaviour MUST come with automated tests. Backend and frontend each own a test suite — `npm test` in that package must pass before a change is merged. Missing tests is not a "follow-up"; it is a blocker.

## Where tests live

- **Backend** — colocated `*.test.ts` next to the source file (e.g. `src/modules/ai/guardrails.test.ts`) OR under `src/**/__tests__/`. Runner: **Vitest** with `environment: "node"`. Config: `backend/vitest.config.ts`.
- **Frontend** — colocated `*.test.ts` / `*.test.tsx` next to the component/hook (e.g. `src/components/ChatMessage/ChatMessage.test.tsx`) OR under `src/**/__tests__/`. Runner: **Vitest** with `environment: "jsdom"` + `@testing-library/react` + `@testing-library/jest-dom`. Config: `frontend/vitest.config.ts`, setup file: `frontend/src/test/setup.ts`.

## What must be tested

| Change type | Backend | Frontend |
|---|---|---|
| New pure function (guardrails, formatters, mappers) | unit test — cover happy path + every documented rejection code | unit test — same |
| New service method | unit test that instantiates the class with fake dependencies — `new XService(repoMock as never, …)`, no `vi.mock` of module paths — assert branching + typed errors. Cache is an instance field: a fresh instance per test is a clean cache | n/a |
| New repository query | unit test with the REAL `TenantDb` over a fake pool (`fakeTenantDb(query, clientQuery)` in `src/test/fakeDb.ts`) — assert SQL, params, return shape; the tenant backstop runs for real | n/a |
| New controller / route | supertest against `createControllerTestApp({ controllers: [X], providers: [{ provide: XService, useValue: mock }] })` (`src/test/nestApp.ts`: real guard + filter, services replaced by `useValue` mocks) — assert status code, JSON shape, 401 without token, error mapping through the filter. Whole-app route matrix lives in `src/app.test.ts` (`createApp()`) | n/a |
| New React component | n/a | render + assert visible text / role, `userEvent` for interactions |
| New hook | n/a | `renderHook` — assert state transitions |
| Bug fix | regression test that FAILS on the buggy commit and PASSES after the fix | same |

Rendering tests MUST wrap components that call `useT()` / `useI18n()` in `<I18nProvider>`, and components that call `useAuth()` / router hooks in their respective providers. Add a helper (`frontend/src/test/render.tsx`) if the wrapping repeats.

## What NOT to do

- Do NOT ship a feature "with tests to follow". A PR without matching tests fails the review checklist.
- Do NOT snapshot-test entire pages — snapshots rot and hide intent. Assert the specific behaviour ("renders X when loading", "calls onSubmit with Y").
- Do NOT hit real Ollama / real Postgres / real network from unit tests. Use `vi.mock` for the module boundary. Integration tests that need real infra go behind an explicit script (e.g. `npm run test:integration`) and are opt-in.
- Do NOT test implementation details (private helpers, internal state names). Test the observable contract — return values, rendered output, thrown errors.
- Do NOT skip a failing test with `.skip` to unblock a merge. Fix the test or the code.

## Commands

```bash
# Backend
cd backend
npm test              # vitest run — CI mode, single pass
npm run test:watch    # vitest — watches files
npm run test:coverage # optional: vitest run --coverage

# Frontend
cd frontend
npm test              # vitest run
npm run test:watch    # vitest
npm run test:coverage # optional
```

CI (or the pre-merge check) MUST run both suites plus `npm run lint` and `npm run typecheck` in each package.

## Why

The project has fragile hot paths: the conversation gate (persona vs. agent), webhook signature and deduplication, tenant isolation, error → HTTP mapping, i18n key resolution. All of these have already had regressions where "the code looked right but the output was wrong". Tests convert a class of bugs from "found in production" to "found on `npm test`". No manual QA scales to keep these surfaces covered.
