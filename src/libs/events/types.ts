/**
 * Typed registry of domain events Ragen exposes via its in-process bus.
 *
 * Every event is a string id → payload shape. Subscribers that register
 * for a given id receive that payload, fully typed. Adding a new event
 * is one line here plus any number of subscribers that want to react.
 *
 * Principles:
 * - Payloads carry identifiers only (ids, emails). Don't ship whole
 *   Prisma entities across the bus; subscribers can re-fetch if needed.
 * - Events describe *what already happened* (past tense), not requests.
 * - Subscribers must be safe to run in parallel and tolerate failures
 *   from siblings — the bus isolates errors between handlers.
 * - This bus is in-process only. Don't emit events that MUST reach
 *   every instance of a multi-instance deployment; use Temporal or a
 *   DB write instead.
 */
export type RagenEvents = {
  'user.emailVerified': {
    userId: string;
    email: string;
    name: string | null;
  };
};

export type RagenEventId = keyof RagenEvents;
