'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDownIcon } from '@heroicons/react/20/solid';

import { getAvailableModels } from '../../config';

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
  const t = useTranslations('assistant.model-selector');
  const availableModels = getAvailableModels();

  useEffect(() => {
    // Load saved model from localStorage on component mount
    try {
      const savedModel = localStorage.getItem(MODEL_STORAGE_KEY);
      if (savedModel && availableModels.some((m) => m.value === savedModel)) {
        onChange(savedModel);
      }
    } catch (error) {
      // Ignore localStorage errors
    }
  }, [onChange]);

  const handleModelChange = (newModel: string) => {
    if (newModel === selectedModel || disabled) return;

    onChange(newModel);
    setIsOpen(false);

    // Save selected model to localStorage
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, newModel);
    } catch (error) {
      // Ignore localStorage errors
    }
  };

  const selectedModelLabel =
    availableModels.find((m) => m.value === selectedModel)?.label ||
    selectedModel;

  // Get short version of model label for compact display
  const getShortLabel = (label: string) => {
    return label
      .replace('GPT-', '')
      .replace(' (32k context)', '-32k')
      .replace(' Turbo', '');
  };

  const shortLabel = getShortLabel(selectedModelLabel);

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
          {/* Overlay to close dropdown when clicking outside */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Dropdown menu - positioned above the button */}
          <div className="absolute bottom-full left-0 mb-1 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-20">
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
                    <span className="font-medium">{label}</span>
                    {value === organizationDefaultModel && (
                      <span className="text-xs text-gray-400">(default)</span>
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
