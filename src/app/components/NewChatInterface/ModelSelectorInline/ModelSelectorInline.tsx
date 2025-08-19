'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

import {
  AvailableModel,
  groupModelsByProvider,
  isReasoningModel,
} from '../../config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { BrainIcon } from '@/libs/common-ui/icons/BrainIcon';
import { logger } from '@/app/lib/utils/logger';
import { statusToast } from '@/app/lib/utils/toast';

type Props = {
  selectedModel: string;
  organizationDefaultModel?: string;
  onChange: (model: string) => void;
  disabled?: boolean;
};

const MODEL_STORAGE_KEY = 'preferred_model_selection';

export const ModelSelectorInline = ({
  selectedModel,
  organizationDefaultModel,
  onChange,
  disabled = false,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const isLoadingModels = useRef(false);
  const t = useTranslations('assistant.model-selector');
  const { errorToast } = statusToast();

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

  useEffect(() => {
    if (!modelsLoading && availableModels.length > 0) {
      let modelToUse = selectedModel;
      let shouldUpdateModel = false;

      if (
        organizationDefaultModel &&
        availableModels.some((m) => m.value === organizationDefaultModel)
      ) {
        modelToUse = organizationDefaultModel;
        shouldUpdateModel = true;
      } else if (!organizationDefaultModel) {
        try {
          const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
          if (
            savedModel &&
            availableModels.some((m) => m.value === savedModel)
          ) {
            modelToUse = savedModel;
            shouldUpdateModel = modelToUse !== selectedModel;
          }
        } catch (error) {
          logger.error('Failed to load model from localStorage');
          errorToast({
            message: 'Failed to load model from localStorage',
          });
        }
      }

      if (modelToUse && shouldUpdateModel) {
        onChange(modelToUse);
      }
    }
  }, [
    modelsLoading,
    availableModels,
    onChange,
    selectedModel,
    organizationDefaultModel,
  ]);

  const handleModelChange = (newModel: string) => {
    if (newModel === selectedModel || disabled) return;

    onChange(newModel);
    setIsOpen(false);

    try {
      localStorage.setItem(MODEL_STORAGE_KEY, newModel);
    } catch (error) {
      logger.error('Failed to save model to localStorage');
      errorToast({
        message: 'Failed to save model to localStorage',
      });
    }
  };

  const selectedModelLabel =
    availableModels.find((m) => m.value === selectedModel)?.label ||
    selectedModel;

  const getShortLabel = (label: string) => {
    return label
      .replace('GPT-', '')
      .replace(' (32k context)', '-32k')
      .replace(' Turbo', '');
  };

  const shortLabel = getShortLabel(selectedModelLabel);
  const groupedModels = groupModelsByProvider(availableModels);

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          inline-flex items-center mb-1 px-3 py-1.5 text-sm font-medium rounded border
          ${
            disabled
              ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
              : 'bg-white/90 dark:bg-gray-800/90 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-600 hover:bg-white dark:hover:bg-gray-700 cursor-pointer'
          }
          transition-colors duration-200 backdrop-blur-sm shadow-sm
        `}
        title={selectedModelLabel}
        aria-label={t('select-model')}
      >
        <span className="text-sm font-mono truncate max-w-[70px]">
          {shortLabel}
        </span>
        <ChevronDownIcon
          className={`ml-1 h-4 w-4 transition-transform duration-200 ${
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

          <div className="absolute bottom-full left-0 mb-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-20">
            <div className="py-1">
              {modelsLoading ? (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  Loading models...
                </div>
              ) : (
                groupedModels.map(({ provider, displayName, models }) => (
                  <div key={provider}>
                    {/* Provider header */}
                    <div className="px-3 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                      {displayName}
                    </div>
                    {/* Models in this provider */}
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
                            <span className="font-medium">{label}</span>
                            {isReasoningModel(value) && (
                              <BrainIcon className="h-3 w-3 text-gray-500" />
                            )}
                          </div>
                          {value === organizationDefaultModel && (
                            <span className="text-xs text-gray-400">
                              (default)
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
