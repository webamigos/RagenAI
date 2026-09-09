'use client';

import { useTranslations } from 'next-intl';
import { Switch } from '@/components/ui/switch';
import { InformationCircleIcon } from '@heroicons/react/20/solid';
import type { RagSettingsPageData } from '../actions';

type Props = {
  data: RagSettingsPageData;
};

function SettingRow({
  label,
  description,
  checked,
  note,
}: {
  label: string;
  description: string;
  checked: boolean;
  note?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground dark:text-white">
          {label}
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        {note && <p className="mt-1 text-xs text-pending">{note}</p>}
      </div>
      <Switch
        checked={checked}
        disabled
        onCheckedChange={() => {}}
        className="shrink-0"
      />
    </div>
  );
}

export function RagSettingsView({ data }: Props) {
  const t = useTranslations('organization-page.rag-settings');
  const { ragSettings, budgetCents, models, isOnPremise } = data;

  return (
    <>
      {/* Header */}
      <section>
        <h2 className="text-base font-semibold text-foreground dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('description')}</p>
      </section>

      {/* Info banner */}
      {!isOnPremise && (
        <div className="flex items-start gap-3 rounded-lg border border-primary/40 bg-accent px-4 py-3 dark:bg-primary/50">
          <InformationCircleIcon className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="text-sm text-primary">{t('on-premise-note')}</p>
        </div>
      )}

      {/* Pipeline toggles */}
      <section className="divide-y divide-border">
        <SettingRow
          label={t('multi-query-label')}
          description={t('multi-query-description')}
          checked={ragSettings.multiQueryEnabled}
        />
        <SettingRow
          label={t('doc-summaries-label')}
          description={t('doc-summaries-description')}
          checked={ragSettings.docSummariesEnabled}
        />
        <SettingRow
          label={t('content-moderation-label')}
          description={t('content-moderation-description')}
          checked={ragSettings.contentModerationEnabled}
          note={!isOnPremise ? t('content-moderation-saas-note') : undefined}
        />
        <SettingRow
          label={t('reranking-label')}
          description={t('reranking-description')}
          checked={ragSettings.rerankingEnabled}
        />
      </section>

      <hr className="border-border" />

      {/* Models in use */}
      <section>
        <h3 className="text-sm font-semibold text-foreground dark:text-white">
          {t('models-title')}
        </h3>
        <dl className="mt-3 space-y-2">
          <ModelRow label={t('model-answer')} value={models.answer} />
          <ModelRow label={t('model-embedding')} value={models.embedding} />
          <ModelRow label={t('model-rephrase')} value={models.rephrase} />
          <ModelRow label={t('model-reranking')} value={models.reranking} />
        </dl>
      </section>

      <hr className="border-border" />

      {/* Budget */}
      <section>
        <h3 className="text-sm font-semibold text-foreground dark:text-white">
          {t('budget-title')}
        </h3>
        <p className="mt-2 text-sm text-muted-foreground">
          {budgetCents != null
            ? `$${(budgetCents / 100).toFixed(2)}`
            : t('budget-no-limit')}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('budget-managed-by-admin')}
        </p>
      </section>
    </>
  );
}

function ModelRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-xs text-foreground">{value}</dd>
    </div>
  );
}
