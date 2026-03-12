'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';
import { useActiveOrganization } from '@/app/hooks/use-better-auth';

import {
  type AvailableModel,
  groupModelsByOrigin,
  isReasoningModel,
} from '../../config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { SettingsType } from './types';
import { defaultOrganizationSettings } from '@/features/organizations/constants/settings';
import { logger } from '@/app/lib/utils/logger';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
      if (!activeOrg?.id) {
        return;
      }

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

  const handleModelChange = async (newModel: string) => {
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

  const groupedModels = groupModelsByOrigin(availableModels);

  return (
    <div>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {t('title')}
      </label>
      <div className="mt-2">
        {isLoading || modelsLoading ? (
          <div className="h-9 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
        ) : (
          <Select
            value={model}
            onValueChange={handleModelChange}
            disabled={availableModels.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue
                placeholder={
                  availableModels.length === 0 ? t('no-models') : t('title')
                }
              />
            </SelectTrigger>
            <SelectContent position="popper">
              {groupedModels.map(({ origin, displayName, models }) => (
                <SelectGroup key={origin}>
                  <SelectLabel>{displayName}</SelectLabel>
                  {models.map(({ value, label }) => (
                    <SelectItem key={value} value={value}>
                      {isReasoningModel(value) ? `🧠 ${label}` : label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
};
