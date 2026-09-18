'use server';

import {
  ACTIONS_BY_KIND,
  isActionValidForKind,
  isCombinationSupported,
  type GuardrailAction,
  type GuardrailKind,
  type GuardrailSeverity,
  type GuardrailStage,
  validatePattern,
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
): Promise<GuardrailMutationResult> {
  if (input.name.trim().length === 0) {
    return { ok: false, message: 'A rule needs a name.' };
  }

  if (!isCombinationSupported(input.kind, input.stage)) {
    return {
      ok: false,
      message:
        `This build cannot evaluate ${input.kind} rules at ${input.stage}. ` +
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

  return { ok: true };
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
      pattern: input.pattern ?? null,
      patternIsRegex: input.patternIsRegex === true,
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

  const verdict = await validate(input);
  if (!verdict.ok) {
    return verdict;
  }

  // A built-in's identity is what the resolver matches on, so `key` and `kind`
  // are not editable — a renamed key is a detector that silently no longer
  // exists, which the unique index cannot catch because it guards the opposite
  // failure.
  if (existing.key !== null && input.kind !== existing.kind) {
    return {
      ok: false,
      message:
        `${existing.key} is a built-in detector. Its kind is fixed; you can ` +
        'change what it does when it fires, not what it is.',
    };
  }

  const updated = await prisma.guardrail.update({
    where: { id: existing.id },
    data: {
      name: input.name.trim(),
      description: input.description?.trim() || null,
      stage: input.stage,
      action: input.action,
      severity: input.severity,
      pattern: input.pattern ?? null,
      patternIsRegex: input.patternIsRegex === true,
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
