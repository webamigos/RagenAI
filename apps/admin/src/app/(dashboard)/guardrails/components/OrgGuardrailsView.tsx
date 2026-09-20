'use client';

import {
  ACTIONS_BY_KIND,
  DEFAULT_POLICY_THRESHOLD,
  isScoredRule,
} from '@ragenai/guardrails/contracts';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  setGuardrailOverrideAction,
  type OrgGuardrailRow,
  type OrgGuardrailsView as ViewData,
} from '../org-actions';

/**
 * Where a value came from, in words an operator can act on.
 *
 * The resolver reports this per field precisely so the page can answer "why is
 * this on" — a question somebody who can set an override but cannot see what
 * currently decides it has no way to answer.
 */
const SOURCE_LABELS: Record<string, string> = {
  'platform-rule': 'from the platform rule',
  'org-override': 'set for this organization',
  'org-rule': "this organization's own rule",
};

type TriState = 'inherit' | 'on' | 'off';

/** The override as a whole, which is what every write sends. */
type OverridePatch = {
  enabled: boolean | null;
  action: OrgGuardrailRow['action'] | null;
  threshold: number | null;
};

/**
 * What the control shows: the state in effect, not the row as stored.
 *
 * A seeded `legacy_on_premise` override is stored and ignored off-premise, so
 * reading it back would put the select on "Force off" while the rule is on.
 * Two things then go wrong at once: the control states something untrue, and
 * the note beside it — "changing it here makes it apply immediately" — cannot
 * be acted on, because choosing the value already displayed fires no change
 * event. The operator would have to toggle away and back.
 *
 * So an inert row reads as "Inherit", which is what is actually happening, and
 * every option in the select is a real change from there. What is stored, and
 * why it does nothing, is said in words beside the control rather than encoded
 * in it.
 */
const SELECT_CLASS =
  'rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50';

function fromTriState(next: TriState): boolean | null {
  return next === 'inherit' ? null : next === 'on';
}

function toTriState(row: OrgGuardrailRow, inert: boolean): TriState {
  if (inert || row.override == null || row.override.enabled == null) {
    return 'inherit';
  }
  return row.override.enabled ? 'on' : 'off';
}

export function OrgGuardrailsView({
  organizationId,
  data,
}: {
  organizationId: string;
  data: ViewData;
}) {
  const [isPending, startTransition] = useTransition();

  /**
   * Every write sends all three fields, always.
   *
   * The action deletes the row when all three are inherited, so a control that
   * sent only the field it owns would have to be read as "leave the rest
   * alone" — and then nothing could ever clear the last one. Sending the whole
   * override, with the two the operator did not touch taken from what is
   * stored, keeps one meaning for `null`: inherit.
   */
  const change = (row: OrgGuardrailRow, patch: Partial<OverridePatch>) => {
    startTransition(async () => {
      const result = await setGuardrailOverrideAction(
        organizationId,
        row.publicId,
        {
          enabled: row.override?.enabled ?? null,
          action: row.override?.action ?? null,
          threshold: row.override?.threshold ?? null,
          ...patch,
        },
      );
      if (result.ok) {
        toast.success('Override saved');
      } else {
        toast.error(result.message);
      }
    });
  };

  if (data.rules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No rules apply to this organization yet.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {data.rules.map((row) => {
        // A seeded row on a SaaS installation is stored and ignored. Showing
        // the inherited value without the row would leave an operator who
        // later sets IS_ON_PREMISE facing changes they never asked for; showing
        // the row as if it applied would say "moderation off" while the
        // installation moderates. So: both, and the difference stated.
        const inert =
          row.override?.isLegacyOnPremise === true &&
          !data.isOnPremiseInstallation;

        return (
          <div
            key={row.publicId}
            className="flex items-start justify-between gap-4 rounded-lg border border-border p-4"
          >
            <div className="min-w-0">
              <div className="font-medium">{row.name}</div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {row.kind} · {row.stage} · {row.enabled ? 'on' : 'off'},{' '}
                {SOURCE_LABELS[row.sources.enabled] ?? row.sources.enabled}
              </div>

              {inert ? (
                <div className="mt-2 rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                  An override is stored for this organization (
                  {row.override?.enabled ? 'on' : 'off'}), and it is not being
                  applied. The migration copied it from the organization&apos;s
                  old content-moderation setting, which was only ever read on an
                  on-premise installation. Setting{' '}
                  <code className="font-mono">IS_ON_PREMISE</code> would make it
                  take effect; changing it here makes it apply immediately, like
                  any other override.
                </div>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              {row.isPlatformRule ? (
                <>
                  <Labelled label="State">
                    <select
                      aria-label={`State for ${row.name}`}
                      value={toTriState(row, inert)}
                      disabled={isPending}
                      onChange={(e) =>
                        change(row, {
                          enabled: fromTriState(e.target.value as TriState),
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="inherit">Inherit</option>
                      <option value="on">Force on</option>
                      <option value="off">Force off</option>
                    </select>
                  </Labelled>

                  {/* The one an organization is most likely to want. "Keep the
                      platform's rule, but only log it for us" is the whole
                      reason an override exists, and the resolver has honoured
                      it since Phase A with nothing able to write it.

                      Offered only where the kind can carry it: `MASK` needs a
                      span, and a built-in or a policy returns a verdict over
                      the whole text. */}
                  <Labelled label="On a hit">
                    <select
                      aria-label={`On a hit for ${row.name}`}
                      value={row.override?.action ?? 'inherit'}
                      disabled={isPending}
                      onChange={(e) =>
                        change(row, {
                          action:
                            e.target.value === 'inherit'
                              ? null
                              : (e.target.value as OverridePatch['action']),
                        })
                      }
                      className={SELECT_CLASS}
                    >
                      <option value="inherit">Inherit ({row.action})</option>
                      {ACTIONS_BY_KIND[row.kind].map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </Labelled>

                  {/* Only where a verdict is a score. A threshold on a rule
                      whose provider answers with a flag is a number an
                      operator would set and nothing would read — the same
                      per-key distinction the platform form makes. */}
                  {isScoredRule(row) ? (
                    <Labelled label="Fires at">
                      <ThresholdControl
                        row={row}
                        disabled={isPending}
                        onCommit={(threshold) => change(row, { threshold })}
                      />
                    </Labelled>
                  ) : null}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Own rule — edited by the organization
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Labelled({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

/**
 * The threshold, committed on blur rather than on every keystroke.
 *
 * Each write is a round trip that re-resolves the whole rule set, and a number
 * input fires per character — typing `0.55` would save `0`, `0.5` and then
 * `0.55`, and the first of those is a threshold that matches every message.
 * Held locally until the operator is done, and an empty field commits `null`,
 * which means inherit rather than zero.
 */
function ThresholdControl({
  row,
  disabled,
  onCommit,
}: {
  row: OrgGuardrailRow;
  disabled: boolean;
  onCommit: (threshold: number | null) => void;
}) {
  const stored = row.override?.threshold;
  const [draft, setDraft] = useState(stored != null ? String(stored) : '');

  const commit = () => {
    const trimmed = draft.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    // Unchanged means no write. Without this, tabbing through the row saves an
    // override — and on a rule with nothing else overridden, saving and then
    // clearing it would delete a row that was never meant to exist.
    if (next === (stored ?? null)) {
      return;
    }
    onCommit(next);
  };

  return (
    <input
      type="number"
      aria-label={`Fires at, for ${row.name}`}
      min={0}
      max={1}
      step={0.05}
      value={draft}
      // What it inherits, so an empty box is not mistaken for "no threshold".
      placeholder={String(row.threshold ?? DEFAULT_POLICY_THRESHOLD)}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
    />
  );
}
