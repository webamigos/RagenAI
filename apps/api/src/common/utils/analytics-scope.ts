import { Source } from '../../generated/prisma/client.js';

/**
 * Knowledge Analytics counts questions people asked, not requests an
 * integration made.
 *
 * `/v1/chat` and `/v1/chat/completions` persist a `Thread` and its messages
 * only in debug mode, so most API traffic never reaches these tables at all.
 * Debug mode is gated differently on each surface — apps/api reads the API
 * key's own `debugMode` column (`ApiKeyGuard`), while apps/web's internal
 * `/api/v1/*` routes still read an `x-debug-mode: 1` header — which is
 * precisely why "the API is not in the numbers" was believed rather than
 * enforced.
 *
 * The exception is the problem: with debug on, one client looping over a
 * backlog lands in the same rows as the organization's own chat, and the
 * summary card, the daily chart and the negative-feedback table all move —
 * for a reason nobody reading the screen can see. A single integration run
 * can outnumber a week of real questions.
 *
 * Cited and unused documents need no equivalent filter: `DocumentCitation`
 * rows are written by `assistant-stream.ts`, which the API path does not use.
 *
 * `UI`, `PUBLIC` and `CHATBOT` all stay counted. Each is a person typing a
 * question — through the panel, a shared thread, or an embedded widget — and
 * the widget in particular is where a lot of real traffic arrives.
 *
 * The screen says so, via `settings-page.knowledge-analytics.api-excluded`.
 * Change one and change the other: a scope nobody states is a scope people
 * misread.
 */
export const COUNTED_THREAD_SOURCES = {
  source: { not: Source.API },
} as const;
