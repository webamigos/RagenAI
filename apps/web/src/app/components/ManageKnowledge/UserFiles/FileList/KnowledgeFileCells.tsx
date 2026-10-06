'use client';
import { useTranslations } from 'next-intl';
import {
  readDocumentDiagnostics,
  warningsOf,
} from '@ragenai/rag-core/document-diagnostics';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';
import { StatusBadge } from '@/components/ui/status-badge';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import { canOptimizeDocument } from '@/features/documents/utils/tabular-documents';
import { useDiagnosticCopy } from '../../Diagnostics/useDiagnosticCopy';
import { RagScoreBadge } from './RagScoreBadge';

export function BrainCoverageCell({ file }: { file: UserFileType }) {
  const t = useTranslations('knowledge-list');
  const counts = file.brainCoverage;
  if (!counts) {
    return (
      <span className="text-muted-foreground">{t('brain-unavailable')}</span>
    );
  }
  if (counts.approved || counts.candidates) {
    return (
      <span className="tabular-nums" data-testid="file-brain-coverage">
        {t('coverage', counts)}
      </span>
    );
  }
  if (
    file.embeddingStatus === 'COMPLETED' ||
    file.embeddingStatus === 'WITHDRAWN' ||
    file.embeddingStatus === 'STAGED'
  ) {
    return <StatusBadge state="failed" label={t('no-knowledge')} />;
  }
  return (
    <span className="text-muted-foreground">{t('waiting-knowledge')}</span>
  );
}

export function ChatQualityCell({
  file,
  status,
  onOptimize,
}: {
  file: UserFileType;
  status: React.ReactNode;
  onOptimize?: (ids: string[]) => void;
}) {
  const t = useTranslations('knowledge-list');
  const copy = useDiagnosticCopy();
  const enabled = useOrgFeature('documentDiagnostics');
  const report = enabled ? readDocumentDiagnostics(file.metadata) : null;
  const warnings = warningsOf(report);
  const ready =
    file.embeddingStatus === 'COMPLETED' ||
    file.embeddingStatus === 'WITHDRAWN' ||
    file.embeddingStatus === 'STAGED';
  let quality: React.ReactNode = status;
  if (ready) {
    if (warnings.length) {
      quality = (
        <>
          <span
            className="text-sm text-muted-foreground"
            title={warnings.map((w) => copy[w.check].advice).join(' ')}
          >
            {warnings.map((w) => copy[w.check].label).join(' · ')}
          </span>
          {file.document && onOptimize && canOptimizeDocument(file) && (
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-4"
              onClick={(e) => {
                e.stopPropagation();
                onOptimize([file.id]);
              }}
            >
              {t('optimize')}
            </button>
          )}
        </>
      );
    } else {
      quality = (
        <span className={report ? 'text-foreground' : 'text-muted-foreground'}>
          {report ? t('quality-ok') : t('quality-unknown')}
        </span>
      );
    }
  }
  return (
    <div
      data-testid="file-chat-quality"
      className="flex flex-col items-start gap-1"
    >
      {quality}
      {ready && file.embeddingStatus !== 'COMPLETED' && status}
      <RagScoreBadge metadata={file.metadata} />
    </div>
  );
}
