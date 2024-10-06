'use client';

import { useEffect, useState } from 'react';

import {
  Input,
  Card,
  PencilIcon,
  EnterIcon,
  SpinnerSVG,
  LockClosedIcon,
} from '@salesyy/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { saveApiKey, fetchApiKey } from '@/app/lib/services/api';

export const SetApiKeys = () => {
  const [apiKey, setApiKey] = useState('');
  const [isEditable, setIsEditable] = useState(false);
  const [loading, setLoading] = useState(true);

  const { successToast, errorToast } = statusToast();

  useEffect(() => {
    const loadApiKey = async () => {
      try {
        const { data } = await fetchApiKey();

        if (data.apiKey) {
          setApiKey(data.apiKey);
        }
      } catch (error) {
        errorToast({ message: 'Failed to fetch API Key' });
      } finally {
        setLoading(false);
      }
    };

    loadApiKey();
  }, []);

  const handleSaveApiKey = async () => {
    try {
      const { status } = await saveApiKey(apiKey);

      if (status === 200) {
        successToast({ message: 'API Key saved successfully' });
        setIsEditable(false);
      } else {
        throw new Error('Failed to save API key');
      }
    } catch (error) {
      errorToast({ message: `Error: ${error}` });
    }
  };

  if (loading) {
    return <SpinnerSVG />;
  }

  return (
    <Card title="Set Environment Variables" size="full" className="mb-5">
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
          <button
            className="ml-2"
            onClick={() => setIsEditable(!isEditable)}
            aria-label="Edit API Key"
          >
            <PencilIcon />
          </button>
          {isEditable && (
            <button onClick={handleSaveApiKey} className="mb-0 ml-2">
              <LockClosedIcon />
            </button>
          )}
        </div>
      </div>
    </Card>
  );
};
