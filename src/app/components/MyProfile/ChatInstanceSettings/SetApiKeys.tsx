'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

import {
  Input,
  LockClosedIcon,
  OpenLockIcon,
  WarningIcon,
  Tooltip,
} from '@salesyy/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { fetchSettings, saveSetting } from './actions';
import { SettingsType } from './types';

const apiKeySchema = z.object({
  apiKey: z.string().min(10, 'API key must be at least 10 characters long'),
});

type apiSchemaData = z.infer<typeof apiKeySchema>;

export const SetApiKeys = () => {
  const [isEditable, setIsEditable] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const initialApiKeyRef = useRef('');

  const t = useTranslations('set-openai-api-key');
  const { successToast, errorToast } = statusToast();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isDirty },
  } = useForm({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      apiKey: '',
    },
  });

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const response = await fetchSettings();

        if (!response.success) {
          setIsWarning(true);
          errorToast({ message: t('failed-to-fetch') });
        } else {
          const fetchedApiKey = response.data.apiKey;
          setValue('apiKey', fetchedApiKey);
          initialApiKeyRef.current = fetchedApiKey;
        }
      } catch (error) {
        errorToast({ message: t('failed-to-fetch') });
      } finally {
        setLoading(false);
      }
    };

    loadApiKey();
  }, []);

  const onSubmit = async (data: apiSchemaData) => {
    if (!isDirty || data.apiKey === initialApiKeyRef.current) {
      setIsEditable(false);
      return;
    }

    try {
      const { success } = await saveSetting(SettingsType.apiKey, data.apiKey);
      if (success) {
        successToast({ message: t('save-successfully') });
        initialApiKeyRef.current = data.apiKey;
        setIsEditable(false);
        setIsWarning(false);
      } else {
        throw new Error('Failed to save API key');
      }
    } catch (error) {
      errorToast({ message: `Error: ${error}` });
    }
  };

  return loading ? (
    <div className="animate-pulse">
      <div className="h-16 bg-gray-300 rounded-md w-3/4" />
    </div>
  ) : (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex items-center space-x-4"
    >
      <div className="relative w-3/4 flex items-end">
        <Input
          label="OpenAI API Key"
          type="password"
          error={errors.apiKey}
          errorMessage={errors.apiKey?.message}
          disabled={!isEditable}
          {...register('apiKey')}
          containerClassName="w-full min-w-full"
        />
        {!isEditable ? (
          <button
            type="button"
            className="ml-2"
            onClick={() => setIsEditable(true)}
            aria-label="Edit API Key"
          >
            <Tooltip id="edit api key" content={t('edit')}>
              <LockClosedIcon />
            </Tooltip>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => handleSubmit(onSubmit)()}
            className="mb-0 ml-2"
          >
            <Tooltip id="save api key" content={t('save')}>
              <OpenLockIcon />
            </Tooltip>
          </button>
        )}
        {isWarning && (
          <span>
            <Tooltip id="no-key-warning" content={t('no-api-key-warning')}>
              <WarningIcon className="-mb-0.5 ml-2 text-yellow-600 cursor-pointer" />
            </Tooltip>
          </span>
        )}
      </div>
    </form>
  );
};
