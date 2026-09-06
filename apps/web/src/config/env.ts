import {
  allOrNone,
  fragments,
  parseEnv,
  requiredInDeployedEnvs,
} from '@ragenai/env';
import { z } from 'zod';

/**
 * apps/web's environment contract (ADR-37).
 *
 * The last app without one. apps/api, apps/worker and apps/mcp have validated
 * their configuration since ADR-37 landed; apps/web imported `@ragenai/env`
 * only for `isDeployedEnv()` and checked nothing, so a deployment with a
 * missing or malformed variable booted happily and failed later — at the
 * first chat, the first upload, or the first outgoing email, three layers
 * from the cause.
 *
 * That gap is why the demo-environment spec's "confirm a demo deploy fails
 * loudly rather than booting half-configured" could not be confirmed: for the
 * one app a visitor actually touches, it did not.
 *
 * **This schema reports; it does not exit.** apps/api and the worker call
 * `process.exit(1)` on a bad parse, and apps/web deliberately does not: it
 * serves the first-run setup page that tells an operator which variable to
 * fix. Exiting would remove the only screen that explains the failure. See
 * AGENTS.md, "Key Conventions".
 *
 * Not exhaustive over every variable apps/web reads, and not meant to be.
 * `z.object()` strips unmentioned keys rather than rejecting them, so
 * validation passes and anything not listed here stays readable on
 * `process.env`, which is where the un-migrated call sites read it. Add a
 * variable when getting it wrong should stop the app rather than surface
 * somewhere unrelated.
 *
 * ## Why `targetEnv` and not `targetEnvRequired`
 *
 * apps/api demands `TARGET_ENV`; this schema defaults it to `local`. The
 * difference is deliberate and it is about who runs the thing: AGENTS.md
 * documents a minimum `.env.local` for a fresh clone that does not list
 * `TARGET_ENV`, and apps/web is the app a self-hoster starts first. Making it
 * mandatory would turn every existing developer's working checkout into a
 * boot failure to close a hole that a Railway-side required variable closes
 * better.
 *
 * The cost is real and worth naming: an unset `TARGET_ENV` on a deployment
 * reads as `local`, so the `requiredInDeployedEnvs` rules below do not fire.
 * They are a second line, not the first. The variables a deployment cannot
 * work without at all are required unconditionally instead.
 */
export const webEnvSchema = fragments.targetEnv
  .merge(fragments.database)
  .merge(fragments.litellm)
  .merge(fragments.qdrant)
  .merge(fragments.observability)
  .merge(fragments.storage)
  .merge(fragments.tokenVault)
  .merge(fragments.encryption)
  .extend({
    /**
     * Optional here and required on a deployment by the refinement below.
     * AGENTS.md's documented minimum `.env.local` does not list it, and
     * turning a fresh clone's first `npm run web:dev` into a boot failure is
     * not what this contract is for.
     */
    BETTER_AUTH_SECRET: z.string().optional(),

    /**
     * Either of these two satisfies `getBaseUrl()`, so neither is required on
     * its own; the refinement below requires one of them on a deployment.
     * `NEXT_PUBLIC_APP_URL` is inlined at build time and cannot be set by an
     * operator running a prebuilt image, which is why `BETTER_AUTH_URL` is
     * the one to prefer.
     */
    BETTER_AUTH_URL: fragments.blankAsUndefined(fragments.httpUrl().optional()),
    NEXT_PUBLIC_APP_URL: fragments.blankAsUndefined(
      fragments.httpUrl().optional(),
    ),

    /** Encrypts organization API keys at rest. */
    SECRET_KEY: z.string().optional(),

    /** Signs the short-lived tokens apps/web mints for apps/api (ADR-21). */
    SESSION_AUTH_SECRET: z.string().optional(),
    /** Shared secret apps/api presents to apps/web's internal endpoints. */
    INTERNAL_API_SECRET: z.string().optional(),
    RAGEN_API_INTERNAL_URL: fragments.httpUrl().optional(),

    TEMPORAL_SERVER_ADDRESS: z.string().optional(),

    DEFAULT_MODEL: z.string().optional(),
    DEFAULT_MODEL_PROVIDER: z.string().optional(),

    /**
     * The build-time mirror of `TARGET_ENV`. Next inlines it, so a deployment
     * that sets only the runtime one gets a client bundle that still believes
     * it is local — the reason it is listed rather than assumed.
     */
    NEXT_PUBLIC_TARGET_ENV: fragments.blankAsUndefined(z.string().optional()),
  })
  .superRefine((env, ctx) => {
    requiredInDeployedEnvs(
      env,
      ctx,
      ['LITELLM_MASTER_KEY'],
      'every model call is authenticated against the proxy',
    );

    requiredInDeployedEnvs(
      env,
      ctx,
      ['SECRET_KEY'],
      'organization API keys are encrypted at rest with it',
    );

    requiredInDeployedEnvs(
      env,
      ctx,
      ['BETTER_AUTH_SECRET'],
      'Better Auth signs every session and every emailed link with it',
    );

    // Found missing on the demo environment the first time this ran: without
    // it apps/web cannot mint a token apps/api will accept, so every internal
    // call — documents, projects, threads — fails, and the app looks broken
    // rather than misconfigured.
    requiredInDeployedEnvs(
      env,
      ctx,
      ['SESSION_AUTH_SECRET'],
      'apps/api rejects every internal call without a token signed by it',
    );

    // `getBaseUrl()` throws when neither is set, and every caller is inside a
    // mailer that catches — so an invitation silently fails to arrive rather
    // than the deployment refusing to start. Catch it here instead.
    if (
      isDeployment(env.TARGET_ENV) &&
      !isSet(env.BETTER_AUTH_URL) &&
      !isSet(env.NEXT_PUBLIC_APP_URL)
    ) {
      ctx.addIssue({
        code: 'custom',
        message:
          'BETTER_AUTH_URL (or NEXT_PUBLIC_APP_URL) is required on a deployment — every link in every outgoing email resolves from it, and without one they are never sent',
        path: ['BETTER_AUTH_URL'],
      });
    }

    allOrNone(
      env,
      ctx,
      ['RAGEN_TOKEN_VAULT_URL', 'RAGEN_TOKEN_VAULT_SERVICE_SECRET'],
      'The token vault',
    );
    allOrNone(
      env,
      ctx,
      ['RAGEN_VAULT_URL', 'RAGEN_VAULT_SERVICE_SECRET'],
      'The vault',
    );
  });

const isSet = (value: unknown): boolean =>
  typeof value === 'string' && value.trim() !== '';

/**
 * Mirrors `requiredInDeployedEnvs`'s own reading of `TARGET_ENV` so the
 * cross-field rule above fires under exactly the same conditions as the
 * single-variable ones beside it.
 */
const isDeployment = (targetEnv: unknown): boolean =>
  typeof targetEnv === 'string' &&
  !['local', 'test', 'e2e', 'ci'].includes(targetEnv);

export type WebEnv = z.infer<typeof webEnvSchema>;

export const parseWebEnv = (source?: Record<string, string | undefined>) =>
  parseEnv(webEnvSchema, source);
