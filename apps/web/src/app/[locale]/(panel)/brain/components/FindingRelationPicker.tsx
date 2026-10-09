'use client';
import { useState } from 'react';
import { TouchTarget } from '@ragenai/common-ui/TouchTarget';
import { useTranslations } from 'next-intl';
import type {
  BrainProposal,
  ProposalDecisionResult,
} from '@/features/brain-assistant/contracts/brain-assistant.types';
import type { ReviewResult } from '@/features/brain/contracts/brain-review.types';
import { addKnowledgeRelationsAction } from '../actions';
import { ProposalCard } from './assistant/ProposalCard';

type RelationProposal = Extract<BrainProposal, { action: 'ADD_RELATIONS' }>;
export function FindingRelationPicker({
  proposal,
}: {
  proposal: RelationProposal;
}) {
  const t = useTranslations('brain.findings');
  const [selected, setSelected] = useState<string[]>([]);
  const [current, setCurrent] = useState<BrainProposal>(proposal);
  const targets = proposal.targets.filter((target) =>
    selected.includes(target.publicId),
  );
  const chosen = { ...proposal, targets, outcome: current.outcome };
  const allSelected = targets.length === proposal.targets.length;
  async function apply(): Promise<
    ProposalDecisionResult | Extract<ReviewResult, { success: false }>
  > {
    const result = await addKnowledgeRelationsAction({
      publicId: proposal.page.publicId,
      expectedUpdatedAt: proposal.page.updatedAt,
      targets: targets.map((target) => ({
        publicId: target.publicId,
        expectedUpdatedAt: target.updatedAt,
        kind: target.kind,
      })),
    });
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return {
      success: true,
      proposal: {
        ...chosen,
        outcome: {
          status: 'applied',
          at: new Date().toISOString(),
          results: [{ label: proposal.page.title, ok: true }],
        },
      },
    };
  }
  return (
    <div className="mt-4 rounded-md bg-muted/40 p-3">
      <p className="text-sm font-medium">{t('relation-suggestions')}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {t('relation-basis')}
      </p>
      {!current.outcome && (
        <fieldset className="mt-2 min-w-0 space-y-1">
          <legend className="sr-only">{t('select-relations')}</legend>
          {proposal.targets.length > 1 && (
            <button
              type="button"
              className="relative min-h-8 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              onClick={() =>
                setSelected(
                  allSelected ? [] : proposal.targets.map((x) => x.publicId),
                )
              }
            >
              <TouchTarget>
                {t(allSelected ? 'select-none' : 'select-all')}
              </TouchTarget>
            </button>
          )}
          {proposal.targets.map((target) => (
            <label
              key={target.publicId}
              className="flex min-h-8 cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="checkbox"
                className="size-4 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                checked={selected.includes(target.publicId)}
                onChange={(event) =>
                  setSelected((previous) =>
                    event.target.checked
                      ? [...previous, target.publicId]
                      : previous.filter((id) => id !== target.publicId),
                  )
                }
              />
              <span className="min-w-0 break-words">{target.title}</span>
            </label>
          ))}
        </fieldset>
      )}
      {(targets.length > 0 || current.outcome) && (
        <ProposalCard
          proposal={chosen}
          threadId={null}
          messageId={null}
          onChange={setCurrent}
          applyAction={apply}
          applyLabel={t('add-relations', { count: targets.length })}
        />
      )}
    </div>
  );
}
