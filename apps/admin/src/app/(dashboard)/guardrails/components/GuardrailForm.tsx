'use client';

import {
  ACTIONS_BY_KIND,
  GUARDRAIL_SEVERITIES,
  AUTHORABLE_COMBINATIONS,
  type GuardrailAction,
  type GuardrailCombination,
  type GuardrailKind,
  type GuardrailSeverity,
  type GuardrailStage,
} from '@ragenai/guardrails/contracts';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  createGuardrailAction,
  updateGuardrailAction,
  type GuardrailRow,
} from '../actions';

/**
 * The kinds this build can evaluate, and the stages each can run at.
 *
 * Derived from `AUTHORABLE_COMBINATIONS` rather than from the enum, so the form
 * cannot offer a rule that nothing would evaluate. That is the difference
 * between a page that is honest and a page with a "not enforced yet" banner
 * on it — the banner starts lying the moment one combination works, and these
 * arrive one at a time.
 */
/**
 * Which stages the form may offer for each kind.
 *
 * Exported and pure so it can be tested as itself. It was a closure inside the
 * hook, and the duplicate stage it emitted was invisible to every test that
 * only drove behaviour — React renders two identical `<option>`s without
 * complaint, so nothing failed and nothing said anything.
 */
export function offeredStagesByKind(
  supported: readonly GuardrailCombination[],
  existing?: { kind: GuardrailKind; stage: GuardrailStage },
): Map<GuardrailKind, GuardrailStage[]> {
  {
    const stagesByKind = new Map<GuardrailKind, GuardrailStage[]>();
    // A rule being edited contributes its own kind and stage, whether or not
    // this build evaluates them. A built-in is seeded `BUILT_IN`/`INPUT`,
    // which `AUTHORABLE_COMBINATIONS` deliberately never lists, because a
    // built-in is seeded rather than created — without
    // this both selects render with no option matching the value they hold,
    // which reads as an empty form rather than as a fixed field.
    if (existing) {
      stagesByKind.set(
        existing.kind,
        existing.stage === 'BOTH'
          ? ['INPUT', 'OUTPUT', 'BOTH']
          : [existing.stage],
      );
    }
    for (const combination of supported) {
      const stages = stagesByKind.get(combination.kind) ?? [];
      stages.push(combination.stage);
      stagesByKind.set(combination.kind, stages);
    }
    // `BOTH` is offered only where both halves are, because it is shorthand
    // for two stages rather than a third one.
    //
    // Deduplicated, because the edited rule seeds its own stage and the
    // supported set can name the same one: a `BOTH` pattern rule seeded
    // `INPUT`, `OUTPUT`, `BOTH`, then took `INPUT` from the supported set and
    // `BOTH` from the line above, and the select rendered each twice.
    for (const [kind, stages] of stagesByKind) {
      const unique = [...new Set(stages)];
      if (unique.includes('INPUT') && unique.includes('OUTPUT')) {
        unique.push('BOTH');
      }
      stagesByKind.set(kind, [...new Set(unique)]);
    }
    return stagesByKind;
  }
}

function useOffered(existing?: { kind: GuardrailKind; stage: GuardrailStage }) {
  return useMemo(
    () => offeredStagesByKind(AUTHORABLE_COMBINATIONS, existing),
    [existing],
  );
}

export function GuardrailForm({
  rule,
  onClose,
}: {
  rule?: GuardrailRow;
  onClose: () => void;
}) {
  const offered = useOffered(
    rule ? { kind: rule.kind, stage: rule.stage } : undefined,
  );
  const kinds = [...offered.keys()];

  const [name, setName] = useState(rule?.name ?? '');
  const [description, setDescription] = useState(rule?.description ?? '');
  const [kind, setKind] = useState<GuardrailKind>(
    rule?.kind ?? kinds[0] ?? 'PATTERN',
  );
  const [stage, setStage] = useState<GuardrailStage>(rule?.stage ?? 'INPUT');
  const [action, setAction] = useState<GuardrailAction>(rule?.action ?? 'LOG');
  const [severity, setSeverity] = useState<GuardrailSeverity>(
    rule?.severity ?? 'warn',
  );
  const [pattern, setPattern] = useState(rule?.pattern ?? '');
  const [patternIsRegex, setPatternIsRegex] = useState(
    rule?.patternIsRegex ?? false,
  );
  const [isPending, startTransition] = useTransition();

  const isBuiltIn = rule?.key != null;
  const stages = offered.get(kind) ?? [];
  const actions = ACTIONS_BY_KIND[kind] ?? [];

  const submit = () => {
    startTransition(async () => {
      const input = {
        name,
        description,
        kind,
        stage,
        action,
        severity,
        pattern: kind === 'PATTERN' ? pattern : undefined,
        patternIsRegex: kind === 'PATTERN' ? patternIsRegex : undefined,
      };

      try {
        const result = rule
          ? await updateGuardrailAction(rule.publicId, input)
          : await createGuardrailAction(input);

        if (result.ok) {
          toast.success(rule ? 'Rule saved' : 'Rule created, switched off');
          onClose();
        } else {
          toast.error(result.message);
        }
      } catch {
        // A refused action returns `{ ok: false }`; a Prisma or audit failure
        // rejects instead, and without this the transition ends with neither
        // branch having run — the dialog sits there looking like nothing
        // happened, which is the one outcome worse than an error.
        toast.error('That did not save. The server reported a failure.');
      }
    });
  };

  if (kinds.length === 0) {
    return (
      <Shell onClose={onClose}>
        <h2 className="text-lg font-semibold">Nothing to author yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          This build ships no guardrail evaluator, so any rule saved here would
          be enforced by nothing. The form returns when the first kind can run.
        </p>
      </Shell>
    );
  }

  return (
    <Shell onClose={onClose}>
      <h2 className="text-lg font-semibold">
        {rule ? 'Edit rule' : 'New platform rule'}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A platform rule applies to every organization. An organization can
        adjust it for itself; it cannot delete it.
      </p>

      <div className="mt-6 space-y-4">
        <Field htmlFor="guardrail-name" label="Name">
          <input
            id="guardrail-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field
          htmlFor="guardrail-description"
          label="Description"
          hint="Shown to whoever reads the rule list."
        >
          <input
            id="guardrail-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
        </Field>

        <Field htmlFor="guardrail-kind" label="Kind">
          <select
            id="guardrail-kind"
            value={kind}
            disabled={isBuiltIn}
            onChange={(e) => setKind(e.target.value as GuardrailKind)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-60"
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          {isBuiltIn ? (
            <p className="mt-1 text-xs text-muted-foreground">
              A built-in detector&apos;s kind is fixed. You can change what it
              does when it fires.
            </p>
          ) : null}
        </Field>

        <Field htmlFor="guardrail-stage" label="Stage">
          <select
            id="guardrail-stage"
            value={stage}
            onChange={(e) => setStage(e.target.value as GuardrailStage)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {stages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        <Field htmlFor="guardrail-action" label="On a hit">
          <select
            id="guardrail-action"
            value={action}
            onChange={(e) => setAction(e.target.value as GuardrailAction)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {actions.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>

        <Field
          htmlFor="guardrail-severity"
          label="Severity of the event it records"
        >
          <select
            id="guardrail-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as GuardrailSeverity)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {GUARDRAIL_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>

        {kind === 'PATTERN' ? (
          <>
            <Field
              htmlFor="guardrail-pattern"
              label="Pattern"
              hint="Checked against personal data that Presidio has already masked, so a rule for a national ID will not match the number — it will have become a placeholder by then."
            >
              <input
                id="guardrail-pattern"
                value={pattern}
                onChange={(e) => setPattern(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2 font-mono text-sm"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={patternIsRegex}
                onChange={(e) => setPatternIsRegex(e.target.checked)}
              />
              Treat as a regular expression
            </label>
          </>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={submit}
          className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {submitLabel({ isPending, isEdit: rule != null })}
        </button>
      </div>
    </Shell>
  );
}

/**
 * "Checking…" rather than "Saving…" on purpose: the wait is the save-time
 * pattern probe, which runs the rule against adversarial fixtures before
 * anything is written. Telling an operator it is saving would make a refusal
 * look like a failure to save rather than a verdict on their pattern.
 */
function submitLabel({
  isPending,
  isEdit,
}: {
  isPending: boolean;
  isEdit: boolean;
}): string {
  if (isPending) {
    return 'Checking…';
  }
  return isEdit ? 'Save' : 'Create';
}

function Shell({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-xl border border-border bg-card p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({
  htmlFor,
  label,
  hint,
  children,
}: {
  /** The control's `id`. Without it the label is decoration, not a label. */
  htmlFor: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
