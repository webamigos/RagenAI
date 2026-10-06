import {
  blankAsUndefined,
  fragments,
  mcpServiceRules,
  mcpOAuthRules,
  httpUrl,
  parseEnv,
  requiredInDeployedEnvs,
} from '@ragenai/env';
import { z } from 'zod';

import { MCP_TRANSPORTS } from '../transport.js';

/**
 * apps/mcp's environment contract (ADR-37).
 *
 * Small, because this server is deliberately thin: it forwards to apps/api
 * and owns no business logic of its own (ADR-36).
 */
/** Where apps/api answers when nobody says otherwise. Only ever right locally. */
const LOCAL_RAGEN_API_URL = 'http://localhost:3001';
const DEFAULT_PORT = 3300;
/** What the server reports as its version when the build named none. */
export const DEV_SERVER_VERSION = 'dev';

/**
 * `targetEnvRequired`, not `targetEnv` — the same choice apps/worker makes,
 * and for a sharper reason here.
 *
 * `targetEnv` defaults to `local`, which reads as a convenience and acts as a
 * disabled guard: with `TARGET_ENV` unset on a deployment, the refinement
 * below never fires, `RAGEN_API_URL` falls through to localhost, and the
 * server boots clean while every tool call fails with a connection error —
 * exactly the failure the comment on that field describes. The variable that
 * decides whether a rule applies cannot be the one with a forgiving default.
 */

export const mcpEnvSchema = fragments.targetEnvRequired
  .merge(fragments.observability)
  .merge(fragments.mcpOAuth)
  .merge(fragments.authOrigin)
  .merge(fragments.mcpService)
  .extend({
    // `RAGEN_MCP_PORT` first, then `PORT` — see the transform below.
    //
    // `PORT` alone is what a single-container host injects, so it stays
    // supported. It is also a name every app in this monorepo reads, and the
    // root `.env.local` is shared by all of them: a `PORT=3001` meant for
    // apps/api followed this server onto apps/api's port, where it died with
    // EADDRINUSE. The app-specific name wins so one file can serve both.
    RAGEN_MCP_PORT: z.coerce.number().int().positive().max(65535).optional(),
    // `stdio` for a client that runs this server as a child process — see
    // ../transport.ts. Unset is the deployment's streamable-HTTP listener.
    RAGEN_MCP_TRANSPORT: blankAsUndefined(
      z.enum(MCP_TRANSPORTS).default('http'),
    ),
    // Over stdio there is no request to carry an Authorization header, so the
    // key comes from here — the same name and the same `sk-<keyId>.<secret>`
    // value the `ragen` CLI reads. Ignored over HTTP, where each caller sends
    // its own: one key in the environment of a shared server would make every
    // caller the same caller.
    SESSION_AUTH_SECRET: z.string().optional(),
    RAGEN_API_KEY: blankAsUndefined(z.string().trim().optional()),
    PORT: z.coerce.number().int().positive().max(65535).optional(),
    // Optional here rather than `.default(...)`, and defaulted in the
    // transform below, because a Zod default is applied *before* superRefine
    // runs — so `requiredInDeployedEnvs` would see the localhost fallback
    // already filled in and never fire. A deployed MCP server silently
    // pointed at localhost answers every tool call with a connection error.
    RAGEN_API_URL: httpUrl().optional(),
    // The release this image was built from, as `serverInfo.version` in the
    // MCP initialize response. semantic-release tags the repository and bumps
    // no package.json, so the tag is the only real version there is, and
    // `publish-images.yml` passes it in as a build argument. An image built
    // without one (compose, Railway) gets `ENV RAGEN_VERSION=` — an empty
    // string, hence blankAsUndefined.
    RAGEN_VERSION: blankAsUndefined(z.string().trim().optional()),
    // Railway's own build identifier, the fallback when no release tag was
    // passed — the same value instrument.ts reports as `service.version`.
    RAILWAY_GIT_COMMIT_SHA: blankAsUndefined(z.string().trim().optional()),
  })
  .superRefine((env, ctx) => {
    if (env.MCP_OAUTH_ENABLED === 'true' && !env.BETTER_AUTH_URL) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_URL'],
        message: 'BETTER_AUTH_URL is required for MCP OAuth',
      });
    }
    mcpServiceRules(env, ctx);
    mcpOAuthRules(env, ctx);
    requiredInDeployedEnvs(
      env,
      ctx,
      ['RAGEN_API_URL'],
      'the localhost fallback cannot reach apps/api from a deployment',
    );
  })
  .transform((env) => ({
    ...env,
    PORT: env.RAGEN_MCP_PORT ?? env.PORT ?? DEFAULT_PORT,
    RAGEN_API_URL: env.RAGEN_API_URL ?? LOCAL_RAGEN_API_URL,
    SERVER_VERSION:
      env.RAGEN_VERSION ?? env.RAILWAY_GIT_COMMIT_SHA ?? DEV_SERVER_VERSION,
  }));

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
