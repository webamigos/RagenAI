'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@ragenai/common-ui/Card';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';
import { useActiveOrganization } from '@/app/hooks/use-better-auth';

import {
  AvailableModel,
  groupModelsByProvider,
  isReasoningModel,
} from '../../config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { SettingsType } from './types';
import { defaultOrganizationSettings } from '@/features/organizations/constants/settings';
import { logger } from '@/app/lib/utils/logger';

export const ChatModelSelect = ({}) => {
  const [model, setModel] = useState<string>(defaultOrganizationSettings.model);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant-settings.model-select');
  const { data: activeOrg } = useActiveOrganization();

  useEffect(() => {
    const loadAvailableModels = async () => {
      if (!activeOrg?.id) return;

      try {
        setModelsLoading(true);
        const models = await getAvailableModelsForOrganization(activeOrg.id);
        setAvailableModels(models);
      } catch (error) {
        errorToast({
          message: `${t('failed-to-fetch-models')} ${error}`,
        });
      } finally {
        setModelsLoading(false);
      }
    };

    loadAvailableModels();
  }, [activeOrg?.id]);

  useEffect(() => {
    const fetchModel = async () => {
      setIsLoading(true);
      try {
        const response = await fetchSettings();
        if (response.success) {
          setModel(response.data.model);
        }
      } catch (error) {
        logger.error({ error }, 'Failed to fetch model');
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
      logger.error({ error }, 'Failed to update model');
      errorToast({
        message: `${t('failed-to-update-model')} ${error}`,
      });
    }
  };

  const groupedModels = groupModelsByProvider(availableModels);

  return (
    <Card title={t('title')} size="full">
      <div className="mt-4">
        {isLoading || modelsLoading ? (
          <div
            className={`animate-pulse h-11 w-auto bg-gray-300 dark:bg-slate-700 rounded-md`}
          />
        ) : (
          <select
            id="model"
            value={model}
            onChange={handleModelChange}
            className="mt-1 block w-full p-2 border border-primary-blue-500 dark:border-gray-600 dark:bg-accent-dark-500 rounded-md shadow-xs cursor-pointer"
            disabled={availableModels.length === 0}
          >
            {availableModels.length === 0 ? (
              <option value="">No models available</option>
            ) : (
              groupedModels.map(({ provider, displayName, models }) => (
                <optgroup key={provider} label={displayName}>
                  {models.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {isReasoningModel(value) ? `🧠 ${label}` : label}
                    </option>
                  ))}
                </optgroup>
              ))
            )}
          </select>
        )}
      </div>
    </Card>
  );
};
