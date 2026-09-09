'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { fetchSettings, saveSetting } from './actions';
import { statusToast } from '@/app/lib/utils/toast';
import { Slider } from '@/components/ui/slider';
import { SettingsType } from './types';
import { defaultOrganizationSettings } from '@/features/organizations/constants/settings';

export const SetChatTemperature = () => {
  const [temperature, setTemperature] = useState<number>(
    defaultOrganizationSettings.temperature,
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const t = useTranslations('assistant-settings.set-temperature');

  const updateTemperature = async (temp: number) => {
    try {
      const { success } = await saveSetting(SettingsType.temperature, temp);

      if (success) {
        successToast({
          message: successMessage('saved'),
        });
      }
    } catch (error) {
      errorToast({
        message: `${t('failed-to-update-temperature')} ${error}`,
      });
    }
  };

  useEffect(() => {
    const fetchTemperature = async () => {
      setIsLoading(true);
      try {
        const response = await fetchSettings();

        if (response.success) {
          setTemperature(response.data.temperature);
        }
      } catch (error) {
        errorToast({
          message: `${t('failed-to-fetch-settings')} ${error}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemperature();
  }, []);

  return (
    <div>
      <label className="text-sm font-medium text-foreground">
        {t('title')}
      </label>
      <div className="mt-3 flex items-center gap-3">
        {isLoading ? (
          <div className="h-1.5 w-full animate-pulse rounded-full bg-paper-200 dark:bg-paper-700" />
        ) : (
          <Slider
            aria-label={t('title')}
            min={0}
            max={1}
            step={0.1}
            value={[temperature]}
            onValueChange={([val]) => setTemperature(val)}
            onValueCommit={([val]) => updateTemperature(val)}
          />
        )}
        <span className="w-8 shrink-0 tabular-nums text-sm text-muted-foreground">
          {temperature}
        </span>
      </div>
    </div>
  );
};
