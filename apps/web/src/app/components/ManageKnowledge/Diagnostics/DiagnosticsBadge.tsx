'use client';

import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import {
  readDocumentDiagnostics,
  warningsOf,
} from '@ragenai/rag-core/document-diagnostics';
import { useTranslations } from 'next-intl';

import { useOrgFeature } from '@/app/hooks/useOrgFeatures';

import { useDiagnosticCopy } from './useDiagnosticCopy';

/**
 * A worded badge beside a file's name when its indexed chunks have a problem
 * someone can act on (spec 2026-09-26-rag-readiness-score-review, C3).
 *
 * Only `warn` findings, and only with `documentDiagnostics` on. Nothing at all
 * otherwise — not a "no problems" badge: a file with no diagnostics was not
 * checked, and a clean result is not worth a mark on every row.
 *
 * Neutral, like `RagScoreBadge`. Green, amber and crimson are the document and
 * job state vocabulary (panel rules 11, 16, 17), and "Table without headers"
 * is advice about the file, not its state. The word carries it (rule 27).
 */
export function DiagnosticsBadge({ metadata }: { metadata?: unknown }) {
  const t = useTranslations('document-diagnostics');
  const copy = useDiagnosticCopy();
  const enabled = useOrgFeature('documentDiagnostics');

  if (!enabled) {
    return null;
  }
  const warnings = warningsOf(readDocumentDiagnostics(metadata));
  if (warnings.length === 0) {
    return null;
  }

  const [first, ...rest] = warnings;
  const labels = warnings.map((finding) => copy[finding.check].label);

  return (
    <span
      title={labels.join(' · ')}
      data-testid="diagnostics-badge"
      className="ml-1.5 mt-0.5 inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium leading-none text-muted-foreground"
    >
      <ExclamationTriangleIcon aria-hidden className="size-3 shrink-0" />
      <span className="truncate">{copy[first.check].label}</span>
      {rest.length > 0 && (
        <span className="shrink-0 tabular-nums">
          {t('badge-more', { count: rest.length })}
        </span>
      )}
    </span>
  );
}
