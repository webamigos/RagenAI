'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

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

export const SetApiKeys = () => {
  const [apiKey, setApiKey] = useState('');
  const [isEditable, setIsEditable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isWarning, setIsWarning] = useState(false);

  const t = useTranslations('set-openai-api-key');

  const { successToast, errorToast } = statusToast();

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const response = await fetchSettings();

        if (!response.success) {
          setIsWarning(true);
        }

        if (response.success) {
          setApiKey(response.data.apiKey);
        }
      } catch (error) {
        errorToast({ message: t('failed-to-fetch') });
      } finally {
        setLoading(false);
      }
    };

    loadApiKey();
  }, []);

  const handleSaveApiKey = async () => {
    try {
      const { success } = await saveSetting(SettingsType.apiKey, apiKey);
      if (success) {
        successToast({ message: t('save-successfully') });
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
    <div className="flex items-center space-x-4">
      <div className="relative w-3/4 flex items-end">
        <Input
          label="OpenAI API Key"
          value={apiKey}
          type="password"
          disabled={!isEditable}
          onChange={(e) => setApiKey(e.target.value)}
          containerClassName="w-full min-w-full"
        />
        {!isEditable ? (
          <button
            className="ml-2"
            onClick={() => setIsEditable(!isEditable)}
            aria-label="Edit API Key"
          >
            <Tooltip id="edit api key" content={t('edit')}>
              <LockClosedIcon />
            </Tooltip>
          </button>
        ) : (
          <button onClick={handleSaveApiKey} className="mb-0 ml-2">
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
    </div>
  );
};
