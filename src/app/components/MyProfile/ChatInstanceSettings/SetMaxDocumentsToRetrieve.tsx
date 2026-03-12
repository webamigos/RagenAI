'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { fetchSettings, saveSetting } from './actions';
import { statusToast } from '@/app/lib/utils/toast';
import { Slider } from '@/components/ui/slider';
import { SettingsType } from './types';
import {
  defaultOrganizationSettings,
  organizationSettingsLimits,
} from '@/features/organizations/constants/settings';

export const SetMaxDocumentsToRetrieve = () => {
  const [maxDocuments, setMaxDocuments] = useState<number>(
    defaultOrganizationSettings.maxDocumentsToRetrieve,
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const t = useTranslations('assistant-settings.max-documents-to-retreive');

  const { min, max, step } = organizationSettingsLimits.maxDocumentsToRetrieve;

  const update = async (value: number) => {
    try {
      const { success } = await saveSetting(
        SettingsType.maxDocumentsToRetrieve,
        value,
      );

      if (success) {
        successToast({
          message: successMessage('saved'),
        });
      }
    } catch (error) {
      errorToast({
        message: `${t('failed-to-update-max-documents')} ${error}`,
      });
    }
  };

  useEffect(() => {
    const fetchMaxDocuments = async () => {
      setIsLoading(true);
      try {
        const response = await fetchSettings();

        if (response.success) {
          setMaxDocuments(response.data.maxDocumentsToRetrieve);
        }
      } catch (error) {
        errorToast({
          message: `${t('failed-to-fetch-settings')} ${error}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaxDocuments();
  }, []);

  return (
    <div>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {t('title')}
      </label>
      <div className="mt-3 flex items-center gap-3">
        {isLoading ? (
          <div className="h-1.5 w-full animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
        ) : (
          <Slider
            aria-label={t('title')}
            min={min}
            max={max}
            step={step}
            value={[maxDocuments]}
            onValueChange={([val]) => setMaxDocuments(val)}
            onValueCommit={([val]) => update(val)}
          />
        )}
        <span className="w-8 shrink-0 tabular-nums text-sm text-zinc-500">
          {maxDocuments}
        </span>
      </div>
    </div>
  );
};
