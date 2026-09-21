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

/**
 * The built-ins a judge model scores 0–1, rather than a provider flagging.
 *
 * **Support is per key here for the same reason it is in
 * `EVALUABLE_BUILT_IN_KEYS`**, and conflating the two has already been a bug
 * in this file in both directions. `content-moderation` is a `BUILT_IN` too,
 * and its provider answers with a flag: a threshold on it would be a field
 * that changes nothing, offered on a form, next to a number an operator would
 * reasonably believe they had tuned.
 *
 * A kind × key pair cannot be inferred from the kind, so the identifier is the
 * unit — the same shape, and the same argument, as the evaluable list above.
 */
export const SCORED_BUILT_IN_KEYS = ['jailbreak-detection'] as const;

/**
 * Whether this rule's verdict is a **score**, and therefore whether its
 * `threshold` means anything.
 *
 * The authoring-side half of `isJudgedRule`, which is a package-only symbol an
 * app may not import — a binding that could ask "is this judged" is a binding
 * that could write the loop again. This asks the narrower question a form
 * needs: should there be a threshold field at all.
 *
 * The two are **not** two readings of the same thing. `isJudgedRule` is the
 * stricter one: it additionally requires an `LLM_POLICY` to carry prose,
 * because a judge cannot score a message against nothing. A rule being drafted
 * has no prose yet and still needs its threshold field, so the form would be
 * empty exactly while it is being filled in. `isJudgedRule` is defined in
 * terms of this function rather than beside it, so the runtime and the panel
 * cannot come to disagree about which rules are scored.
 */
export function isScoredRule(rule: {
  kind: GuardrailKind;
  key?: string | null;
}): boolean {
  if (rule.kind === 'LLM_POLICY') {
    return true;
  }
  return (
    rule.kind === 'BUILT_IN' &&
    rule.key != null &&
    (SCORED_BUILT_IN_KEYS as readonly string[]).includes(rule.key)
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
 * A rule the panel accepts and nothing evaluates is enforced by nothing, and
 * looks from every screen exactly like one that works. The admin form reads
 * this and offers only what is here; the resolver drops rows outside it, so an
 * older service that meets a row from a newer one evaluates it as "no verdict"
 * rather than throwing — which is what makes a rolling deploy safe.
 *
 * A single "not enforced yet" banner was the alternative, and it would have
 * started lying the moment the first combination worked. A list is what let
 * each entry arrive on its own, across four phases.
 *
 * **It answers what this package can evaluate, not what any app has wired up.**
 * The two are different questions and only the first belongs here. A rule kind
 * with no evaluator anywhere is a lie on the form — offering `LLM_POLICY`
 * before a judge exists promises a feature. A rule whose evaluator exists but
 * whose call site arrives in the next phase is an ordinary deployment state,
 * and it is what "Phase A ends with rules an operator can create and nothing
 * reading them" describes.
 *
 * Every combination below now has an evaluator, and each arrived with one:
 * `PATTERN`/`INPUT` is `evaluator/pattern.ts`, `BUILT_IN`/`INPUT` the
 * moderation branch of `evaluator/input-stage.ts`, `LLM_POLICY`/`INPUT` the
 * judge, and the two `OUTPUT` entries have *two* — `createOutputStage` for a
 * stream and `evaluateOutputText` for an answer a judge has to read whole,
 * because evaluating a complete string is not the same problem as evaluating
 * a stream.
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
    // D4, and the phase's only switch. Everything D1–D3 built resolved to
    // nothing until these two lines: the resolver drops a combination it does
    // not find here, so an output rule could be written, listed and enabled
    // and still be dropped before any evaluator saw it.
    //
    // Added last on purpose, and after *every* surface was covered rather
    // than after the first one. D1c found three call sites reading a chain's
    // text through an accessor the funnel never touched; opening the stage
    // then would have enforced an output rule in the panel and the widget and
    // nowhere else, which is the failure this constant exists to prevent
    // arriving through the constant itself — as it already did once in Phase
    // B.
    //
    // No `BUILT_IN`/`OUTPUT`: both seeded detectors read the *user's*
    // message. `content-moderation` asks a provider endpoint about it and
    // `jailbreak-detection` scores an attempt to override instructions, and
    // neither is a question about an answer. A built-in that belongs on the
    // output side would arrive with its own evaluator and its own key.
    Object.freeze({ kind: 'PATTERN', stage: 'OUTPUT' }),
    Object.freeze({ kind: 'LLM_POLICY', stage: 'OUTPUT' }),
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
 *
 * `LLM_POLICY`/`INPUT` joins in Phase C3, and the gap between it becoming
 * *supported* in C1 and *authorable* here is the point rather than a delay.
 * A judge existed from C1, so the resolver was right to keep such a row; the
 * form had no field for the prose, so a rule authored through this panel
 * would have been written with no `policy` — and `hasEvaluablePolicy` drops
 * exactly that row, leaving a rule the page shows as enabled and the runtime
 * never runs. The field and the entry arrive together, which is the same rule
 * `SUPPORTED_COMBINATIONS` states for evaluators, applied to authoring.
 */
export const AUTHORABLE_COMBINATIONS: readonly GuardrailCombination[] =
  Object.freeze([
    Object.freeze({ kind: 'PATTERN', stage: 'INPUT' }),
    Object.freeze({ kind: 'LLM_POLICY', stage: 'INPUT' }),
    // Authorable in the same change that makes them evaluable, because for
    // these two the gap would be the harmful direction: a stage the runtime
    // enforces and the form does not offer is a capability nobody can reach,
    // and the reverse — offered and unenforced — is what the split between
    // these lists exists to prevent. `isCombinationSupported` derives `BOTH`
    // from the pair, so a rule running at both stages becomes authorable here
    // too, for these kinds and not for `BUILT_IN`.
    Object.freeze({ kind: 'PATTERN', stage: 'OUTPUT' }),
    Object.freeze({ kind: 'LLM_POLICY', stage: 'OUTPUT' }),
  ] as const);

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
 * How much of an answer the output funnel holds back, in characters.
 *
 * Two things depend on this number and they must be the same number. The
 * funnel holds the last `OUTPUT_WINDOW_CHARS` characters so a match spanning a
 * chunk boundary is still caught; `validatePatternShape` refuses to save an
 * output pattern whose match can be wider than that, because such a rule would
 * have its prefix released before the match completed and would then be
 * enforced by nothing.
 *
 * In `contracts` rather than beside either of them, and for the reason
 * `DEFAULT_POLICY_THRESHOLD` moved here in C3: this entry point is the only
 * one a `'use client'` component may import — the barrel re-exports the ReDoS
 * probe and its `node:worker_threads` — so a rule form that could not reach
 * this number would write its own copy of 256 into a help string, and the
 * sentence explaining the refusal would be free to drift from the refusal.
 */
export const OUTPUT_WINDOW_CHARS = 256;

/**
 * What is stored in place of an answer an `OUTPUT` rule refused.
 *
 * The withheld text is never stored — that is the whole point of the rule —
 * and an empty assistant message would read as a bug rather than a decision.
 *
 * One sentence for both runtimes, because both persist it: `apps/web` writes
 * it to a thread and `apps/api` to an API thread, and the same refusal spelled
 * two ways is two products. English, and deliberately not the only thing a
 * reader sees: `apps/web`'s panel renders
 * `assistant.chat.guardrail-blocked-answer` in their own language off the
 * message's `guardrailBlocked` marker, because neither `/api/threads` nor the
 * public API has a locale to translate with. What is stored is what an export
 * or an API read gets, which is a sentence rather than a blank.
 */
export const OUTPUT_GUARDRAIL_REFUSAL =
  "The answer was withheld because it matched a rule set by your organization's administrator.";

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

/**
 * The score at which a policy counts as matched, when the rule names none.
 *
 * 0.7, the jailbreak classifier's `DEFAULT_THRESHOLD`, so a built-in absorbed
 * into the judge loop keeps the sensitivity it shipped with rather than
 * acquiring a new one in the change that moved it.
 *
 * **In the contracts rather than beside the judge, as of C3**, and the move is
 * not tidying. `contracts` is the only entry point a `'use client'` component
 * may import — the root barrel re-exports the ReDoS probe and its
 * `node:worker_threads` — so a rule form that could not reach this number
 * would have written `0.7` into a placeholder. `policyThresholdFor` is a
 * package-only symbol precisely because a second copy of that number is a rule
 * more sensitive on one surface than another, and a form is a surface. The
 * judge re-exports it, so there is still one definition.
 */
export const DEFAULT_POLICY_THRESHOLD = 0.7;

/**
 * How many operator-authored policy rules may run on one stage, per
 * organization.
 *
 * Policy rules on a stage run concurrently, so latency stays at the slowest
 * rather than the sum — but **spend is the sum**, and it scales with the rule
 * count while nothing on screen says so. Three to begin with.
 *
 * Here for the same reason as the threshold above: the rule form states the
 * cap where an operator meets it rather than in a runbook, and a form cannot
 * import the judge. It is enforced in the loop, not at authoring time — an
 * authoring check is one a seed, a migration or a hand-made request walks
 * past, and the thing being bounded is a bill.
 */
export const MAX_ACTIVE_LLM_POLICIES = 3;

/**
 * Whether a threshold is a score at all.
 *
 * One definition, read by the resolver when it validates an override, by the
 * admin panel when it saves a rule, and by nothing else. It was private to the
 * resolver until C3 made thresholds authorable, and a second copy in the
 * authoring path is how a rule gets written that the resolver then refuses —
 * visible to nobody, because the row is simply dropped.
 */
export function isThresholdInRange(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * The sentence the rule form puts next to the policy field.
 *
 * Here so the cap and the wording that explains it cannot come apart — and in
 * `contracts` rather than beside the validator because the form is a
 * `'use client'` component, which may import this entry point and no other.
 *
 * It says the thing an operator will otherwise get wrong. A platform policy is
 * authored once, on one page, and then counts against *every* organization's
 * allowance — so three platform policies leave a tenant no room for one of
 * their own, and the rules past the cap do not run rather than queueing.
 */
/**
 * The sentence the rule form puts next to an output policy.
 *
 * It states the one thing an operator cannot discover from the form and would
 * otherwise discover from a support ticket: a judged output rule turns the
 * whole answer from streamed into buffered. Nothing is shown until the model
 * has read what the assistant wrote and scored it, which is a change to how
 * the product *feels* rather than to what it allows — the kind of thing that
 * gets reported as "chat got slow" by someone who never saw this page.
 *
 * In `contracts` for the reason the cap notice is: the form is a `'use
 * client'` component and may import this entry point and no other.
 */
export const OUTPUT_POLICY_LATENCY_NOTICE =
  'Output policies judged by a model delay the whole answer — it appears at ' +
  'once instead of word by word, because the judge has to read the finished ' +
  'answer before any of it can be shown.';

export const POLICY_CAP_NOTICE =
  `Each organization may run ${MAX_ACTIVE_LLM_POLICIES} policy rules at ` +
  'once on a stage. A platform policy counts against that allowance in ' +
  'every organization, and rules past the cap do not run.';
