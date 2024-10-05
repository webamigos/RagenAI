'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { statusToast } from '@/app/lib/utils/toast';
import { Input, Text, Card } from '@salesyy/common-ui';
import {
  fetchSettings,
  updateTemperatureSettings,
} from '@/app/lib/services/api';

export const SetChatTemperature = () => {
  const [temperature, setTemperature] = useState<number>(0.7);

  const { successToast, errorToast } = statusToast();
  const successMessage = useTranslations('success-toast');
  const errorMessage = useTranslations('error-toast');

  const updateTemperature = async (temp: number) => {
    try {
      const { status } = await updateTemperatureSettings(temp);

      if (status === 200) {
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
      try {
        const { temperature } = await fetchSettings();
        setTemperature(temperature || 0.7);
      } catch (error) {
        errorToast({
          message: `${errorMessage('failed-to-fetch-settings')} ${error}`,
        });
      }
    };

    fetchTemperature();
  }, [errorMessage, errorToast]);

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
    <Card title="Set temperature">
      <div className="flex items-center">
        <Input
          containerClassName="w-full"
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
