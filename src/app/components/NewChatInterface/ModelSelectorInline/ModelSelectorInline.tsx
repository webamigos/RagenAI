'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid';
import { useOrganization, useAuth } from '@/app/hooks/use-auth';

import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';

import {
  type AvailableModel,
  groupModelsByOrigin,
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
  const { organization } = useOrganization();
  const { orgId: sessionOrgId } = useAuth();

  useEffect(() => {
    const loadAvailableModels = async () => {
      if (isLoadingModels.current) {
        return;
      }

      const orgId = organization?.id || sessionOrgId;

      if (!orgId) {
        logger.warn('No organization ID available, cannot load models');
        setModelsLoading(false);
        return;
      }

      try {
        isLoadingModels.current = true;
        setModelsLoading(true);
        const models = await getAvailableModelsForOrganization(orgId);
        setAvailableModels(models);
      } catch (error) {
        logger.error('Failed to load available models', error);
        errorToast({
          message: 'Failed to load available models',
        });
      } finally {
        setModelsLoading(false);
        isLoadingModels.current = false;
      }
    };

    loadAvailableModels();
  }, [organization?.id, sessionOrgId]);

  useEffect(() => {
    if (!modelsLoading && availableModels.length > 0) {
      let modelToUse = selectedModel;
      let shouldUpdateModel = false;

      try {
        const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
        if (savedModel && availableModels.some((m) => m.value === savedModel)) {
          modelToUse = savedModel;
          shouldUpdateModel = modelToUse !== selectedModel;
        } else if (
          organizationDefaultModel &&
          availableModels.some((m) => m.value === organizationDefaultModel) &&
          selectedModel !== organizationDefaultModel
        ) {
          modelToUse = organizationDefaultModel;
          shouldUpdateModel = true;
        }
      } catch (error) {
        logger.error('Failed to load model from localStorage');
        errorToast({
          message: 'Failed to load model from localStorage',
        });
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
    if (newModel === selectedModel || disabled) {
      return;
    }

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

  const groupedModels = groupModelsByOrigin(availableModels);

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={`
            inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs
            transition-colors duration-150
            ${
              disabled
                ? 'text-muted-foreground/50 cursor-not-allowed'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted cursor-pointer'
            }
          `}
          title={selectedModelLabel}
          aria-label={t('select-model')}
        >
          {isReasoningModel(selectedModel) && (
            <BrainIcon className="size-3 shrink-0" />
          )}
          <span className="truncate max-w-[120px]">{selectedModelLabel}</span>
          <ChevronUpDownIcon className="size-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        side="top"
        align="start"
        className="w-56 p-0 overflow-hidden"
      >
        {modelsLoading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <div className="size-4 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            <span className="ml-2">Loading...</span>
          </div>
        ) : (
          <div className="py-1">
            {groupedModels.map(({ origin, displayName, models }) => (
              <div key={origin}>
                <div className="px-3 py-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {displayName}
                </div>
                {models.map(({ value, label }) => {
                  const isSelected = value === selectedModel;
                  const isDefault = value === organizationDefaultModel;

                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => handleModelChange(value)}
                      className={`
                        flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors
                        ${
                          isSelected
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-muted'
                        }
                      `}
                    >
                      <span className="flex size-4 shrink-0 items-center justify-center">
                        {isSelected && <CheckIcon className="size-3.5" />}
                      </span>
                      <span className="flex-1 truncate text-left">{label}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {isReasoningModel(value) && (
                          <BrainIcon className="size-3 text-muted-foreground" />
                        )}
                        {isDefault && (
                          <span className="rounded bg-muted px-1 py-0.5 text-[0.625rem] text-muted-foreground">
                            default
                          </span>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
