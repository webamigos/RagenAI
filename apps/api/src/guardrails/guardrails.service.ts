import { Injectable, Logger } from '@nestjs/common';
import { guardrailsDisabled, isOnPremise } from '@ragenai/env';
import {
  GUARDRAIL_CACHE_TTL_MS,
  GUARDRAIL_FAILURE_TTL_MS,
  hasTransformingRule,
  resolveGuardrails,
  type GuardrailAction,
  type GuardrailKind,
  type GuardrailOverride,
  type GuardrailRule,
  type GuardrailSeverity,
  type GuardrailStage,
  type ResolvedGuardrail,
} from '@ragenai/guardrails';

import { PrismaService } from '../prisma/prisma.service.js';

/**
 * The rules one organization is subject to, for the API runtime.
 *
 * Deliberately a second loader and not a second *resolution*: the resolution
 * is `resolveGuardrails`, a pure function in `@ragenai/guardrails`, so this
 * service and apps/web cannot disagree about what an organization's rule set
 * is. What differs is how a database is reached — Nest's `PrismaService` here,
 * the module singleton there — and that is the only thing this file adds.
 */

export type OrgGuardrails = {
  readonly input: readonly ResolvedGuardrail[];
  readonly output: readonly ResolvedGuardrail[];
  /** Whether any input rule rewrites the text rather than judging it. */
  readonly hasTransformingInputRule: boolean;
  /** True when the set is empty because a load failed, not because nothing is configured. */
  readonly degraded: boolean;
};

const NO_GUARDRAILS: OrgGuardrails = {
  input: [],
  output: [],
  hasTransformingInputRule: false,
  degraded: false,
};

type Row = {
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

function toRule(row: Row): GuardrailRule {
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

@Injectable()
export class GuardrailsService {
  private readonly logger = new Logger(GuardrailsService.name);
  private readonly cache = new Map<
    string,
    { value: OrgGuardrails; expiresAt: number }
  >();

  constructor(private readonly prisma: PrismaService) {}

  /** Test seam. Production has no reason to call this. */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * The rows this organization can be subject to, and nothing else.
   *
   * `organizationId: null` is a platform rule and applies to everyone. Both
   * halves are needed, which is why this is an `OR` — and why `Guardrail` is
   * deliberately absent from the tenant-scope guard's model list: the guard
   * cannot see an org id in this shape and would warn on the hottest query in
   * the product, every turn. A test asserts the shape instead.
   */
  static where(organizationId: string) {
    return { OR: [{ organizationId }, { organizationId: null }] };
  }

  async forOrganization(organizationId: string): Promise<OrgGuardrails> {
    // Before the cache and before the database: a service started with the
    // break-glass set evaluates nothing, and must not be kept from saying so
    // by an entry cached before the variable was set.
    if (guardrailsDisabled()) {
      return NO_GUARDRAILS;
    }

    const cached = this.cache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    try {
      const [rows, overrides] = await Promise.all([
        this.prisma.client.guardrail.findMany({
          where: GuardrailsService.where(organizationId),
        }),
        this.prisma.client.guardrailOrgOverride.findMany({
          where: { organizationId },
          include: { guardrail: { select: { publicId: true } } },
        }),
      ]);

      const resolution = resolveGuardrails({
        platformRules: rows
          .filter((row) => row.organizationId === null)
          .map(toRule),
        orgRules: rows.filter((row) => row.organizationId !== null).map(toRule),
        overrides: overrides.map((override): GuardrailOverride => ({
          guardrailPublicId: override.guardrail.publicId,
          organizationId,
          enabled: override.enabled,
          action: override.action,
          threshold: override.threshold,
          origin: override.origin,
        })),
        isOnPremise: isOnPremise(),
        // Left at the package default: this is a runtime, so the combinations
        // it may evaluate are exactly the ones the build ships. The admin
        // panel passes every combination because it reports what is stored.
      });

      // A dropped row reads as enabled in the panel and is enforced by
      // nothing. The panel reports what is stored; only the runtime knows what
      // it discarded, so only the runtime can say so.
      if (resolution.dropped.length > 0) {
        this.logger.warn(
          `Guardrail rows discarded for ${organizationId} and not enforced: ${resolution.dropped
            .map((drop) => `${drop.guardrailPublicId} (${drop.reason})`)
            .join(', ')}`,
        );
      }

      const enabled = resolution.rules.filter((rule) => rule.enabled);
      const atStage = (stage: 'INPUT' | 'OUTPUT') =>
        enabled.filter((rule) => rule.stage === stage || rule.stage === 'BOTH');
      const input = atStage('INPUT');

      const value: OrgGuardrails = {
        input,
        output: atStage('OUTPUT'),
        hasTransformingInputRule: hasTransformingRule(input),
        degraded: false,
      };

      this.cache.set(organizationId, {
        value,
        expiresAt: Date.now() + GUARDRAIL_CACHE_TTL_MS,
      });
      return value;
    } catch (err) {
      // Fail open, and say so in the log rather than through a security event:
      // the event writer inserts into the same database that just failed to
      // answer, so an event is the one alarm this failure would swallow.
      //
      // Fail closed was rejected — a blip would refuse every tenant's turn,
      // and the state this falls back to is the state every installation is in
      // today.
      this.logger.error(
        `Could not load guardrails for ${organizationId}; this turn runs unguarded`,
        err,
      );
      const value: OrgGuardrails = { ...NO_GUARDRAILS, degraded: true };
      this.cache.set(organizationId, {
        value,
        expiresAt: Date.now() + GUARDRAIL_FAILURE_TTL_MS,
      });
      return value;
    }
  }
}
