import {
  type GuardrailCombination,
  type GuardrailOverride,
  type GuardrailRule,
  isActionValidForKind,
  isCombinationSupported,
  SUPPORTED_COMBINATIONS,
} from '../contracts/guardrail';

/**
 * Which layer decided one value.
 *
 * Reported per field rather than per rule because an operator who can see that
 * a rule is on, but not whether that came from the platform or from their own
 * override, cannot tell what changing it will do. Same reasoning as
 * `FeatureSource`, and the admin panel renders it the same way.
 */
export type GuardrailValueSource =
  'org-override' | 'platform-rule' | 'org-rule';

export type ResolvedGuardrail = GuardrailRule & {
  /** True when this came from a platform rule rather than the org's own. */
  isPlatformRule: boolean;
  sources: {
    enabled: GuardrailValueSource;
    action: GuardrailValueSource;
    threshold: GuardrailValueSource;
  };
};

/**
 * Why a row the caller passed in is not in the result.
 *
 * Returned rather than logged because two of these are operator-visible
 * states, not faults: a rule whose kind this build cannot evaluate should say
 * so on the page, and an override pointing at the wrong rule should be
 * repairable by the person looking at it.
 */
export type GuardrailDropReason =
  | 'unsupported-combination'
  | 'override-targets-non-platform-rule'
  | 'override-for-unknown-rule'
  | 'override-action-invalid-for-kind'
  | 'override-threshold-out-of-range'
  | 'override-is-legacy-on-premise';

export type GuardrailDrop = {
  reason: GuardrailDropReason;
  /** The rule or the override's target, whichever was dropped. */
  guardrailPublicId: string;
};

export type GuardrailResolution = {
  rules: ResolvedGuardrail[];
  dropped: GuardrailDrop[];
};

export type GuardrailResolutionInput = {
  /** Every `Guardrail` row with `organizationId = null`. */
  platformRules: readonly GuardrailRule[];
  /** The organization's own rules. */
  orgRules?: readonly GuardrailRule[];
  /** The organization's overrides over platform rules. */
  overrides?: readonly GuardrailOverride[];
  /**
   * What this build can evaluate. Injectable so a test can state a combination
   * without waiting for the phase that ships it.
   */
  supportedCombinations?: readonly GuardrailCombination[];
  /**
   * `IS_ON_PREMISE`. Gates the overrides the migration seeded from
   * `OrganizationSettings.contentModerationEnabled`, which is a column read
   * only on-premise — see `GuardrailOverride.origin`.
   */
  isOnPremise?: boolean;
};

/**
 * Resolve the rules one organization is actually subject to.
 *
 * A pure function, so it is the same answer in the chain, in the admin panel
 * and in a test. The precedence is short and has to stay that way: an
 * organization's own rule is its own; a platform rule is the platform's,
 * adjusted by an override where the organization set one.
 *
 * Platform and organization rules are unioned, not merged. They cannot collide
 * on `key`, because `@@unique([organizationId, key])` plus the partial index
 * on platform rows means one built-in key appears at most once per layer — and
 * a built-in an organization has its own row for is a deliberate replacement,
 * which the caller sees as two rules with one key and can render as such.
 */
export function resolveGuardrails(
  input: GuardrailResolutionInput,
): GuardrailResolution {
  const supported = input.supportedCombinations ?? SUPPORTED_COMBINATIONS;
  const dropped: GuardrailDrop[] = [];

  const platformRules = input.platformRules.filter(
    (rule) => rule.organizationId === null,
  );
  const platformIds = new Set(platformRules.map((r) => r.publicId));

  // Overrides are validated before they are applied, so an incoherent one
  // cannot reach a rule. The admin action refuses to create these; this is the
  // second half of the belt and braces, for a row written before that check
  // existed or by hand.
  const overridesByRule = new Map<string, GuardrailOverride>();
  for (const override of input.overrides ?? []) {
    const target = override.guardrailPublicId;

    if (!platformIds.has(target)) {
      // Either the rule is gone, or it belongs to one organization and this
      // override would splice it into another's set.
      dropped.push({
        reason: (input.platformRules.some((r) => r.publicId === target) ||
        (input.orgRules ?? []).some((r) => r.publicId === target)
          ? 'override-targets-non-platform-rule'
          : 'override-for-unknown-rule') satisfies GuardrailDropReason,
        guardrailPublicId: target,
      });
      continue;
    }

    if (override.origin === 'legacy-on-premise' && input.isOnPremise !== true) {
      dropped.push({
        reason: 'override-is-legacy-on-premise',
        guardrailPublicId: target,
      });
      continue;
    }

    overridesByRule.set(target, override);
  }

  const out: ResolvedGuardrail[] = [];

  for (const rule of platformRules) {
    if (!isCombinationSupported(rule.kind, rule.stage, supported)) {
      dropped.push({
        reason: 'unsupported-combination',
        guardrailPublicId: rule.publicId,
      });
      continue;
    }
    out.push(applyOverride(rule, overridesByRule.get(rule.publicId), dropped));
  }

  for (const rule of input.orgRules ?? []) {
    if (!isCombinationSupported(rule.kind, rule.stage, supported)) {
      dropped.push({
        reason: 'unsupported-combination',
        guardrailPublicId: rule.publicId,
      });
      continue;
    }
    out.push({
      ...rule,
      isPlatformRule: false,
      sources: {
        enabled: 'org-rule',
        action: 'org-rule',
        threshold: 'org-rule',
      },
    });
  }

  return { rules: out, dropped };
}

function applyOverride(
  rule: GuardrailRule,
  override: GuardrailOverride | undefined,
  dropped: GuardrailDrop[],
): ResolvedGuardrail {
  let enabled = rule.enabled;
  let action = rule.action;
  let threshold = rule.threshold ?? null;
  const sources: ResolvedGuardrail['sources'] = {
    enabled: 'platform-rule',
    action: 'platform-rule',
    threshold: 'platform-rule',
  };

  if (override) {
    // `null` is "inherit" at every field, so only an explicit value stops the
    // walk — checking for the literal rather than truthiness is what lets an
    // override turn a rule off against a platform rule that has it on.
    if (override.enabled === true || override.enabled === false) {
      enabled = override.enabled;
      sources.enabled = 'org-override';
    }

    if (override.action != null) {
      if (isActionValidForKind(rule.kind, override.action)) {
        action = override.action;
        sources.action = 'org-override';
      } else {
        // `MASK` on a built-in or a policy is the case this catches: neither
        // returns a span, so there is nothing to replace. Falling back to the
        // rule's own action is the conservative answer — the alternative,
        // dropping the rule, would turn a bad override into no protection.
        dropped.push({
          reason: 'override-action-invalid-for-kind',
          guardrailPublicId: rule.publicId,
        });
      }
    }

    if (override.threshold != null) {
      if (isThresholdInRange(override.threshold)) {
        threshold = override.threshold;
        sources.threshold = 'org-override';
      } else {
        dropped.push({
          reason: 'override-threshold-out-of-range',
          guardrailPublicId: rule.publicId,
        });
      }
    }
  }

  return { ...rule, enabled, action, threshold, isPlatformRule: true, sources };
}

function isThresholdInRange(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/** The rules that will actually run: resolved, and switched on. */
export function activeGuardrails(
  resolution: GuardrailResolution,
): ResolvedGuardrail[] {
  return resolution.rules.filter((rule) => rule.enabled);
}

/** The active rules for one stage. `BOTH` counts for each. */
export function guardrailsForStage(
  resolution: GuardrailResolution,
  stage: 'INPUT' | 'OUTPUT',
): ResolvedGuardrail[] {
  return activeGuardrails(resolution).filter(
    (rule) => rule.stage === stage || rule.stage === 'BOTH',
  );
}

/**
 * Whether this rule set forces the input stage to block before
 * `rephraseAndExpand` runs.
 *
 * Moderation runs concurrently with the rephrase today because it returns a
 * verdict: the text it read is the text that moves on. `MASK` rewrites, so a
 * masking rule has to finish before anything downstream reads the input, or
 * the rephrase — and the retrieval query built from it — sees the original
 * while the model sees the mask. Asked of the resolved set, once per turn,
 * rather than per message: an organization with no masking rule keeps the
 * concurrency it has today.
 */
export function inputStageMustBlock(resolution: GuardrailResolution): boolean {
  return guardrailsForStage(resolution, 'INPUT').some(
    (rule) => rule.action === 'MASK',
  );
}
