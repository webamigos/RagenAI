'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

import {
  AvailableModel,
  groupModelsByProvider,
  isReasoningModel,
} from '../../config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { statusToast } from '@/app/lib/utils/toast';
import { BrainIcon } from '@/libs/common-ui/icons/BrainIcon';
import { logger } from '@/app/lib/utils/logger';

type Props = {
  currentModel?: string;
  organizationDefaultModel?: string | null;
  onChange: (model: string) => void;
  disabled?: boolean;
};

export const ModelSelector = ({
  currentModel,
  organizationDefaultModel,
  onChange,
  disabled = false,
}: Props) => {
  const [selectedModel, setSelectedModel] = useState<string>(
    currentModel || organizationDefaultModel || 'gemini-2.0-flash'
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const isLoadingModels = useRef(false);

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant.model-selector');

  useEffect(() => {
    setSelectedModel(
      currentModel || organizationDefaultModel || 'gemini-2.0-flash'
    );
  }, [currentModel, organizationDefaultModel]);

  useEffect(() => {
    const loadAvailableModels = async () => {
      if (isLoadingModels.current) return;

      try {
        isLoadingModels.current = true;
        setModelsLoading(true);
        const models = await getAvailableModelsForOrganization();
        setAvailableModels(models);
      } catch (error) {
        logger.error('Failed to load available models');
        errorToast({
          message: 'Failed to load available models',
        });
      } finally {
        setModelsLoading(false);
        isLoadingModels.current = false;
      }
    };

    loadAvailableModels();
  }, []);

  const handleModelChange = async (newModel: string) => {
    if (newModel === selectedModel || isLoading || disabled) return;

    setIsLoading(true);
    try {
      await onChange(newModel);
      setSelectedModel(newModel);
      setIsOpen(false);
      successToast({
        message: t('model-updated', {
          model: availableModels.find((m) => m.value === newModel)?.label,
        }),
      });
    } catch (error) {
      errorToast({
        message: t('model-update-failed', { error: String(error) }),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const selectedModelLabel =
    availableModels.find((m) => m.value === selectedModel)?.label ||
    selectedModel;

  const groupedModels = groupModelsByProvider(availableModels);
  const isUsingDefault =
    !currentModel && selectedModel === organizationDefaultModel;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          inline-flex items-center px-2 py-1 text-xs font-medium rounded-md border
          ${
            disabled || isLoading
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer'
          }
          transition-colors duration-200
        `}
        aria-label={t('select-model')}
      >
        <span className="truncate max-w-20">
          {selectedModelLabel}
          {isUsingDefault && (
            <span className="text-gray-400 ml-1">(default)</span>
          )}
        </span>
        <ChevronDownIcon
          className={`ml-1 h-3 w-3 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-20">
            <div className="py-1">
              {modelsLoading ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Loading models...
                </div>
              ) : (
                groupedModels.map(({ provider, displayName, models }) => (
                  <div key={provider}>
                    <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                      {displayName}
                    </div>
                    {models.map(({ value, label }) => (
                      <button
                        key={value}
                        onClick={() => handleModelChange(value)}
                        className={`
                          w-full text-left px-4 py-2 text-sm transition-colors duration-200
                          ${
                            value === selectedModel
                              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                              : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                          }
                        `}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-1">
                            <span>{label}</span>
                            {isReasoningModel(value) && (
                              <BrainIcon className="h-3 w-3 text-gray-500" />
                            )}
                          </div>
                          {value === organizationDefaultModel && (
                            <span className="text-xs text-gray-400">
                              (org default)
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
