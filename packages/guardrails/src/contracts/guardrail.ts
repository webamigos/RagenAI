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

/**
 * Which built-ins this build can actually run.
 *
 * Support for a built-in is **per key, not per kind**, and conflating the two
 * is a bug this file has now had in both directions. First
 * `SUPPORTED_COMBINATIONS` omitted `BUILT_IN`/`INPUT` entirely, so the seeded
 * `content-moderation` rule was discarded while the panel showed it enabled.
 * Adding the combination fixed that and created the mirror image:
 * `jailbreak-detection` is also `BUILT_IN`/`INPUT`, so it became "supported"
 * — kept by the resolver, matched by no branch of `evaluateInputStage`, and
 * enforced by nothing. Same silence, opposite cause.
 *
 * A kind × stage pair cannot express this, because two rules of the same kind
 * and stage differ in whether an evaluator exists for them. So the identifier
 * is the unit, and `evaluateInputStage` has exactly one branch per entry here.
 *
 * `jailbreak-detection` joined this list in Phase C2, in the same change that
 * gave it an evaluator — never before, or it reads as enabled and does
 * nothing; never after, or it is dropped while the panel says otherwise. Its
 * evaluator is the judge loop in `evaluator/policy.ts`: it is a *scored*
 * built-in, which is why it shares a branch with `LLM_POLICY` rather than
 * with `content-moderation`, whose provider returns a flag and not a number.
 */
export const EVALUABLE_BUILT_IN_KEYS = [
  'content-moderation',
  'jailbreak-detection',
] as const;

export function isEvaluableBuiltIn(key: string | null): boolean {
  return (
    key !== null && (EVALUABLE_BUILT_IN_KEYS as readonly string[]).includes(key)
  );
}

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

/**
 * What this build can **evaluate**, which is the default the resolver drops
 * against.
 *
 * `BUILT_IN`/`INPUT` is here as of Phase B, and leaving it out was a real bug
 * rather than a pending item. The two seeded detectors are `BUILT_IN`/`INPUT`,
 * so with only `PATTERN`/`INPUT` listed the runtime resolver discarded
 * `content-moderation` as an unsupported combination — an operator enabled
 * moderation in the panel, the panel showed it enabled, and nothing ran.
 * `guardrails:preflight` would have called that configuration reconciled.
 * That is the exact failure this whole spec exists to prevent, arriving
 * through the constant meant to prevent it.
 *
 * So the rule for editing this list: **add a combination in the same change
 * that teaches an evaluator to handle it, never before and never after.**
 * Before, and a rule is kept and silently does nothing; after, and a rule is
 * dropped while the panel says otherwise. `a-supported-combination-is-
 * evaluable` in the tests holds the seeded built-ins to it.
 *
 * `LLM_POLICY`/`INPUT` joins it in Phase C, in the change that adds
 * `evaluator/policy.ts` and the judge branch of `evaluateInputStage` — the
 * same rule, applied to the kind rather than to a key.
 */
export const SUPPORTED_COMBINATIONS: readonly GuardrailCombination[] =
  Object.freeze([
    Object.freeze({ kind: 'PATTERN', stage: 'INPUT' }),
    Object.freeze({ kind: 'BUILT_IN', stage: 'INPUT' }),
    Object.freeze({ kind: 'LLM_POLICY', stage: 'INPUT' }),
  ] as const);

/**
 * What an operator may **author**, which is a smaller set and not the same
 * question.
 *
 * A `BUILT_IN` is seeded, not created: it is identified by a `key` the code
 * knows, and a new one an operator typed would have no key and no detector
 * behind it — a rule that resolves, is kept, matches nothing, and reads as
 * enabled. So the admin form offers this list while the resolver drops
 * against the one above.
 *
 * The two were one constant until Phase B, when they stopped meaning the same
 * thing. Collapsing them again would reintroduce one of the two failures
 * described above, depending on which way it was collapsed.
 */
export const AUTHORABLE_COMBINATIONS: readonly GuardrailCombination[] =
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

/**
 * The two `SecurityEventType` members a guardrail hit is ever filed under.
 *
 * Here rather than in each app for the same reason `securityEventTypeFor` is:
 * `tests/architecture/guardrails-are-not-recopied.test.ts` forbids an app
 * naming either literal, because an app that can spell them is an app that can
 * decide between them — and two runtimes filing the same hit differently is
 * how the incidents page comes to under-report blocks from one surface.
 *
 * Reading is not filing, and the admin panel does need to name both: it counts
 * hits per rule and offers them as a filter. So the vocabulary is exported,
 * and the decision stays a function.
 *
 * Spelled as the Postgres enum spells them, and returned as string literals
 * rather than imported from a generated client — this package has no database,
 * and the members have existed in `SecurityEventType` since Phase A precisely
 * so every reader had them before a writer appeared.
 *
 * The constants are **not** named after the members they hold, which looks
 * like an oversight and is not: that guard matches source text, and an
 * identifier containing `GUARDRAIL_BLOCKED` fails it in an app exactly as the
 * literal would. Narrowing the pattern to quoted strings was the alternative,
 * and the test's own comment is against it — a negative match narrower than
 * the thing it forbids is the first shape in
 * `docs/lessons/three-shapes-of-a-test-that-guards-nothing.md`. So the names
 * are the thing that gives, and this paragraph is why nobody should rename
 * them back.
 */
export const BLOCKED_HIT_EVENT = 'GUARDRAIL_BLOCKED';
export const FLAGGED_HIT_EVENT = 'GUARDRAIL_FLAGGED';

export const GUARDRAIL_SECURITY_EVENT_TYPES = [
  BLOCKED_HIT_EVENT,
  FLAGGED_HIT_EVENT,
] as const;

export type GuardrailSecurityEventType =
  (typeof GUARDRAIL_SECURITY_EVENT_TYPES)[number];
