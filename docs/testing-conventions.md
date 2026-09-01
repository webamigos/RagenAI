# Testing conventions

Long-form detail split out of `AGENTS.md`, which has a hard 32,768-byte budget (Codex's `project_doc_max_bytes`) — content past that offset is silently dropped. The rules that must always be in context stay in `AGENTS.md`; the mechanics live here.

## Vitest

- Wrap components in `<NextIntlClientProvider messages={...} locale="en">`
- Mock server actions (`vi.mock`) — never hit real APIs
- Mock externals (Stripe, Prisma, logger) that'd fail in jsdom
- Use `vi.hoisted()` for mock functions referenced in `vi.mock()` factories
- `ResizeObserver` polyfill for cmdk/Radix components
- `@testing-library/user-event` for interactions; `waitFor` for async
- Follow existing patterns in `src/store/__tests__/`, `src/app/lib/utils/__tests__/`

## Playwright / E2E

- All routes use `/pl` locale prefix (Polish UI in assertions)
- Import `ROUTES`/`LABELS` from `e2e/helpers.ts`
- Mock external APIs (S3, Temporal, LLM) via `page.route()` — never hit real backends
- `buildMockSSE()` for streaming chat
- Tests run sequentially (single worker, shared DB state)
- `getByTestId()` for interactive elements; regex for Polish text
- Timeouts: 10s visibility, 15s navigation/login
