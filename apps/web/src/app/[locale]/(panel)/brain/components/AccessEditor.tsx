'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { ReviewOptions } from '@/features/brain/contracts/brain-review.types';

import { setKnowledgePageAccessAction } from '../actions';
import { useReviewAction } from './useReviewAction';

/**
 * Change who the page is open to (spec D2).
 *
 * **Widening is its own decision, with its own confirmation**, and the server
 * is what decides a change widens: the first save goes out unconfirmed, and a
 * `confirm-widening` answer opens a dialog naming exactly who would gain
 * access. Confirming sends the same list again with `confirmWidening`, which
 * the ledger records as `WIDEN_ACCESS`. A narrowing is saved straight away —
 * it can only make the page stricter than the reviewer intended, never looser.
 *
 * The editor starts from the principals it can name. Anything else on the
 * page (another organization's `org:`, a member who has left) matches nobody,
 * is listed as such beside this form, and is dropped by the next save.
 */
export function AccessEditor({
  publicId,
  updatedAt,
  orgId,
  principals,
  options,
}: {
  publicId: string;
  updatedAt: string;
  orgId: string;
  principals: string[];
  options: ReviewOptions;
}) {
  const t = useTranslations('brain.review');
  const { pending, run } = useReviewAction();
  const orgWide = `org:${orgId}`;
  const known = new Set([
    orgWide,
    ...options.members.map((m) => `user:${m.userId}`),
    ...options.teams.map((team) => `team:${team.id}`),
  ]);
  const initial = () => new Set(principals.filter((p) => known.has(p)));

  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [widening, setWidening] = useState(false);

  const everyone = selected.has(orgWide);
  const toggle = (principal: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) {
        next.add(principal);
      } else {
        next.delete(principal);
      }
      return next;
    });
  };

  const save = (confirmWidening: boolean) =>
    run(
      () =>
        setKnowledgePageAccessAction({
          publicId,
          expectedUpdatedAt: updatedAt,
          principals: everyone ? [orgWide] : [...selected],
          confirmWidening,
        }),
      t('access-saved'),
      {
        onError: (error) => {
          if (error === 'confirm-widening') {
            setWidening(true);
            return true;
          }
          return false;
        },
        onSuccess: () => setEditing(false),
      },
    );

  if (!editing) {
    return (
      <Button
        size="sm"
        variant="outline"
        className="mt-2"
        onClick={() => {
          setSelected(initial());
          setEditing(true);
        }}
      >
        {t('access-edit')}
      </Button>
    );
  }

  // Who the widening dialog names: everyone, or each principal not already
  // on the page. The server decides whether it is a widening; this only says
  // who to the person confirming it.
  const added = everyone
    ? [t('access-organization')]
    : [...selected]
        .filter((p) => !principals.includes(p))
        .map((p) => nameOf(p, options));

  return (
    <div className="mt-2 space-y-3 rounded-[6px] border border-border p-3">
      <Option
        id="brain-access-org"
        label={t('access-organization')}
        checked={everyone}
        onChange={(on) => toggle(orgWide, on)}
      />
      {options.teams.length > 0 && (
        <fieldset disabled={everyone} className="space-y-1.5">
          <legend className="mb-1 text-xs font-medium uppercase text-muted-foreground">
            {t('access-teams')}
          </legend>
          {options.teams.map((team) => (
            <Option
              key={team.id}
              id={`brain-access-team-${team.id}`}
              label={team.name}
              checked={everyone || selected.has(`team:${team.id}`)}
              onChange={(on) => toggle(`team:${team.id}`, on)}
            />
          ))}
        </fieldset>
      )}
      <fieldset
        disabled={everyone}
        className="max-h-56 space-y-1.5 overflow-y-auto"
      >
        <legend className="mb-1 text-xs font-medium uppercase text-muted-foreground">
          {t('access-people')}
        </legend>
        {options.members.map((m) => (
          <Option
            key={m.userId}
            id={`brain-access-user-${m.userId}`}
            label={m.name}
            checked={everyone || selected.has(`user:${m.userId}`)}
            onChange={(on) => toggle(`user:${m.userId}`, on)}
          />
        ))}
      </fieldset>
      {!everyone && selected.size === 0 && (
        <p className="text-xs text-muted-foreground">{t('access-none-hint')}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => save(false)}>
          {t('access-save')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => setEditing(false)}
        >
          {t('access-cancel')}
        </Button>
      </div>
      <ConfirmDialog
        open={widening}
        onOpenChange={setWidening}
        title={t('widen-title')}
        description={t('widen-description', { names: added.join(', ') })}
        confirmLabel={t('widen-confirm')}
        onConfirm={() => save(true)}
      />
    </div>
  );
}

function Option({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onChange(value === true)}
      />
      <label htmlFor={id} className="cursor-pointer">
        {label}
      </label>
    </div>
  );
}

function nameOf(principal: string, options: ReviewOptions): string {
  const id = principal.slice(principal.indexOf(':') + 1);
  if (principal.startsWith('team:')) {
    return options.teams.find((team) => team.id === id)?.name ?? principal;
  }
  return options.members.find((m) => m.userId === id)?.name ?? principal;
}
