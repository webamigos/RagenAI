'use client';

import { useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { Checkbox } from '@ragenai/tui';
import { logger } from '@/app/lib/utils/logger';
import {
  saveOrgConnectorsAction,
  type AvailableConnectorInfo,
} from './actions';

type OrgConnectorsViewProps = {
  available: AvailableConnectorInfo[];
  orgEnabled: string[];
};

export function OrgConnectorsView({
  available,
  orgEnabled,
}: OrgConnectorsViewProps) {
  const t = useTranslations('organization-page.connectors');
  const tProviders = useTranslations('settings-page.connectors.providers');
  const [selected, setSelected] = useState<Set<string>>(new Set(orgEnabled));
  const [saving, setSaving] = useState(false);

  const handleToggle = useCallback(
    async (provider: string, checked: boolean) => {
      const prev = new Set(selected);
      const next = new Set(selected);
      if (checked) {
        next.add(provider);
      } else {
        next.delete(provider);
      }

      setSelected(next);
      setSaving(true);

      try {
        const result = await saveOrgConnectorsAction(Array.from(next));
        if (!result.success) {
          setSelected(prev);
        }
      } catch (error) {
        logger.error('Failed to save connector settings', { error });
        setSelected(prev);
      } finally {
        setSaving(false);
      }
    },
    [selected],
  );

  return (
    <div className="max-w-2xl space-y-4">
      <section>
        <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
          {t('title')}
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          {t('description')}
        </p>
      </section>

      <div className="space-y-2">
        {available.map(({ provider, icon }) => (
          <div
            key={provider}
            className="flex items-center gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg">
              {icon ? <img src={icon} alt="" className="size-6" /> : null}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-medium text-zinc-950 dark:text-white">
                {tProviders(`${provider}.name`)}
              </h3>
              <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                {tProviders(`${provider}.description`)}
              </p>
            </div>
            <Checkbox
              checked={selected.has(provider)}
              onChange={(checked) => handleToggle(provider, checked)}
              disabled={saving}
            />
          </div>
        ))}
      </div>

      {available.length === 0 && (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {t('no-connectors')}
        </p>
      )}

      <p className="text-xs text-zinc-400 dark:text-zinc-500">{t('hint')}</p>
    </div>
  );
}
