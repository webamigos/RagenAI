'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@salesyy/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';

import { availableModels } from '../../config';
import { SettingsType } from './types';

export const ChatModelSelect = ({}) => {
  const [model, setModel] = useState<string>('gpt-3.5-turbo');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const errorMessage = useTranslations('error-toast');

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
          message: `${errorMessage('failed-to-fetch-model')} ${error}`,
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
        successToast({ message: successMessage('Model updated successfully') });
      }
    } catch (error) {
      errorToast({
        message: `${errorMessage('failed-to-update-model')} ${error}`,
      });
    }
  };

  return (
    <Card title="Select Model" size="lg">
      <div className="mt-4">
        <label htmlFor="model" className="block text-sm font-medium leading-6">
          Choose Model:
        </label>
        {isLoading ? (
          <div
            className={`animate-pulse h-11 w-auto bg-gray-300 dark:bg-slate-700 rounded-md`}
          />
        ) : (
          <select
            id="model"
            value={model}
            onChange={handleModelChange}
            className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
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
