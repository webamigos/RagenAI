'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { fetchPublicChatModelAction, saveSetting } from './actions';
import { useActiveOrganization } from '@/app/hooks/use-better-auth';

import {
  type AvailableModel,
  groupModelsByOrigin,
  isReasoningModel,
} from '../../config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { SettingsType } from './types';
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

const DEFAULT_PUBLIC_MODEL = 'gemini-3-flash-preview';

export const PublicChatModelSelect = () => {
  const [model, setModel] = useState<string>(DEFAULT_PUBLIC_MODEL);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant-settings.public-chat-model');
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
          message: `Failed to load models: ${error}`,
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
        const response = await fetchPublicChatModelAction();
        if (response.success && response.data?.publicChatModel) {
          setModel(response.data.publicChatModel);
        }
      } catch (error) {
        logger.error({ error }, 'Failed to fetch public chat model');
      } finally {
        setIsLoading(false);
      }
    };

    fetchModel();
  }, []);

  const handleModelChange = async (newModel: string) => {
    const previous = model;
    setModel(newModel);

    try {
      const { success } = await saveSetting(
        SettingsType.publicChatModel,
        newModel,
      );
      if (success) {
        successToast({ message: t('updated') });
      } else {
        setModel(previous);
        errorToast({ message: t('update-failed') });
      }
    } catch (error) {
      setModel(previous);
      logger.error({ error }, 'Failed to update public chat model');
      errorToast({ message: t('update-failed') });
    }
  };

  const groupedModels = groupModelsByOrigin(availableModels);

  return (
    <div>
      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        {t('title')}
      </label>
      <p className="text-xs text-muted-foreground mt-1 mb-2">
        {t('description')}
      </p>
      <div>
        {isLoading || modelsLoading ? (
          <div className="h-9 w-full animate-pulse rounded-md bg-zinc-200 dark:bg-zinc-700" />
        ) : (
          <Select
            value={model}
            onValueChange={handleModelChange}
            disabled={availableModels.length === 0}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t('title')} />
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
