import {
  allOrNone,
  blankAsUndefined,
  fragments,
  httpUrl,
  parseEnv,
  requiredInDeployedEnvs,
} from '@ragenai/env';
import { z } from 'zod';

/**
 * apps/admin's environment contract (ADR-37).
 *
 * The last app without one. api, worker, mcp and web have validated their
 * configuration since ADR-37 landed; admin read fifteen variables off
 * `process.env` and checked none of them, which is why the Google sign-in
 * defect (#1115) had to be caught by a hand-written helper instead of by the
 * rule this package has exported all along.
 *
 * **This schema reports; it does not exit.** api and the worker call
 * `process.exit(1)` on a bad parse. This panel deliberately does not, and the
 * reason is in its own pages rather than in a convention: the proxy page
 * renders "not set" for the LiteLLM pair, `AlertStatus` renders "Nobody is
 * being alerted" for an unset `SECURITY_ALERT_EMAIL`, and Stripe features
 * degrade on their own. It is built to run partially configured and show an
 * operator what is missing. A process that exits shows nothing.
 *
 * Not exhaustive over every variable admin reads, and not meant to be.
 * `z.object()` strips an unmentioned key rather than rejecting it, so
 * validation passes and anything not listed stays readable on `process.env`,
 * which is where the un-migrated call sites read it. Add a variable when
 * getting it wrong should be reported at boot rather than discovered on the
 * page that needed it.
 */
export const adminEnvSchema = fragments.targetEnv
  .merge(fragments.database)
  .merge(fragments.litellm)
  .merge(fragments.tokenVault)
  .extend({
    /**
     * Google sign-in for the panel. Optional, and `apps/admin/.env.example`
     * ships both declared as `""` — so blank has to mean unset, or a copied
     * but unfilled env file reads as configured. The pair is `allOrNone`
     * below; see the rule for what half-configured used to do.
     */
    GOOGLE_CLIENT_ID: blankAsUndefined(z.string().optional()),
    GOOGLE_CLIENT_SECRET: blankAsUndefined(z.string().optional()),

    /**
     * Defaults to `webamigos.pl` in `lib/auth.ts`, which refuses every Google
     * sign-in on any install but ours. Left as a plain optional string: the
     * default belongs with the code that applies it, and overriding it is the
     * normal case for a self-hoster rather than an error.
     */
    ADMIN_ALLOWED_EMAIL_DOMAIN: blankAsUndefined(z.string().optional()),

    /** Billing. Absent means the Stripe-backed pages have nothing to show. */
    STRIPE_SECRET_KEY: blankAsUndefined(z.string().optional()),

    /**
     * Comma-separated recipients. Empty means security alerting is off — a
     * real configuration, and the one `AlertStatus` exists to make visible.
     */
    SECURITY_ALERT_EMAIL: blankAsUndefined(z.string().optional()),
    SECURITY_ALERT_SEVERITY: blankAsUndefined(z.string().optional()),

    /** Where an invitation email points. */
    RAGEN_APP_URL: blankAsUndefined(httpUrl().optional()),

    /** Shared secret for apps/web's internal endpoints. */
    INTERNAL_API_SECRET: blankAsUndefined(z.string().optional()),
  })
  .superRefine((env, ctx) => {
    /**
     * The defect #1115 fixed, expressed as the rule that already existed.
     *
     * Better Auth registers a provider it is given credentials for, and the
     * login page decides whether to offer the button. With one half set, the
     * panel showed "Sign in with Google" and clicking it failed at Google
     * with `invalid_client` — a Google error page for a Ragen
     * misconfiguration.
     */
    allOrNone(
      env,
      ctx,
      ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      'Google sign-in',
    );

    // Same shape as api and web: the vault client signs its requests, so a
    // URL without the secret produces 401s from the vault rather than an
    // obvious misconfiguration (ADR-32).
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

    requiredInDeployedEnvs(
      env,
      ctx,
      ['LITELLM_MASTER_KEY'],
      'the proxy page authenticates against it, and every model call does',
    );

    requiredInDeployedEnvs(
      env,
      ctx,
      ['INTERNAL_API_SECRET'],
      "apps/web's internal endpoints reject every invitation without it",
    );

    /**
     * An unrecognised threshold is worse than an absent one. `AlertStatus`
     * compares a lowercased `SECURITY_ALERT_SEVERITY` against exactly these
     * three, so `SECURITY_ALERT_SEVERITY=high` matches nothing and no alert
     * is ever sent — while the panel still reports that alerting is on,
     * because recipients are set. The page flags it; nothing said so at boot.
     *
     * Case and surrounding space are tolerated here because the runtime
     * tolerates them: it trims and lowercases before comparing.
     */
    const severity = env.SECURITY_ALERT_SEVERITY;
    if (typeof severity === 'string') {
      const normalized = severity.trim().toLowerCase();
      if (!SECURITY_ALERT_SEVERITIES.includes(normalized)) {
        ctx.addIssue({
          code: 'custom',
          message: `SECURITY_ALERT_SEVERITY is "${severity}", which matches no severity — alerts are compared against ${SECURITY_ALERT_SEVERITIES.join(', ')}, so none would ever be sent`,
          path: ['SECURITY_ALERT_SEVERITY'],
        });
      }
    }
  });

/** The thresholds `AlertStatus` recognises, in increasing order of severity. */
const SECURITY_ALERT_SEVERITIES: readonly string[] = [
  'info',
  'warn',
  'critical',
];

export type AdminEnv = z.infer<typeof adminEnvSchema>;

export const parseAdminEnv = (source?: Record<string, string | undefined>) =>
  parseEnv(adminEnvSchema, source);
