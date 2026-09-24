'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { Button } from '@/components/ui/button';
import type { AccessEntry } from '@/features/brain/contracts/brain.types';
import type {
  BrainProposal,
  ProposalDecisionResult,
} from '@/features/brain-assistant/contracts/brain-assistant.types';
import { Link, useRouter } from '@/i18n/routing';

import {
  applyBrainProposalAction,
  dismissBrainProposalAction,
} from '../../assistant-actions';

/**
 * A change the assistant suggests, rendered by the application — the card is
 * the confirmation (spec "Acting"). Apply runs the same server action as the
 * Brain button would, as the signed-in person; nothing is applied from the
 * text of the answer.
 *
 * Without a `messageId` (the turn could not be stored) the card is shown but
 * cannot be applied: Apply reads the proposal back from the conversation, and
 * there is nothing to read.
 */
export function ProposalCard({
  proposal,
  threadId,
  messageId,
  onChange,
}: {
  proposal: BrainProposal;
  threadId: string | null;
  messageId: string | null;
  onChange: (proposal: BrainProposal) => void;
}) {
  const t = useTranslations('brain');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmWiden, setConfirmWiden] = useState(false);
  const decidable = threadId !== null && messageId !== null;

  function decide(
    run: () => Promise<ProposalDecisionResult>,
    refreshAfter: boolean,
  ) {
    setError(null);
    startTransition(async () => {
      const result = await run();
      if (result.success) {
        onChange(result.proposal);
        if (refreshAfter) {
          router.refresh();
        }
        return;
      }
      if (result.error === 'confirm-widening') {
        setConfirmWiden(true);
        return;
      }
      setError(t(`assistant.proposal.errors.${result.error}`));
    });
  }

  const ref = { threadId, messageId, proposalId: proposal.id };
  const apply = (confirmWidening = false) =>
    decide(() => applyBrainProposalAction({ ...ref, confirmWidening }), true);
  const dismiss = () => decide(() => dismissBrainProposalAction(ref), false);

  return (
    <div
      data-testid="brain-proposal"
      data-action={proposal.action}
      className="mt-2 rounded-[6px] border border-border bg-background p-3 text-sm"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('assistant.proposal.title')}
      </p>
      <p className="mt-1 font-medium text-foreground">
        {t(`assistant.proposal.action.${proposal.action}`, {
          count: pageCount(proposal),
        })}
      </p>
      <ProposalSubject proposal={proposal} />
      <p className="mt-2 text-[13px] text-muted-foreground">
        {proposal.reason}
      </p>

      {proposal.outcome === null ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            disabled={pending || !decidable}
            onClick={() => apply()}
          >
            {t('assistant.proposal.apply')}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !decidable}
            onClick={dismiss}
          >
            {t('assistant.proposal.dismiss')}
          </Button>
          {!decidable && (
            <span className="text-xs text-muted-foreground">
              {t('assistant.proposal.not-stored')}
            </span>
          )}
        </div>
      ) : (
        <Outcome proposal={proposal} />
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirmWiden}
        onOpenChange={setConfirmWiden}
        title={t('review.widen-title')}
        description={t('assistant.proposal.widen-description')}
        confirmLabel={t('review.widen-confirm')}
        onConfirm={() => apply(true)}
      />
    </div>
  );
}

function pageCount(proposal: BrainProposal): number {
  return 'pages' in proposal ? proposal.pages.length : 1;
}

function PageLink({ publicId, title }: { publicId: string; title: string }) {
  return (
    <Link
      href={`/brain/pages/${publicId}`}
      className="text-primary underline-offset-4 hover:underline"
    >
      {title}
    </Link>
  );
}

function ProposalSubject({ proposal }: { proposal: BrainProposal }) {
  const t = useTranslations('brain');
  switch (proposal.action) {
    case 'APPROVE':
    case 'REJECT':
    case 'PUBLISH':
    case 'UNPUBLISH':
      return (
        <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto">
          {proposal.pages.map((page, i) => (
            <li key={page.publicId}>
              <PageLink {...page} />
              {proposal.audience?.[i] && (
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  <p>{t('assistant.proposal.publish-audience')}</p>
                  <AccessNames entries={proposal.audience[i]} />
                </div>
              )}
            </li>
          ))}
        </ul>
      );
    case 'MERGE':
      return (
        <div className="mt-1 space-y-1">
          <p>
            {t('assistant.proposal.merge-from')}{' '}
            <PageLink {...proposal.source} />
          </p>
          <p>
            {t('assistant.proposal.merge-into')}{' '}
            <PageLink {...proposal.target} />
          </p>
          <div className="text-[13px]">
            <p className="text-muted-foreground">
              {t('assistant.proposal.merge-access')}
            </p>
            <AccessNames entries={proposal.preview.access} />
          </div>
        </div>
      );
    case 'SET_OWNER':
      return (
        <p className="mt-1">
          <PageLink {...proposal.page} /> → {proposal.owner.name}
        </p>
      );
    case 'SET_ACCESS':
      return (
        <div className="mt-1 space-y-1">
          <p>
            <PageLink {...proposal.page} />
          </p>
          <div className="grid grid-cols-2 gap-2 text-[13px]">
            <div>
              <p className="text-muted-foreground">
                {t('assistant.proposal.access-before')}
              </p>
              <AccessNames entries={proposal.preview.before} />
            </div>
            <div>
              <p className="text-muted-foreground">
                {t('assistant.proposal.access-after')}
              </p>
              <AccessNames entries={proposal.preview.after} />
            </div>
          </div>
          {proposal.preview.widens && (
            <p className="text-xs font-medium text-foreground">
              {t('assistant.proposal.widens')}
            </p>
          )}
        </div>
      );
    case 'RETRY_EXTRACTION':
      return (
        <p className="mt-1">
          {proposal.finding.fileName ??
            t('assistant.proposal.unknown-document')}
        </p>
      );
  }
}

function AccessNames({ entries }: { entries: AccessEntry[] }) {
  const t = useTranslations('brain');
  if (entries.length === 0) {
    return <p>{t('page.access.nobody')}</p>;
  }
  return (
    <ul>
      {entries.map((entry, i) => (
        <li key={i}>
          {entry.kind === 'organization' && t('page.access.organization')}
          {entry.kind === 'user' &&
            (entry.name
              ? t('page.access.user', { name: entry.name })
              : t('page.access.user-gone'))}
          {entry.kind === 'team' &&
            (entry.name
              ? t('page.access.team', { name: entry.name })
              : t('page.access.team-gone'))}
          {entry.kind === 'unmatched' && t('page.access.unmatched')}
        </li>
      ))}
    </ul>
  );
}

function Outcome({ proposal }: { proposal: BrainProposal }) {
  const t = useTranslations('brain');
  const outcome = proposal.outcome;
  if (!outcome) {
    return null;
  }
  if (outcome.status === 'dismissed') {
    return (
      <p
        data-testid="brain-proposal-outcome"
        className="mt-3 text-xs text-muted-foreground"
      >
        {t('assistant.proposal.dismissed')}
      </p>
    );
  }
  const failed = outcome.results.filter((r) => !r.ok);
  return (
    <div data-testid="brain-proposal-outcome" className="mt-3 text-xs">
      <p className="font-medium text-foreground">
        {failed.length === 0
          ? t('assistant.proposal.applied')
          : t('assistant.proposal.applied-partly', {
              ok: outcome.results.length - failed.length,
              total: outcome.results.length,
            })}
      </p>
      {failed.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {failed.map((r, i) => (
            <li key={i}>
              {r.label}:{' '}
              {r.error && t.has(`review.errors.${r.error}`)
                ? t(`review.errors.${r.error}`)
                : t('assistant.proposal.step-failed')}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
