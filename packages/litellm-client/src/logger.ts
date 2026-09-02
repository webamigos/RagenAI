/**
 * The logging contract this package needs, and nothing more.
 *
 * The two existing copies of this client differ almost entirely in how they
 * log: apps/web passes Pino a context object first, apps/api's NestJS `Logger`
 * takes the message first. Naming the shape here and letting each app adapt is
 * what lets one implementation serve both — the same trade `packages/observability`
 * makes (ADR-28).
 *
 * Context-first, because that is the order the retry logic reads best in and
 * the one apps/web already used.
 */
export type LiteLLMLogger = {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
};

/** Used when a consumer supplies no logger — a proxy failure then goes unheard. */
export const NOOP_LOGGER: LiteLLMLogger = {
  warn: () => {},
  error: () => {},
};
