'use client';

import {
  readDocumentDiagnostics,
  sortFindings,
} from '@ragenai/rag-core/document-diagnostics';
import { useFormatter, useTranslations } from 'next-intl';

import { useOrgFeature } from '@/app/hooks/useOrgFeatures';

import { useDiagnosticCopy } from './useDiagnosticCopy';

/**
 * The document view's list of what the checks found, each with what to do
 * about it (spec 2026-09-26-rag-readiness-score-review, C3).
 *
 * Renders nothing when the key is off, when the file was never checked, and
 * when the checks found nothing. The first two are the rule from the spec's
 * Data model — absence is "not computed", and the panel must not turn it into
 * a clean bill of health. The third is the panel's own: a block that says
 * "all fine" above every document is noise, and the list badge already says
 * nothing in that case.
 */
export function DiagnosticsPanel({ metadata }: { metadata?: unknown }) {
  const t = useTranslations('document-diagnostics');
  const format = useFormatter();
  const copy = useDiagnosticCopy();
  const enabled = useOrgFeature('documentDiagnostics');

  if (!enabled) {
    return null;
  }
  const diagnostics = readDocumentDiagnostics(metadata);
  if (!diagnostics || diagnostics.findings.length === 0) {
    return null;
  }

  const computedAt = new Date(diagnostics.computedAt);
  const total = diagnostics.stats.chunkCount;

  return (
    <section
      aria-labelledby="document-diagnostics-title"
      data-testid="diagnostics-panel"
      className="mb-6 max-w-5xl rounded-md border border-border bg-background p-4"
    >
      <h2
        id="document-diagnostics-title"
        className="text-sm font-semibold text-foreground"
      >
        {t('title')}
      </h2>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {t('intro')}
        {!Number.isNaN(computedAt.getTime()) && (
          <>
            {' '}
            {t('checked-at', {
              date: format.dateTime(computedAt, {
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </>
        )}
      </p>
      <ul className="mt-3 divide-y divide-border">
        {sortFindings(diagnostics.findings).map((finding) => {
          const affected = finding.detail?.chunks;
          return (
            <li
              key={finding.check}
              data-testid={`diagnostic-${finding.check}`}
              className="py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium text-foreground">
                  {copy[finding.check].label}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {finding.severity === 'warn'
                    ? t('needs-attention')
                    : t('for-information')}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-muted-foreground">
                {copy[finding.check].advice}
              </p>
              {typeof affected === 'number' && total > 0 && (
                <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">
                  {t('affected', { count: affected, total })}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
