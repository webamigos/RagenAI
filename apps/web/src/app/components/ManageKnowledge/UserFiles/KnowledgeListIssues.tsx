'use client';
import { useTranslations } from 'next-intl';
import { useOrgFeature } from '@/app/hooks/useOrgFeatures';
import {
  knowledgeListIssues,
  optimizationEligible,
} from '@/features/documents/utils/knowledge-list-issues';
import type { UserFileType } from '@/features/documents/contracts/document.types';
import { Link } from '@/i18n/routing';
import { Button } from '@/components/ui/button';

export function KnowledgeListIssues({
  files,
  onOptimize,
  onReprocess,
  disabled = false,
}: {
  files: UserFileType[];
  disabled?: boolean;
  onOptimize?: (ids: string[]) => void;
  onReprocess?: (ids: string[]) => void;
}) {
  const t = useTranslations('knowledge-list');
  const issues = knowledgeListIssues(
    files,
    useOrgFeature('documentDiagnostics'),
  );
  const optimizable = issues.headerless.filter(optimizationEligible);
  const tabular = issues.headerless.filter(
    (file) =>
      !optimizationEligible(file) &&
      file.document &&
      ['COMPLETED', 'WITHDRAWN', 'STAGED'].includes(file.embeddingStatus ?? ''),
  );
  if (!issues.headerless.length && !issues.noKnowledge.length) {
    return null;
  }
  return (
    <section
      aria-label={t('attention-title')}
      data-testid="knowledge-list-issues"
      className="mb-3 shrink-0"
    >
      <h2 className="mb-2 text-sm font-medium">
        {t('attention-title')}{' '}
        <span className="font-normal text-muted-foreground">
          {t('attention-scope')}
        </span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        {issues.headerless.length > 0 && (
          <div className="rounded-md border border-border bg-card p-3 text-sm">
            <p className="font-medium">
              {t('headerless-count', { count: issues.headerless.length })}
            </p>
            <p className="my-2 text-muted-foreground">
              {t('headerless-description')}
            </p>
            {onOptimize && optimizable.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onOptimize(optimizable.map((file) => file.id))}
              >
                {t('optimize-all')}
              </Button>
            )}{' '}
            {onReprocess && tabular.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={() => onReprocess(tabular.map((file) => file.id))}
              >
                {t('table-reprocess')}
              </Button>
            )}
          </div>
        )}
        {issues.noKnowledge.length > 0 && (
          <div className="rounded-md border border-border bg-card p-3 text-sm">
            <p className="font-medium">
              {t('empty-count', { count: issues.noKnowledge.length })}
            </p>
            <p className="my-2 text-muted-foreground">
              {t('empty-description')}
            </p>
            <Link
              href="/brain/documents?coverage=empty"
              className="text-primary underline underline-offset-4"
            >
              {t('show-brain')}
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
