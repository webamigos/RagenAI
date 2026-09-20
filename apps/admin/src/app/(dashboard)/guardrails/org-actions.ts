'use server';

import { isOnPremise } from '@ragenai/env';
import {
  ACTIONS_BY_KIND,
  GUARDRAIL_ACTIONS,
  isActionValidForKind,
  isScoredRule,
  isThresholdInRange,
  resolveGuardrails,
  type GuardrailAction,
  type GuardrailKind,
  type GuardrailOverride,
  type GuardrailRule,
  type GuardrailSeverity,
  type GuardrailStage,
  type GuardrailValueSource,
} from '@ragenai/guardrails';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';

const REVALIDATE_PATH = '/guardrails';

export type OrgGuardrailRow = {
  publicId: string;
  key: string | null;
  name: string;
  kind: GuardrailKind;
  stage: GuardrailStage;
  /** After the override, if one applied. */
  enabled: boolean;
  action: GuardrailAction;
  /**
   * After the override, and `null` when the rule names none — which is what
   * makes the judge's default apply. Only meaningful on a scored rule.
   */
  threshold: number | null;
  severity: GuardrailSeverity;
  isPlatformRule: boolean;
  /** Which layer decided each value, so the page can say why. */
  sources: {
    enabled: GuardrailValueSource;
    action: GuardrailValueSource;
    threshold: GuardrailValueSource;
  };
  /** The override row as stored, whether or not it applied. */
  override: {
    enabled: boolean | null;
    action: GuardrailAction | null;
    threshold: number | null;
    /**
     * Set only on rows the migration seeded. Present here because a row that
     * exists and does nothing still has to be visible: an operator reading
     * "moderation off" while the installation moderates is the exact gap
     * between the screen and the system that this marking was added to close.
     */
    isLegacyOnPremise: boolean;
  } | null;
};

export type OrgGuardrailsView = {
  rules: OrgGuardrailRow[];
  /**
   * Whether this installation honours a `legacy_on_premise` override.
   *
   * The page needs it to explain a row it is showing as inert, rather than
   * quietly rendering the inherited value and leaving the row invisible.
   */
  isOnPremiseInstallation: boolean;
};

function toRule(row: {
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
}): GuardrailRule {
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
 * What one organization is actually subject to, and why.
 *
 * The resolution itself is the package's pure function, so this page and the
 * chain cannot disagree about what an organization's rule set is — which is
 * the whole reason it is a pure function.
 */
export async function getOrgGuardrailsAction(
  organizationId: string,
): Promise<OrgGuardrailsView> {
  await requireAdmin();

  const [platform, own, overrides] = await Promise.all([
    prisma.guardrail.findMany({ where: { organizationId: null } }),
    prisma.guardrail.findMany({ where: { organizationId } }),
    prisma.guardrailOrgOverride.findMany({
      where: { organizationId },
      include: { guardrail: { select: { publicId: true } } },
    }),
  ]);

  const asOverrides: GuardrailOverride[] = overrides.map((o) => ({
    guardrailPublicId: o.guardrail.publicId,
    organizationId,
    enabled: o.enabled,
    action: o.action as GuardrailAction | null,
    threshold: o.threshold,
    origin: o.origin as GuardrailOverride['origin'],
  }));

  const onPremise = isOnPremise();

  const resolution = resolveGuardrails({
    platformRules: platform.map(toRule),
    orgRules: own.map(toRule),
    overrides: asOverrides,
    isOnPremise: onPremise,
    // Every combination, because this page reports what is stored rather than
    // what the running build evaluates. A rule the build cannot evaluate is
    // still a rule an operator configured, and hiding it here would make the
    // per-organization view disagree with the platform list on the same page.
    supportedCombinations: platform.concat(own).flatMap((r) =>
      r.stage === 'BOTH'
        ? [
            { kind: r.kind as GuardrailKind, stage: 'INPUT' as const },
            { kind: r.kind as GuardrailKind, stage: 'OUTPUT' as const },
          ]
        : [
            {
              kind: r.kind as GuardrailKind,
              stage: r.stage as 'INPUT' | 'OUTPUT',
            },
          ],
    ),
  });

  const storedByRule = new Map(overrides.map((o) => [o.guardrail.publicId, o]));

  return {
    isOnPremiseInstallation: onPremise,
    rules: resolution.rules.map((rule) => {
      const stored = storedByRule.get(rule.publicId);
      return {
        publicId: rule.publicId,
        key: rule.key,
        name: rule.name,
        kind: rule.kind,
        stage: rule.stage,
        enabled: rule.enabled,
        action: rule.action,
        threshold: rule.threshold ?? null,
        severity: rule.severity,
        isPlatformRule: rule.isPlatformRule,
        sources: rule.sources,
        override: stored
          ? {
              enabled: stored.enabled,
              action: stored.action as GuardrailAction | null,
              threshold: stored.threshold,
              isLegacyOnPremise: stored.origin === 'legacy_on_premise',
            }
          : null,
      };
    }),
  };
}

export type OverrideInput = {
  /** `null` means inherit, which is the point of the tri-state. */
  enabled: boolean | null;
  /**
   * What the rule does when it fires, for this organization alone.
   *
   * Optional, like `threshold` below, because a tab open from before C4b
   * sends `enabled` alone — and "inherit the other two" is the honest reading
   * of what that meant. The schema agrees, so the two halves of this contract
   * cannot drift.
   *
   * The one an organization is most likely to want: "keep the platform's rule,
   * but only log it for us" is the whole reason an override exists. The
   * resolver has honoured this since Phase A and nothing could write it.
   */
  action?: GuardrailAction | null;
  /**
   * The score at which a scored rule fires, for this organization alone.
   *
   * Meaningless on anything else, and refused there rather than stored — see
   * `isScoredRule`.
   */
  threshold?: number | null;
};

/**
 * The input as it arrives, which is whatever JSON reached a Server Action.
 *
 * `OverrideInput` is a compile-time shape and this action is called from a
 * client component, so a stale tab or a hand-made request can send `{}` or a
 * string. A non-null, non-boolean value passes the `=== null` check and
 * reaches Prisma, which rejects it by throwing — escaping the declared
 * `OverrideResult` instead of coming back as a refusal. A missing value would
 * also not be read as inherit, which is what its absence means.
 *
 * All three fields are `nullish` rather than required, so a tab open from
 * before C4b — which sends `enabled` alone — reads as "inherit the other two"
 * rather than failing to parse. That is the honest reading of what it meant.
 */
const overrideInputSchema = z.object({
  enabled: z
    .boolean()
    .nullish()
    .transform((value) => value ?? null),
  action: z
    .enum(GUARDRAIL_ACTIONS)
    .nullish()
    .transform((value) => value ?? null),
  threshold: z
    .number()
    // Range here as well as against the rule below, so a value outside 0–1 is
    // refused with a message rather than stored and then dropped at read time
    // by a resolver whose answer to a bad value is to ignore it and carry on.
    .refine(isThresholdInRange, 'A threshold is a score between 0 and 1.')
    .nullish()
    .transform((value) => value ?? null),
});

export type OverrideResult = { ok: true } | { ok: false; message: string };

/**
 * Set, change or clear one organization's override of a platform rule.
 *
 * An override an administrator writes here carries **no** `origin`. Only the
 * migration marks a row, and only a marked row is gated on the installation
 * being on-premise — so anything set from this page applies everywhere, which
 * is what an operator setting it expects.
 */
export async function setGuardrailOverrideAction(
  organizationId: string,
  guardrailPublicId: string,
  input: OverrideInput,
): Promise<OverrideResult> {
  const admin = await requireAdmin();

  const parsed = overrideInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message:
        parsed.error.issues[0]?.message ??
        'An override is either set, or inherited.',
    };
  }
  const { enabled, action, threshold } = parsed.data;

  const rule = await prisma.guardrail.findFirst({
    where: { publicId: guardrailPublicId, organizationId: null },
  });
  if (!rule) {
    // An override whose target is not a platform rule would splice one
    // organization's private rule into another's set. The resolver drops one
    // if it exists anyway; this is the half that stops it being written.
    return {
      ok: false,
      message: 'Only a platform rule can be overridden for an organization.',
    };
  }

  const kind = rule.kind as GuardrailKind;

  // Refused rather than stored, though the resolver would also catch it. Its
  // answer to an incoherent override is to keep the rule's own action and
  // file `override-action-invalid-for-kind` — correct at read time, and
  // useless here: the save would report success and the choice would never
  // apply. `MASK` on a built-in or a policy is the case this catches, because
  // neither returns a span to replace.
  if (action !== null && !isActionValidForKind(kind, action)) {
    return {
      ok: false,
      message:
        `${rule.name} cannot ${action}. It can ` +
        `${ACTIONS_BY_KIND[kind].join(' or ')}.`,
    };
  }

  // A threshold on a rule whose verdict is not a score is a value nothing
  // reads. Refused for the same reason the platform form offers no field for
  // one: a number an operator sets and believes they have tuned.
  if (threshold !== null && !isScoredRule({ kind, key: rule.key })) {
    return {
      ok: false,
      message:
        `${rule.name} is not scored, so it has no threshold. Only a policy ` +
        'rule or a detector judged by a model does.',
    };
  }

  const existing = await prisma.guardrailOrgOverride.findFirst({
    where: { guardrailId: rule.id, organizationId },
  });

  // **The row goes when *all three* are inherited, not when `enabled` is.**
  //
  // Inherit means no row rather than a row full of nulls — a row that decides
  // nothing is a row somebody has to interpret later — and that was a single
  // condition for as long as there was a single field. With three, deleting on
  // `enabled === null` alone would discard an organization's tuned threshold
  // the first time anybody set its enabled state back to inherit, from a
  // control that says nothing about thresholds.
  const inheritsEverything =
    enabled === null && action === null && threshold === null;

  if (inheritsEverything) {
    if (existing) {
      await prisma.guardrailOrgOverride.delete({ where: { id: existing.id } });
    }
  } else if (existing) {
    await prisma.guardrailOrgOverride.update({
      where: { id: existing.id },
      // Clearing `origin` is deliberate: an administrator touching a seeded
      // row is making it their own decision, and it should then apply the way
      // every other override does.
      data: { enabled, action, threshold, origin: null },
    });
  } else {
    await prisma.guardrailOrgOverride.create({
      data: {
        guardrailId: rule.id,
        organizationId,
        enabled,
        action,
        threshold,
      },
    });
  }

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.guardrailOverrideChanged,
    entityType: 'guardrail',
    entityId: guardrailPublicId,
    organizationId,
    before: {
      enabled: existing?.enabled ?? null,
      action: existing?.action ?? null,
      threshold: existing?.threshold ?? null,
    },
    after: { enabled, action, threshold },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}
