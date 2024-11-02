'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { fetchSettings, saveSetting } from './actions';
import { statusToast } from '@/app/lib/utils/toast';
import { Input, Text, Card } from '@salesyy/common-ui';
import { SettingsType } from './types';
import {
  defaultOrganizationSettings,
  organizationSettingsLimits,
} from '@/app/lib/constants/settings';

export const SetMaxDocumentsToRetrieve = () => {
  const [maxDocuments, setMaxDocuments] = useState<number>(
    defaultOrganizationSettings.maxDocumentsToRetrieve
  );

  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const errorMessage = useTranslations('error-toast');
  const t = useTranslations('max-documents-to-retreive');

  const { min, max, step } = organizationSettingsLimits.maxDocumentsToRetrieve;

  const update = async (value: number) => {
    try {
      const { success } = await saveSetting(
        SettingsType.maxDocumentsToRetrieve,
        value
      );

      if (success) {
        successToast({
          message: successMessage('saved'),
        });
      }
    } catch (error) {
      errorToast({
        message: `${errorMessage('failed-to-update-max-documents')} ${error}`,
      });
    }
  };

  useEffect(() => {
    const fetchMaxDocuments = async () => {
      setIsLoading(true);
      try {
        const response = await fetchSettings();

        if (response.success) {
          setMaxDocuments(response.data.maxDocumentsToRetrieve);
        }
      } catch (error) {
        errorToast({
          message: `${errorMessage('failed-to-fetch-settings')} ${error}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchMaxDocuments();
  }, []);

  const handleValueChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(event.target.value);
    setMaxDocuments(value);
  };

  const handleSliderInteractionEnd = () => {
    update(maxDocuments);
  };

  return (
    <Card title={t('input-label')} size="full">
      <div className="flex items-center">
        <Input
          className="cursor-pointer"
          containerClassName="w-full"
          isLoading={isLoading}
          skeletonHeight="h-5"
          skeletonWidth="w-50"
          id="max-documents"
          type="range"
          min={min}
          max={max}
          step={step}
          value={maxDocuments}
          onChange={handleValueChange}
          onMouseUp={handleSliderInteractionEnd}
          onTouchEnd={handleSliderInteractionEnd}
        />
        <Text className="ml-3 mt-4">{maxDocuments}</Text>
      </div>
    </Card>
  );
};
