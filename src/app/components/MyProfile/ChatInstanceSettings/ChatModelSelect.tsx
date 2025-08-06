'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';

import { getAvailableModels } from '../../config';
import { SettingsType } from './types';
import { defaultOrganizationSettings } from '@/app/lib/constants/settings';

export const ChatModelSelect = ({}) => {
  const [model, setModel] = useState<string>(defaultOrganizationSettings.model);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant-settings.model-select');
  const availableModels = getAvailableModels();

  useEffect(() => {
    const fetchModel = async () => {
      setIsLoading(true);
      try {
        const response = await fetchSettings();
        if (response.success) {
          setModel(response.data.model);
        }
      } catch (error) {
        errorToast({
          message: `${t('failed-to-fetch-model')} ${error}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchModel();
  }, []);

  const handleModelChange = async (
    event: React.ChangeEvent<HTMLSelectElement>
  ) => {
    const newModel = event.target.value;
    setModel(newModel);

    try {
      const { success } = await saveSetting(SettingsType.model, newModel);
      if (success) {
        successToast({ message: t('model-updated-successfully') });
      }
    } catch (error) {
      errorToast({
        message: `${t('failed-to-update-model')} ${error}`,
      });
    }
  };

  return (
    <Card title={t('title')} size="full">
      <div className="mt-4">
        {isLoading ? (
          <div
            className={`animate-pulse h-11 w-auto bg-gray-300 dark:bg-slate-700 rounded-md`}
          />
        ) : (
          <select
            id="model"
            value={model}
            onChange={handleModelChange}
            className="mt-1 block w-full p-2 border border-primary-blue-500 dark:border-gray-600 dark:bg-accent-dark-500 rounded-md shadow-xs cursor-pointer"
          >
            {availableModels.map(({ value, label }) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        )}
      </div>
    </Card>
  );
};
