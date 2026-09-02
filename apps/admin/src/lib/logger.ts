/* eslint-disable no-console */

/**
 * The panel's logger, which is `console` with a shape.
 *
 * This app deliberately does not run OpenTelemetry — `src/instrumentation.node.ts`
 * is an explicit no-op — so `@ragenai/observability` would be the wrong
 * dependency here. What the panel needs is narrower: somewhere for a swallowed
 * LiteLLM failure to surface in the server output, instead of the silence the
 * inline `fetch` calls used to produce.
 *
 * The `no-console` rule is disabled once, here, rather than at each call site,
 * so there is a single place to change if this app ever grows real logging.
 *
 * Context first, matching Pino and `LiteLLMLogger`.
 */
export type AdminLogger = {
  warn(context: Record<string, unknown>, message: string): void;
  error(context: Record<string, unknown>, message: string): void;
};

export const logger: AdminLogger = {
  warn: (context, message) => console.warn(`[admin] ${message}`, context),
  error: (context, message) => console.error(`[admin] ${message}`, context),
};
