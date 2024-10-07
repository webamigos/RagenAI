'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { Card } from '@salesyy/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { updateModelSettings, fetchSettings } from '@/app/lib/services/api';

import { availableModels } from '../../config';

export const ChatModelSelect = () => {
  const [model, setModel] = useState<string>('gpt-3.5-turbo');

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const errorMessage = useTranslations('error-toast');

  useEffect(() => {
    const fetchModel = async () => {
      try {
        const { model } = await fetchSettings();
        setModel(model || 'gpt-3.5-turbo');
      } catch (error) {
        errorToast({
          message: `${errorMessage('failed-to-fetch-model')} ${error}`,
        });
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
      const { status } = await updateModelSettings(newModel);
      if (status === 200) {
        successToast({ message: successMessage('Model updated successfully') });
      }
    } catch (error) {
      errorToast({
        message: `${errorMessage('failed-to-update-model')} ${error}`,
      });
    }
  };

  return (
    <Card title="Select Model">
      <div className="mt-4">
        <label htmlFor="model" className="block text-sm font-medium leading-6">
          Choose Model:
        </label>
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
      </div>
    </Card>
  );
};
