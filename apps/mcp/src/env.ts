import { fragments, httpUrl, parseEnv } from '@ragenai/env';
import { z } from 'zod';

/**
 * apps/mcp's environment contract (ADR-37).
 *
 * Small, because this server is deliberately thin: it forwards to apps/api
 * and owns no business logic of its own (ADR-36).
 */
export const mcpEnvSchema = fragments.targetEnv
  .merge(fragments.observability)
  .extend({
    PORT: z.coerce.number().int().positive().default(3300),
    RAGEN_API_URL: httpUrl().default('http://localhost:3001'),
  });

export type McpEnv = z.infer<typeof mcpEnvSchema>;

let cached: McpEnv | undefined;

/**
 * The validated environment, parsed on first use and reused after.
 *
 * Lazy and throwing rather than parsed-and-exited at module scope, which is
 * the obvious shape and the wrong one: this module is imported by the API
 * client, the API client is imported by its tests, and a module-scope
 * `process.exit` would take a whole Jest run down with it — from an
 * unrelated variable, with no failing assertion to explain why. A throw is
 * catchable, reportable, and still fatal at boot, which is where index.ts
 * turns it back into an exit.
 */
export function getEnv(): McpEnv {
  if (!cached) {
    const result = parseEnv(mcpEnvSchema);
    if (!result.ok) {
      throw new Error(result.report);
    }
    cached = result.env;
  }
  return cached;
}

/** Test seam: forget the parsed environment so the next call re-reads it. */
export function resetEnvCache(): void {
  cached = undefined;
}
