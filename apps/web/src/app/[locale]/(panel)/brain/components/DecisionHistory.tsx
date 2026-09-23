import { getFormatter, getTranslations } from 'next-intl/server';

import type { KnowledgeDecisionView } from '@/features/brain/contracts/brain.types';

/**
 * The page's ledger, newest first (spec D2): what was decided, by whom and
 * when. `KnowledgeDecision` is append-only, so this is the whole account of
 * how the page got to the state shown above it — the before and after of each
 * row stay in the database, for an audit rather than a sidebar.
 */
export async function DecisionHistory({
  decisions,
}: {
  decisions: KnowledgeDecisionView[];
}) {
  const [t, format] = await Promise.all([
    getTranslations('brain.history'),
    getFormatter(),
  ]);
  if (decisions.length === 0) {
    return <p className="text-muted-foreground">{t('empty')}</p>;
  }
  return (
    <ol className="space-y-1.5" data-testid="brain-decisions">
      {decisions.map((d, i) => (
        <li key={i}>
          <span className="text-foreground">{t(`action.${d.action}`)}</span>
          <span className="text-muted-foreground">
            {' · '}
            {d.actorName ?? t('unknown-actor')}
            {' · '}
            {format.dateTime(new Date(d.createdAt), {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </li>
      ))}
    </ol>
  );
}
