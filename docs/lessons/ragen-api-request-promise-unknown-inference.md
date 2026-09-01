---
title: 'ragenApiRequest without an explicit <T> silently infers Promise<unknown>'
modules: ['api-client']
areas: ['integration']
topics: ['type-safety', 'testing']
---

# ragenApiRequest without an explicit \<T\> silently infers Promise\<unknown\>

**Context**: found during the connectors UI cutover (and retroactively in the already-shipped projects cutover) — none of the `ragenApiRequest(...)` calls in `src/app/[locale]/(panel)/settings/connectors/actions.ts` had an explicit `<T>` generic, and none of the wrapping Server Action functions had an explicit return-type annotation.

**Problem**: TypeScript silently inferred every one of those calls as `Promise<unknown>`, which then propagated into every downstream consumer (`ConnectorCard.tsx`, `page.tsx`, and, in the projects case, `useSidebarLogic.ts`/`useNewThread.ts`/`Assistant.tsx`/`AssistantDropdownMenu.tsx`/both `ProjectComponent.tsx` files). `tsc --noEmit` only catches this if the check is broad enough to cover every *consumer* file — a check scoped to just the edited action file missed 15 real downstream errors the first time.

**Rule**: always give `ragenApiRequest<T>` an explicit generic (or annotate the wrapping function's return type), matched field-by-field against what the actual `apps/api` controller/service returns — never rely on inference. Always run an unfiltered `tsc --noEmit -p .` (not file-scoped, not grep-limited to the files just touched) before considering a `ragenApiRequest`-based change done.

**Applies to**: every `ragenApiRequest(...)` call site in `ragen-app` (`src/libs/ragen-api-client/client.ts`'s consumers) — most concentrated in the six Phase C UI-cutover modules (notifications, messages, projects, connectors, documents, threads), but applies to any future one too.
