# Event bus

Split out of `README.md` so the README can introduce the product rather than
document it. Covers `apps/web/src/libs/events/` — the in-process typed pub/sub used to keep lifecycle side-effects out of core auth and organization logic.

`src/libs/events/` provides a lightweight typed pub/sub for decoupling lifecycle side-effects from core auth/org logic.

**Core** (`bus.ts`): `createEventBus<TEvents>()` returns an async `emit()` + synchronous `on()` with `Unsubscribe`. `emit()` fans out to all registered handlers via `Promise.allSettled` — one subscriber's failure cannot affect siblings or the caller. The failure reporter itself is wrapped in a try/catch as an extra safety net. A process-wide singleton lives in `index.ts`.

**Events** (`types.ts`): `RagenEvents` is the typed event map. Payloads carry identifiers only — subscribers re-fetch heavier data if needed. Current events: `user.emailVerified`.

**Subscribers** (`subscribers/`): one file per side-effect. Each exports a `register*Subscriber()` function that calls `eventBus.on(...)` and returns `Unsubscribe`. Current subscribers:

- `welcome-email.ts` — sends the Resend welcome email.
- `newsletter-signup.ts` — adds the user to a Resend segment (self-disables when `RESEND_DEFAULT_SEGMENT_ID` is not set).

`subscribers/index.ts` aggregates them in `registerAllSubscribers()` (idempotent — a module-level guard prevents double-registration under HMR/test). Registration runs at server startup from `instrumentation.ts register()`, Node-only — Edge bundles never pull in subscriber deps.

**Privacy**: subscriber logs route emails through `maskEmail()` (`mask-email.ts`) so full addresses never hit stdout. `a***@example.com` preserves enough context for debugging.

**Adding a new side-effect on an existing event:** create `subscribers/<name>.ts`, export `registerXSubscriber()`, add the call to `registerAllSubscribers()`. No changes to the emitter code.

**Adding a new event:** add the id → payload shape to `RagenEvents`, call `eventBus.emit(...)` at the site, then create any subscribers that should react.

**Limitations**: the bus is in-process and non-persistent. Events lost on crash or missed by other instances in a multi-instance deploy. For durability use Temporal or a DB write.
