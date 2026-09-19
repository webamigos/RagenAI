/**
 * What a guardrail rule is, in one place that has no dependencies.
 *
 * The runtime evaluates these and `apps/admin` authors them, so the two must
 * not derive their own idea of what a rule can be. That is the failure the
 * feature-flag contracts were extracted to stop (ADR-33): three hand-copied
 * unions, each one typechecking perfectly against itself.
 *
 * Nothing here imports Prisma. The enum *names* match the Prisma enums by
 * construction — `tests/architecture` is the tripwire — but a package that
 * imported a generated client could not be read by `apps/api`, which compiles
 * to CommonJS and runs the output on plain node.
 */

export const GUARDRAIL_KINDS = ['BUILT_IN', 'PATTERN', 'LLM_POLICY'] as const;
export type GuardrailKind = (typeof GUARDRAIL_KINDS)[number];

export const GUARDRAIL_STAGES = ['INPUT', 'OUTPUT', 'BOTH'] as const;
export type GuardrailStage = (typeof GUARDRAIL_STAGES)[number];

export const GUARDRAIL_ACTIONS = ['BLOCK', 'MASK', 'LOG'] as const;
export type GuardrailAction = (typeof GUARDRAIL_ACTIONS)[number];

/**
 * Which actions each kind can actually carry out.
 *
 * `MASK` needs a span to replace. A built-in detector and a judge model both
 * return a verdict over the whole text and no span, so a masking rule on
 * either has nothing to cut out. Allowing it and quietly treating it as
 * `BLOCK` is the kind of thing found in production, months later, by someone
 * wondering why a rule they set to mask is refusing turns.
 */
export const ACTIONS_BY_KIND: Readonly<
  Record<GuardrailKind, readonly GuardrailAction[]>
> = Object.freeze({
  BUILT_IN: Object.freeze(['BLOCK', 'LOG'] as const),
  PATTERN: Object.freeze(['BLOCK', 'MASK', 'LOG'] as const),
  LLM_POLICY: Object.freeze(['BLOCK', 'LOG'] as const),
});

export function isActionValidForKind(
  kind: GuardrailKind,
  action: GuardrailAction,
): boolean {
  return ACTIONS_BY_KIND[kind].includes(action);
}

/**
 * The built-in detectors, by the key that identifies them in a row.
 *
 * A frozen array with labels beside it, exactly as `FEATURE_KEYS` /
 * `FEATURE_LABELS` are, so the admin panel and the runtime cannot disagree
 * about what `jailbreak-detection` is called on screen.
 */
export const BUILT_IN_GUARDRAIL_KEYS = [
  'content-moderation',
  'jailbreak-detection',
] as const;
export type BuiltInGuardrailKey = (typeof BUILT_IN_GUARDRAIL_KEYS)[number];

export const BUILT_IN_GUARDRAIL_LABELS: Readonly<
  Record<BuiltInGuardrailKey, string>
> = Object.freeze({
  'content-moderation': 'Content moderation',
  'jailbreak-detection': 'Jailbreak detection',
});

export const BUILT_IN_GUARDRAIL_DESCRIPTIONS: Readonly<
  Record<BuiltInGuardrailKey, string>
> = Object.freeze({
  'content-moderation':
    "The provider's moderation endpoint, over the user's message.",
  'jailbreak-detection':
    'A classifier scoring how much a message looks like an attempt to ' +
    'override the assistant’s instructions.',
});

export function isBuiltInGuardrailKey(
  value: string,
): value is BuiltInGuardrailKey {
  return (BUILT_IN_GUARDRAIL_KEYS as readonly string[]).includes(value);
}

/**
 * Which kind × stage combinations *this build* can evaluate.
 *
 * Phases C and D are unshipped, so a rule the panel happily accepts today
 * would be enforced by nothing. The admin form reads this and offers only what
 * is here; the resolver drops rows outside it, so an older service that meets
 * a row from a newer one evaluates it as "no verdict" rather than throwing.
 *
 * A single "not enforced yet" banner was the alternative, and it starts lying
 * the moment the first combination works — which is the release after this
 * one. This is a list precisely so that each entry can arrive on its own.
 *
 * **It answers what this package can evaluate, not what any app has wired up.**
 * The two are different questions and only the first belongs here. A rule kind
 * with no evaluator anywhere is a lie on the form — offering `LLM_POLICY`
 * before a judge exists promises a feature. A rule whose evaluator exists but
 * whose call site arrives in the next phase is an ordinary deployment state,
 * and it is what "Phase A ends with rules an operator can create and nothing
 * reading them" describes.
 *
 * So: `PATTERN`/`INPUT`, which `evaluator/pattern.ts` implements. `OUTPUT`
 * waits for the sliding-window transform in Phase D — evaluating a whole
 * string is not the same problem as evaluating a stream — `BUILT_IN` for the
 * detectors to be absorbed in B and C, and `LLM_POLICY` for the judge in C.
 */
export type GuardrailCombination = {
  kind: GuardrailKind;
  stage: Exclude<GuardrailStage, 'BOTH'>;
};

export const SUPPORTED_COMBINATIONS: readonly GuardrailCombination[] =
  Object.freeze([Object.freeze({ kind: 'PATTERN', stage: 'INPUT' })] as const);

/**
 * `BOTH` is shorthand for two stages, not a third one, so a rule carrying it
 * is supported only where both halves are.
 */
export function isCombinationSupported(
  kind: GuardrailKind,
  stage: GuardrailStage,
  supported: readonly GuardrailCombination[] = SUPPORTED_COMBINATIONS,
): boolean {
  const has = (s: Exclude<GuardrailStage, 'BOTH'>): boolean =>
    supported.some((c) => c.kind === kind && c.stage === s);

  if (stage === 'BOTH') {
    return has('INPUT') && has('OUTPUT');
  }
  return has(stage);
}

/**
 * Severity of the security event a hit writes. Mirrors the existing
 * `SecurityEventSeverity` union rather than introducing a parallel one.
 */
export const GUARDRAIL_SEVERITIES = ['info', 'warn', 'critical'] as const;
export type GuardrailSeverity = (typeof GUARDRAIL_SEVERITIES)[number];

/** A rule as the resolver receives it, shaped like the `Guardrail` row. */
export type GuardrailRule = {
  publicId: string;
  /** `null` marks a platform rule, applying to every organization. */
  organizationId: string | null;
  /** Set for `BUILT_IN` rules, `null` for operator-authored ones. */
  key: string | null;
  name: string;
  description?: string | null;
  kind: GuardrailKind;
  stage: GuardrailStage;
  action: GuardrailAction;
  enabled: boolean;
  severity: GuardrailSeverity;
  pattern?: string | null;
  patternIsRegex?: boolean;
  policy?: string | null;
  threshold?: number | null;
};

/** An adjustment to one platform rule for one organization. */
export type GuardrailOverride = {
  /** The `publicId` of the platform rule being adjusted. */
  guardrailPublicId: string;
  organizationId: string;
  /** Every field is tri-state: `null` or absent means inherit. */
  enabled?: boolean | null;
  action?: GuardrailAction | null;
  threshold?: number | null;
  /**
   * Set by the migration on the rows it seeds from
   * `OrganizationSettings.contentModerationEnabled`, and by nothing else.
   *
   * That column is read only when `IS_ON_PREMISE`, so in SaaS it is ignored
   * and the organization is moderated regardless of what it holds. An
   * override honoured everywhere would therefore turn moderation *off* for
   * tenants that have it on today — a silent downgrade, in the direction
   * nobody would choose. The resolver skips a marked override unless the
   * installation is on-premise.
   */
  origin?: GuardrailOverrideOrigin | null;
};

/**
 * Spelled exactly as the Postgres enum is, underscore and all, against this
 * package's kebab-case habit everywhere else.
 *
 * Those other unions never leave the process. This one is a stored column, and
 * a spelling that needs translating on the way in is a translation somebody
 * will forget — at which point the value is not recognised, the override is
 * treated as an ordinary administrator one, and it applies in SaaS too. That
 * is the silent downgrade this marking exists to prevent, reintroduced by the
 * marking itself. One spelling, no mapping.
 */
export const GUARDRAIL_OVERRIDE_ORIGINS = ['legacy_on_premise'] as const;
export type GuardrailOverrideOrigin =
  (typeof GUARDRAIL_OVERRIDE_ORIGINS)[number];
