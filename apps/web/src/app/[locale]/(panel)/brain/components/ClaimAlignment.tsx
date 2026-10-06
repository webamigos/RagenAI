'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  alignClaimsToSources,
  missingQuoteFacts,
} from '@ragenai/brain-core/review';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { KnowledgePageDetail } from '@/features/brain/contracts/brain.types';
import { Link } from '@/i18n/routing';
export function ClaimAlignment({
  page,
  warningsEnabled,
  canWrite,
  onProgress,
}: {
  page: KnowledgePageDetail;
  warningsEnabled: boolean;
  canWrite: boolean;
  onProgress?: (progress: { confirmed: number; total: number }) => void;
}) {
  const t = useTranslations('brain');
  const rows = alignClaimsToSources(page.content, page.sources);
  const [checks, setChecks] = useState<
    Record<number, 'confirmed' | 'questioned'>
  >({});
  const confirmed = Object.values(checks).filter(
    (value) => value === 'confirmed',
  ).length;
  useEffect(() => {
    onProgress?.({ confirmed, total: rows.length });
  }, [confirmed, rows.length, onProgress]);
  return (
    <div className="space-y-3" data-testid="review-claims">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {t('review-mode.claim-progress', { confirmed, total: rows.length })} ·{' '}
        {t('review-mode.local-checks')}
      </p>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_76px] gap-3 rounded-md border border-border bg-muted p-3 text-sm font-semibold xl:grid">
        <span>{t('review-mode.claim')}</span>
        <span>{t('review-mode.quote')}</span>
        <span>{t('review-mode.assessment')}</span>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t('review-mode.no-claims')}
        </p>
      )}
      {rows.map((row, index) => {
        const missing = warningsEnabled
          ? [
              ...new Set(
                row.citations.flatMap((c) =>
                  c.source ? missingQuoteFacts(row.claim, c.source.quote) : [],
                ),
              ),
            ]
          : [];
        return (
          <article
            key={index}
            className={
              missing.length
                ? 'grid grid-cols-1 gap-3 rounded-md border border-pending bg-pending-tint p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_76px]'
                : 'grid grid-cols-1 gap-3 rounded-md border border-border p-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_76px]'
            }
          >
            <div className="min-w-0 space-y-2">
              <p className="text-sm leading-relaxed">
                <span className="mr-2 tabular-nums text-muted-foreground">
                  {index + 1}.
                </span>
                {row.claim}
              </p>
              {missing.length > 0 && (
                <p className="text-sm">
                  {t('review-mode.paraphrase', { facts: missing.join(', ') })}
                </p>
              )}
            </div>
            <div className="min-w-0 space-y-3">
              {row.citations.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('review-mode.no-marker')}
                </p>
              )}
              {row.citations.map((citation) => {
                const source = citation.source;
                if (!source) {
                  return (
                    <p
                      key={citation.marker}
                      className="text-sm text-muted-foreground"
                    >
                      {t('review-mode.missing-source', {
                        marker: citation.marker,
                      })}
                    </p>
                  );
                }
                return (
                  <div key={citation.marker} className="space-y-2">
                    <div className="flex flex-wrap gap-1 text-xs text-muted-foreground">
                      <span className="text-marker">[{citation.marker}]</span>
                      {source.documentId ? (
                        <Link
                          className="inline-flex min-h-8 items-center text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          href={`/knowledge/documents/${source.documentId}`}
                        >
                          {source.fileName ?? t('page.sources.unknown-file')}
                        </Link>
                      ) : (
                        <span>
                          {source.fileName ?? t('page.sources.unknown-file')}
                        </span>
                      )}
                      <span>· {source.span}</span>
                      {source.pinnedVersion !== null && (
                        <span>
                          ·{' '}
                          {t('page.sources.version', {
                            n: source.pinnedVersion,
                          })}
                        </span>
                      )}
                      {source.state !== 'current' && (
                        <Badge variant="outline">
                          {t(`page.sources.state.${source.state}`)}
                        </Badge>
                      )}
                    </div>
                    <blockquote className="whitespace-pre-wrap break-words rounded-md bg-muted p-3 font-mono text-sm leading-relaxed">
                      {source.quote}
                    </blockquote>
                  </div>
                );
              })}
            </div>
            {canWrite && (
              <div className="flex items-start gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t('review-mode.confirm-claim', { n: index + 1 })}
                  aria-pressed={checks[index] === 'confirmed'}
                  onClick={() =>
                    setChecks((current) => ({
                      ...current,
                      [index]: 'confirmed',
                    }))
                  }
                  className={
                    checks[index] === 'confirmed'
                      ? 'border-ready bg-ready-tint'
                      : ''
                  }
                >
                  ✓
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t('review-mode.question-claim', { n: index + 1 })}
                  aria-pressed={checks[index] === 'questioned'}
                  onClick={() =>
                    setChecks((current) => ({
                      ...current,
                      [index]: 'questioned',
                    }))
                  }
                  className={
                    checks[index] === 'questioned'
                      ? 'border-pending bg-pending-tint'
                      : ''
                  }
                >
                  ✕
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
