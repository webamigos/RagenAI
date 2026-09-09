'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

import {
  type AvailableModel,
  groupModelsByOrigin,
  isReasoningModel,
} from '../../config';
import { getAvailableModelsForOrganization } from '@/app/lib/actions/checkAvailableProviders';
import { statusToast } from '@/app/lib/utils/toast';
import { BrainIcon } from '@/libs/common-ui/icons/BrainIcon';
import { logger } from '@/app/lib/utils/logger';
import { useOrganization } from '@/app/hooks/use-auth';

type Props = {
  currentModel?: string;
  organizationDefaultModel?: string | null;
  onChange: (model: string) => void;
  disabled?: boolean;
};

const ModelSelectorImpl = ({
  currentModel,
  organizationDefaultModel,
  onChange,
  disabled = false,
}: Props) => {
  const [selectedModel, setSelectedModel] = useState<string>(
    currentModel || organizationDefaultModel || 'google/gemini-3-flash-preview',
  );
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [availableModels, setAvailableModels] = useState<AvailableModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(true);
  const isLoadingModels = useRef(false);

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant.model-selector');
  const { organization } = useOrganization();

  useEffect(() => {
    setSelectedModel(
      currentModel ||
        organizationDefaultModel ||
        'google/gemini-3-flash-preview',
    );
  }, [currentModel, organizationDefaultModel]);

  useEffect(() => {
    const loadAvailableModels = async () => {
      if (isLoadingModels.current || !organization?.id) {
        return;
      }

      try {
        isLoadingModels.current = true;
        setModelsLoading(true);
        const models = await getAvailableModelsForOrganization(organization.id);
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
  }, [organization?.id]);

  const handleModelChange = async (newModel: string) => {
    if (newModel === selectedModel || isLoading || disabled) {
      return;
    }

    setIsLoading(true);
    try {
      await onChange(newModel);
      setSelectedModel(newModel);
      setIsOpen(false);
      successToast({
        message: t('model-updated', {
          model:
            availableModels.find((m) => m.value === newModel)?.label ||
            newModel,
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

  const groupedModels = groupModelsByOrigin(availableModels);
  const isUsingDefault =
    !currentModel && selectedModel === organizationDefaultModel;

  return (
    <div className="relative">
      <button
        onClick={() => !disabled && !isLoading && setIsOpen(!isOpen)}
        disabled={disabled || isLoading}
        className={`
          inline-flex h-7 items-center px-2 py-1 text-xs font-medium rounded-md border
          ${
            disabled || isLoading
              ? 'bg-muted text-muted-foreground border-border cursor-not-allowed'
              : 'bg-card dark:bg-muted text-foreground border-border hover:bg-muted dark:hover:bg-paper-700 cursor-pointer'
          }
          transition-colors duration-200
        `}
        aria-label={t('select-model')}
      >
        <span className="truncate max-w-20">
          {selectedModelLabel}
          {isUsingDefault && (
            <span className="text-muted-foreground ml-1">(default)</span>
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

          <div className="absolute top-full mt-1 w-48 bg-card dark:bg-muted border border-border rounded-md shadow-lg z-20">
            <div className="py-1">
              {modelsLoading ? (
                <div className="px-3 py-2 text-sm text-muted-foreground">
                  Loading models...
                </div>
              ) : (
                groupedModels.map(({ origin, displayName, models }) => (
                  <div key={origin}>
                    <div className="px-3 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border bg-muted dark:bg-paper-700/50">
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
                              ? 'bg-accent dark:bg-primary/20 text-primary'
                              : 'text-foreground hover:bg-muted dark:hover:bg-paper-700'
                          }
                        `}
                      >
                        <div className="flex justify-between items-center">
                          <div className="flex items-center gap-1">
                            <span>{label}</span>
                            {isReasoningModel(value) && (
                              <BrainIcon className="h-3 w-3 text-muted-foreground" />
                            )}
                          </div>
                          {value === organizationDefaultModel && (
                            <span className="text-xs text-muted-foreground">
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

export const ModelSelector = (props: Props) => {
  if (process.env.NEXT_PUBLIC_HIDE_MODEL_SELECTOR === '1') {
    return null;
  }
  return <ModelSelectorImpl {...props} />;
};
