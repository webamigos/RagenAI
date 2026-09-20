import { guardrailsDisabled, isOnPremise } from '@ragenai/env';
import {
  resolveGuardrails,
  type GuardrailAction,
  type GuardrailKind,
  type GuardrailOverride,
  type GuardrailRule,
  type GuardrailSeverity,
  type GuardrailStage,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';
import db from '@ragenai/prisma-client';

import { logger } from '@/app/lib/utils/logger';

import {
  GUARDRAIL_CACHE_TTL_MS,
  GUARDRAIL_FAILURE_TTL_MS,
} from '../../constants';
import {
  NO_GUARDRAILS,
  type OrgGuardrails,
} from '../../contracts/guardrail-runtime.types';

/**
 * The rules one organization is subject to, resolved and cached.
 *
 * This is the only place `apps/web` reads the guardrail tables. `apps/api` has
 * its own loader for the same reason it has its own Prisma client, and the
 * *resolution* is shared — `resolveGuardrails` is a pure function in
 * `@ragenai/guardrails`, so the panel and the two runtimes cannot disagree
 * about what an organization's rule set is. Anything resembling a second
 * resolution in here would be the bug that function exists to prevent.
 *
 * **Nothing calls this yet.** B2 is the binding; B3 replaces
 * `moderateContent()` with it at three call sites. A loader with no caller
 * enforces nothing, and this repository has a rule about that — *a limit that
 * is computed is not a limit; a limit is a call site.* It is separated from B3
 * only because the two are separately reviewable, not because this is useful
 * on its own.
 */

type CacheEntry = {
  readonly value: OrgGuardrails;
  readonly expiresAt: number;
};

/**
 * Module scope, deliberately.
 *
 * One Next server process serves many organizations, so the cache is keyed by
 * organization and not by request. `React.cache` would be wrong here: it is
 * per-request, so it would make the loader read the database once per turn
 * instead of once per minute, and the 60 s window is the whole mitigation for
 * a database blip.
 */
const cache = new Map<string, CacheEntry>();

/** Test seam. Production has no reason to call this. */
export function clearGuardrailCache(): void {
  cache.clear();
}

/**
 * The rows this organization can be subject to, and nothing else.
 *
 * `organizationId: null` is a platform rule and applies to everyone; the
 * organization's own rules are its own. Both halves are needed, which is why
 * this is an `OR` and not a scope the tenant-scope guard can recognise — see
 * the spec's note on why `Guardrail` is deliberately absent from
 * `TENANT_SCOPED_MODELS`. A unit test asserts this shape, because it is the
 * one query in the product where the guard will not.
 */
export function guardrailWhere(organizationId: string) {
  return {
    OR: [{ organizationId }, { organizationId: null }],
  };
}

type GuardrailRow = {
  publicId: string;
  organizationId: string | null;
  key: string | null;
  name: string;
  description: string | null;
  kind: string;
  stage: string;
  action: string;
  enabled: boolean;
  severity: string;
  pattern: string | null;
  patternIsRegex: boolean;
  threshold: number | null;
};

function toRule(row: GuardrailRow): GuardrailRule {
  return {
    publicId: row.publicId,
    organizationId: row.organizationId,
    key: row.key,
    name: row.name,
    description: row.description,
    kind: row.kind as GuardrailKind,
    stage: row.stage as GuardrailStage,
    action: row.action as GuardrailAction,
    enabled: row.enabled,
    severity: row.severity as GuardrailSeverity,
    pattern: row.pattern,
    patternIsRegex: row.patternIsRegex,
    threshold: row.threshold,
  };
}

/**
 * Split the resolved set into the stages that read it.
 *
 * `BOTH` is shorthand for two stages rather than a third one, so a `BOTH` rule
 * appears in each list. A disabled rule is dropped here rather than being
 * carried with a flag: every consumer would have to remember to check it, and
 * the one that forgets enforces a rule an operator switched off.
 */
function shape(
  rules: readonly ResolvedGuardrail[],
): Pick<OrgGuardrails, 'input' | 'output' | 'hasTransformingInputRule'> {
  const enabled = rules.filter((rule) => rule.enabled);
  const atStage = (stage: 'INPUT' | 'OUTPUT') =>
    enabled.filter((rule) => rule.stage === stage || rule.stage === 'BOTH');

  const input = atStage('INPUT');

  return {
    input,
    output: atStage('OUTPUT'),
    hasTransformingInputRule: input.some((rule) => rule.action === 'MASK'),
  };
}

export async function getOrgGuardrailsQuery(
  organizationId: string,
): Promise<OrgGuardrails> {
  // Before the cache and before the database: a service started with the
  // break-glass set evaluates nothing, and must not be kept from saying so by
  // a cache entry loaded before it was set. Returning the empty set here means
  // no call site has to remember the variable exists.
  if (guardrailsDisabled()) {
    return NO_GUARDRAILS;
  }

  const cached = cache.get(organizationId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  try {
    const [rules, overrides] = await Promise.all([
      db.guardrail.findMany({ where: guardrailWhere(organizationId) }),
      db.guardrailOrgOverride.findMany({
        where: { organizationId },
        include: { guardrail: { select: { publicId: true } } },
      }),
    ]);

    const resolution = resolveGuardrails({
      platformRules: rules
        .filter((row) => row.organizationId === null)
        .map(toRule),
      orgRules: rules.filter((row) => row.organizationId !== null).map(toRule),
      overrides: overrides.map((override): GuardrailOverride => ({
        guardrailPublicId: override.guardrail.publicId,
        organizationId,
        enabled: override.enabled,
        action: override.action as GuardrailAction | null,
        threshold: override.threshold,
        origin: override.origin as GuardrailOverride['origin'],
      })),
      isOnPremise: isOnPremise(),
      // Left at the package default on purpose: this is the runtime, so the
      // combinations it can evaluate are exactly the ones the build ships.
      // The admin panel passes every combination because it reports what is
      // stored; a runtime that did the same would try to evaluate a rule it
      // has no evaluator for.
    });

    // A dropped row is a rule that reads as enabled in the panel and is
    // enforced by nothing — the failure this whole feature exists to prevent,
    // and until now it was returned in `dropped` and read by nobody. The
    // panel deliberately shows every combination because it reports what is
    // *stored*; only the runtime knows what it threw away, so only the
    // runtime can say so.
    if (resolution.dropped.length > 0) {
      logger.warn(
        { audit: true, organizationId, dropped: resolution.dropped },
        'Guardrail rows were discarded and will not be enforced',
      );
    }

    const value: OrgGuardrails = {
      ...shape(resolution.rules),
      degraded: false,
      dropped: resolution.dropped,
    };

    cache.set(organizationId, {
      value,
      expiresAt: Date.now() + GUARDRAIL_CACHE_TTL_MS,
    });
    return value;
  } catch (err) {
    // Fail open, and say so loudly in the log rather than through a security
    // event. `recordSecurityEvent` writes to `security_events` in the same
    // database that just failed to answer, so an event is the one alarm this
    // particular failure would swallow.
    //
    // Fail *closed* was rejected: a blip would take chat down for every
    // tenant, and the state this falls back to — no guardrails — is the state
    // every installation is in today.
    logger.error(
      { err, organizationId, audit: true },
      'Could not load guardrails; this turn runs unguarded',
    );

    const value: OrgGuardrails = { ...NO_GUARDRAILS, degraded: true };
    cache.set(organizationId, {
      value,
      expiresAt: Date.now() + GUARDRAIL_FAILURE_TTL_MS,
    });
    return value;
  }
}
