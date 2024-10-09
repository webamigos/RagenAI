'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { fetchSettings, saveSetting } from './actions';
import { statusToast } from '@/app/lib/utils/toast';
import { Input, Text, Card } from '@salesyy/common-ui';
import { SettingsType } from './types';

export const SetChatTemperature = () => {
  const [temperature, setTemperature] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const errorMessage = useTranslations('error-toast');
  const t = useTranslations('set-temperature');

  const updateTemperature = async (temp: number) => {
    try {
      const { success } = await saveSetting(SettingsType.temperature, temp);

      if (success) {
        successToast({
          message: successMessage('saved'),
        });
      }
    } catch (error) {
      errorToast({
        message: `${errorMessage('failed-to-update-temperature')} ${error}`,
      });
    }
  };

  useEffect(() => {
    const fetchTemperature = async () => {
      setIsLoading(true);
      try {
        const response = await fetchSettings();

        if (response.success) {
          setTemperature(response.data.temperature);
        }
      } catch (error) {
        errorToast({
          message: `${errorMessage('failed-to-fetch-settings')} ${error}`,
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchTemperature();
  }, []);

  const handleTemperatureChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const temp = parseFloat(event.target.value);
    setTemperature(temp);
  };

  const handleSliderInteractionEnd = () => {
    updateTemperature(temperature);
  };

  return (
    <Card
      title={t('set-temperature')}
      size="full"
      className="mb-5 md:mb-0 md:mr-5"
    >
      <div className="flex items-center">
        <Input
          className="cursor-pointer"
          containerClassName="w-full"
          isLoading={isLoading}
          skeletonHeight="h-5"
          skeletonWidth="w-50"
          id="temperature"
          type="range"
          min={0}
          max={1}
          step={0.1}
          value={temperature}
          onChange={handleTemperatureChange}
          onMouseUp={handleSliderInteractionEnd}
          onTouchEnd={handleSliderInteractionEnd}
        />
        <Text className="ml-3 mt-4">{temperature}</Text>
      </div>
    </Card>
  );
};
