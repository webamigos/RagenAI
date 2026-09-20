'use server';

import {
  ACTIONS_BY_KIND,
  GUARDRAIL_ACTIONS,
  GUARDRAIL_KINDS,
  GUARDRAIL_SEVERITIES,
  GUARDRAIL_STAGES,
  AUTHORABLE_COMBINATIONS,
  describePolicyFailure,
  isActionValidForKind,
  isCombinationSupported,
  type GuardrailAction,
  type GuardrailKind,
  type GuardrailSeverity,
  type GuardrailStage,
  validatePattern,
  validatePolicy,
} from '@ragenai/guardrails';

import { ADMIN_ACTIONS, recordAdminAction } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth-guard';
import { prisma } from '@/lib/db';
import { revalidatePath } from 'next/cache';

const REVALIDATE_PATH = '/guardrails';

export type GuardrailRow = {
  publicId: string;
  key: string | null;
  name: string;
  description: string | null;
  kind: GuardrailKind;
  stage: GuardrailStage;
  action: GuardrailAction;
  enabled: boolean;
  severity: GuardrailSeverity;
  pattern: string | null;
  patternIsRegex: boolean;
  policy: string | null;
  threshold: number | null;
  createdAt: Date;
  updatedAt: Date;
  /** How many organizations have adjusted this rule. */
  overrideCount: number;
};

/**
 * The platform rules, which are the ones this page authors.
 *
 * `organizationId: null` is the whole filter and it is not optional: a query
 * without it returns every organization's private rules to a page that has no
 * business showing them. The tenant-scope guard warns on a missing scope for
 * these models rather than blocking, so the `where` has to be right here.
 */
export async function listPlatformGuardrailsAction(): Promise<GuardrailRow[]> {
  await requireAdmin();

  const rows = await prisma.guardrail.findMany({
    where: { organizationId: null },
    orderBy: [{ key: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { overrides: true } } },
  });

  return rows.map((row) => ({
    publicId: row.publicId,
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
    policy: row.policy,
    threshold: row.threshold,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    overrideCount: row._count.overrides,
  }));
}

export type GuardrailInput = {
  name: string;
  description?: string;
  kind: GuardrailKind;
  stage: GuardrailStage;
  action: GuardrailAction;
  severity: GuardrailSeverity;
  pattern?: string;
  patternIsRegex?: boolean;
  /** LLM_POLICY only — the prose the judge model is given. */
  policy?: string;
  /**
   * LLM_POLICY only. `undefined` and `null` both mean "the rule names none",
   * which is how `DEFAULT_POLICY_THRESHOLD` comes to apply — an empty field is
   * a choice to inherit, not a zero.
   */
  threshold?: number | null;
};

export type GuardrailMutationResult =
  { ok: true } | { ok: false; message: string };

/**
 * Everything a rule has to satisfy before it is written.
 *
 * The form offers only valid combinations, so reaching these is either a stale
 * page or a hand-made request — which is why they are checked here and not
 * only there. A Server Action is a public endpoint.
 */
async function validate(
  input: GuardrailInput,
  /**
   * A rule whose kind and stage are the platform's, not the operator's.
   *
   * A built-in is seeded `BUILT_IN`/`INPUT`, which the authorable set
   * deliberately never lists — a built-in is seeded, not created. Running the
   * combination check over it rejected every edit of a built-in before the
   * identity guard below could say what is actually editable, so the page
   * offered an Edit button that could never succeed. The check belongs to what
   * an operator *chooses*; these two fields they cannot.
   */
  fixedByPlatform = false,
): Promise<GuardrailMutationResult> {
  const shapeError = validateShape(input);
  if (shapeError) {
    return { ok: false, message: shapeError };
  }

  // Against what an operator may **author**, not against what the build can
  // evaluate. The two stopped being the same question in Phase B and diverged
  // further in C: `LLM_POLICY` is evaluable as of the judge, and a rule of
  // that kind authored through this action would be written with no `policy`
  // — a row the resolver then drops, on a page that shows it enabled.
  //
  // A Server Action is a public endpoint, so the form offering only
  // `AUTHORABLE_COMBINATIONS` is not the check; this is.
  if (
    !fixedByPlatform &&
    !isCombinationSupported(input.kind, input.stage, AUTHORABLE_COMBINATIONS)
  ) {
    return {
      ok: false,
      message:
        `This panel cannot author ${input.kind} rules at ${input.stage}. ` +
        'Saving one would put a rule on the page that nothing enforces.',
    };
  }

  if (!isActionValidForKind(input.kind, input.action)) {
    return {
      ok: false,
      message:
        `${input.kind} rules cannot ${input.action}. ` +
        `They can ${ACTIONS_BY_KIND[input.kind].join(' or ')}.`,
    };
  }

  if (input.kind === 'PATTERN') {
    const pattern = input.pattern ?? '';
    // The save gate. It runs the pattern against adversarial fixtures in a
    // worker that is killed on the deadline, because a catastrophic regex
    // cannot be interrupted once a request has entered it — this is the only
    // place it can be stopped.
    const verdict = await validatePattern({
      pattern,
      patternIsRegex: input.patternIsRegex === true,
      stage: input.stage,
    });

    if (!verdict.ok) {
      return { ok: false, message: describeFailure(verdict.failure) };
    }
  }

  if (input.kind === 'LLM_POLICY') {
    // The same predicate the resolver drops on, reached through the package's
    // authoring gate rather than re-read here. A rule saved with prose this
    // panel considers fine and the resolver considers empty is a rule the page
    // shows enabled and the runtime never runs — and nothing anywhere says so.
    const verdict = validatePolicy({
      policy: input.policy,
      threshold: input.threshold,
    });

    if (!verdict.ok) {
      return { ok: false, message: describePolicyFailure(verdict.failure) };
    }
  }

  return { ok: true };
}

/**
 * The input is whatever JSON reached a Server Action, so nothing about it is
 * known yet.
 *
 * The form sends the right shapes; a stale tab and a hand-made request do not.
 * Without this, `severity: 'catastrophic'` reaches Prisma and comes back as an
 * enum error, and a non-string `name` throws inside `.trim()` — both surfacing
 * as an unhandled Server Action failure rather than as the field-level refusal
 * the rest of this file is careful to give.
 */
function validateShape(input: GuardrailInput): string | null {
  if (typeof input.name !== 'string' || input.name.trim().length === 0) {
    return 'A rule needs a name.';
  }
  if (input.description != null && typeof input.description !== 'string') {
    return 'A description has to be text.';
  }
  if (!(GUARDRAIL_KINDS as readonly string[]).includes(input.kind)) {
    return `${String(input.kind)} is not a kind of rule.`;
  }
  if (!(GUARDRAIL_STAGES as readonly string[]).includes(input.stage)) {
    return `${String(input.stage)} is not a stage.`;
  }
  if (!(GUARDRAIL_ACTIONS as readonly string[]).includes(input.action)) {
    return `${String(input.action)} is not something a rule can do.`;
  }
  if (!(GUARDRAIL_SEVERITIES as readonly string[]).includes(input.severity)) {
    return `${String(input.severity)} is not a severity.`;
  }
  if (input.pattern != null && typeof input.pattern !== 'string') {
    return 'A pattern has to be text.';
  }
  if (input.policy != null && typeof input.policy !== 'string') {
    return 'A policy has to be text.';
  }
  // `validatePolicy` refuses a non-number too, but only for an `LLM_POLICY`
  // rule. A pattern rule carrying `threshold: 'high'` would otherwise reach
  // Prisma and come back as a driver error rather than a field-level refusal.
  if (
    input.threshold != null &&
    (typeof input.threshold !== 'number' || !Number.isFinite(input.threshold))
  ) {
    return 'A threshold has to be a number between 0 and 1.';
  }
  return null;
}

function describeFailure(
  failure: Extract<
    Awaited<ReturnType<typeof validatePattern>>,
    { ok: false }
  >['failure'],
): string {
  switch (failure.code) {
    case 'empty':
      return 'A pattern rule needs a pattern.';
    case 'not-a-regex':
      return `That is not a valid regular expression: ${failure.message}`;
    case 'too-slow':
      return (
        `This pattern took longer than ${failure.budgetMs}ms against ` +
        `${failure.fixture}. A pattern that backtracks like this cannot be ` +
        'interrupted once a message has entered it, so it is refused here ' +
        'rather than allowed to hold up a turn.'
      );
    case 'match-width-unbounded':
      return (
        'An output rule needs a pattern whose match has a maximum length. ' +
        'The output stream is evaluated through a fixed window, so an ' +
        'unbounded match can be cut in half and never fire at all.'
      );
    case 'match-width-over-window':
      return (
        `This pattern can match up to ${failure.width} characters and the ` +
        `output window is ${failure.window}. A longer match is flushed before ` +
        'it completes, so the rule would never fire.'
      );
  }
}

/**
 * The two `LLM_POLICY` columns, written only where they mean something.
 *
 * Three cases, and the third is the one that bites. For a policy rule they are
 * the operator's. For any other operator-authored kind they are nulled, so a
 * rule switched from `LLM_POLICY` to `PATTERN` does not keep prose a later
 * switch back would silently resurrect — and so a hand-made request cannot
 * store a policy on a pattern rule. For a **built-in** they are left alone
 * entirely: `jailbreak-detection` is a scored rule and its `threshold` is its
 * sensitivity, so writing `null` here would reset a tuned detector to the
 * default as a side effect of renaming it.
 */
function policyColumnsFor(
  input: GuardrailInput,
  isBuiltIn: boolean,
): { policy?: string | null; threshold?: number | null } {
  if (isBuiltIn) {
    return {};
  }
  if (input.kind !== 'LLM_POLICY') {
    return { policy: null, threshold: null };
  }
  return {
    policy: input.policy?.trim() || null,
    // `undefined` and `null` are both "names no threshold", which is what
    // makes `DEFAULT_POLICY_THRESHOLD` apply. An empty field is a choice to
    // inherit the default, never a zero — a zero matches every message.
    threshold: input.threshold ?? null,
  };
}

export async function createGuardrailAction(
  input: GuardrailInput,
): Promise<GuardrailMutationResult> {
  const admin = await requireAdmin();

  const verdict = await validate(input);
  if (!verdict.ok) {
    return verdict;
  }

  const created = await prisma.guardrail.create({
    data: {
      organizationId: null,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      kind: input.kind,
      stage: input.stage,
      action: input.action,
      severity: input.severity,
      pattern: input.kind === 'PATTERN' ? (input.pattern ?? null) : null,
      patternIsRegex: input.kind === 'PATTERN' && input.patternIsRegex === true,
      ...policyColumnsFor(input, false),
      // Observation by default. A rule that starts by blocking is a rule
      // whose false-positive rate nobody has measured.
      enabled: false,
      createdBy: admin.id,
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.guardrailCreated,
    entityType: 'guardrail',
    entityId: created.publicId,
    after: {
      name: created.name,
      kind: created.kind,
      stage: created.stage,
      action: created.action,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function updateGuardrailAction(
  publicId: string,
  input: GuardrailInput,
): Promise<GuardrailMutationResult> {
  const admin = await requireAdmin();

  const existing = await prisma.guardrail.findFirst({
    where: { publicId, organizationId: null },
  });
  if (!existing) {
    return { ok: false, message: 'That rule no longer exists.' };
  }

  const isBuiltIn = existing.key !== null;

  // A built-in's identity is what the resolver matches on, so `key` and `kind`
  // are not editable — a renamed key is a detector that silently no longer
  // exists, which the unique index cannot catch because it guards the opposite
  // failure.
  if (isBuiltIn && input.kind !== existing.kind) {
    return {
      ok: false,
      message:
        `${existing.key} is a built-in detector. Its kind is fixed; you can ` +
        'change what it does when it fires, not what it is.',
    };
  }

  // The identity guard runs first, so by here a built-in's kind and stage are
  // the platform's own and are not the operator's to be judged on.
  const verdict = await validate(input, isBuiltIn);
  if (!verdict.ok) {
    return verdict;
  }

  const updated = await prisma.guardrail.update({
    where: { id: existing.id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      // A built-in keeps the stage it was seeded with. Offering it on the form
      // would be offering a choice the resolver does not honour.
      stage: isBuiltIn ? existing.stage : input.stage,
      action: input.action,
      severity: input.severity,
      pattern: input.kind === 'PATTERN' ? (input.pattern ?? null) : null,
      patternIsRegex: input.kind === 'PATTERN' && input.patternIsRegex === true,
      ...policyColumnsFor(input, isBuiltIn),
    },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.guardrailUpdated,
    entityType: 'guardrail',
    entityId: publicId,
    before: {
      name: existing.name,
      stage: existing.stage,
      action: existing.action,
      pattern: existing.pattern,
    },
    after: {
      name: updated.name,
      stage: updated.stage,
      action: updated.action,
      pattern: updated.pattern,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function toggleGuardrailAction(
  publicId: string,
  enabled: boolean,
): Promise<GuardrailMutationResult> {
  const admin = await requireAdmin();

  const existing = await prisma.guardrail.findFirst({
    where: { publicId, organizationId: null },
  });
  if (!existing) {
    return { ok: false, message: 'That rule no longer exists.' };
  }

  await prisma.guardrail.update({
    where: { id: existing.id },
    data: { enabled },
  });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.guardrailToggled,
    entityType: 'guardrail',
    entityId: publicId,
    before: { enabled: existing.enabled },
    after: { enabled },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}

export async function deleteGuardrailAction(
  publicId: string,
): Promise<GuardrailMutationResult> {
  const admin = await requireAdmin();

  const existing = await prisma.guardrail.findFirst({
    where: { publicId, organizationId: null },
  });
  if (!existing) {
    return { ok: false, message: 'That rule no longer exists.' };
  }

  // A built-in can be switched off; it cannot be removed. Deleting one leaves
  // the resolver with no row for a detector the code still knows about, which
  // reads as "this installation does not moderate" rather than as a missing
  // row — the quiet half of the failure the partial unique index guards.
  if (existing.key !== null) {
    return {
      ok: false,
      message:
        `${existing.key} is a built-in detector and cannot be deleted. ` +
        'Switch it off instead — a deleted built-in looks like an ' +
        'installation that never had it.',
    };
  }

  await prisma.guardrail.delete({ where: { id: existing.id } });

  await recordAdminAction({
    admin,
    action: ADMIN_ACTIONS.guardrailDeleted,
    entityType: 'guardrail',
    entityId: publicId,
    before: {
      name: existing.name,
      kind: existing.kind,
      stage: existing.stage,
      action: existing.action,
    },
    securityEvent: { eventType: 'ADMIN_SETTINGS_CHANGED' },
  });

  revalidatePath(REVALIDATE_PATH);
  return { ok: true };
}
