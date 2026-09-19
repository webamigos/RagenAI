'use client';

import { useTransition } from 'react';
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

  const change = (row: OrgGuardrailRow, next: TriState) => {
    startTransition(async () => {
      const result = await setGuardrailOverrideAction(
        organizationId,
        row.publicId,
        { enabled: next === 'inherit' ? null : next === 'on' },
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

            <div className="shrink-0">
              {row.isPlatformRule ? (
                <select
                  value={toTriState(row, inert)}
                  disabled={isPending}
                  onChange={(e) => change(row, e.target.value as TriState)}
                  className="rounded-md border border-border bg-background px-2 py-1 text-sm disabled:opacity-50"
                >
                  <option value="inherit">Inherit</option>
                  <option value="on">Force on</option>
                  <option value="off">Force off</option>
                </select>
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
