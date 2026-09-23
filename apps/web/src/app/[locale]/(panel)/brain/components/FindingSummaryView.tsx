import { getFormatter, getTranslations } from 'next-intl/server';

import type { FindingSummary } from '@/features/brain/contracts/brain.types';

/**
 * A finding's detail in words. Every string a finding carries is either the
 * worker's (an extraction failure's reason, a contradiction's explanation) or
 * a document's (a cited passage); both are rendered as text, never as markup.
 */
export async function FindingSummaryView({
  summary,
}: {
  summary: FindingSummary;
}) {
  const [t, format] = await Promise.all([
    getTranslations('brain.findings.summary'),
    getFormatter(),
  ]);
  const file = (name: string | null) => name ?? t('unknown-file');

  switch (summary.kind) {
    case 'contradiction':
      return (
        <ul className="space-y-2">
          {summary.pairs.map((pair, i) => (
            <li key={i} className="text-sm">
              <p className="text-foreground">{pair.explanation}</p>
              {(pair.a || pair.b) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  „{pair.a ?? '…'}” ↔ „{pair.b ?? '…'}”
                </p>
              )}
            </li>
          ))}
        </ul>
      );
    case 'stale':
      return (
        <ul className="space-y-1 text-sm">
          {summary.reasons.map((reason, i) => {
            let text: string;
            if (reason.kind === 'verification_due') {
              text = t('verification-due', {
                date: format.dateTime(new Date(reason.dueAt), {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
              });
            } else if (reason.kind === 'source_deleted') {
              text = t('source-deleted', { file: file(reason.fileName) });
            } else {
              text = t('quote-gone', { file: file(reason.fileName) });
            }
            return <li key={i}>{text}</li>;
          })}
        </ul>
      );
    case 'unowned':
      return (
        <p className="text-sm">
          {summary.ownerLeft ? t('owner-left') : t('no-owner')}
        </p>
      );
    case 'orphan':
      return <p className="text-sm">{t('orphan')}</p>;
    case 'gap':
      return <p className="text-sm">{t('gap')}</p>;
    case 'extraction_failed':
      return (
        <p className="text-sm">
          {t('extraction-failed')}
          {summary.reason && (
            <span className="ml-1 text-xs text-muted-foreground">
              ({summary.reason})
            </span>
          )}
        </p>
      );
    default:
      return <p className="text-sm text-muted-foreground">{t('unknown')}</p>;
  }
}
