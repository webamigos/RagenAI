'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

import { getAvailableModels } from '../../config';
import { statusToast } from '@/app/lib/utils/toast';

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

  const { successToast, errorToast } = statusToast();
  const t = useTranslations('assistant.model-selector');
  const availableModels = getAvailableModels();

  useEffect(() => {
    setSelectedModel(
      currentModel || organizationDefaultModel || 'gemini-2.0-flash'
    );
  }, [currentModel, organizationDefaultModel]);

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
          {/* Overlay to close dropdown when clicking outside */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown menu */}
          <div className="absolute top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-20">
            <div className="py-1">
              {availableModels.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => handleModelChange(value)}
                  className={`
                    w-full text-left px-3 py-2 text-sm transition-colors duration-200
                    ${
                      value === selectedModel
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <div className="flex justify-between items-center">
                    <span>{label}</span>
                    {value === organizationDefaultModel && (
                      <span className="text-xs text-gray-400">
                        (org default)
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
