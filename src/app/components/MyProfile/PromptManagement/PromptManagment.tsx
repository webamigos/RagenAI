'use client';

import { useState, useEffect } from 'react';

import { statusToast } from '@/app/lib/utils/toast';
import { Input, Text, Card } from '@salesyy/common-ui';
import {
  fetchTemperatureSettings,
  updateTemperatureSettings,
} from '@/app/lib/services/api';

export const PromptManagement = () => {
  const [temperature, setTemperature] = useState<number>(0.7);
  const { successToast, errorToast } = statusToast();

  useEffect(() => {
    const fetchTemperature = async () => {
      try {
        const { data } = await fetchTemperatureSettings();

        setTemperature(data.temperature || 0.7);
      } catch (error) {
        errorToast({ message: `Failed to fetch settings:, ${error}` });
      }
    };

    fetchTemperature();
  }, []);

  const handleTemperatureChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const temp = parseFloat(event.target.value);
    setTemperature(temp);

    try {
      const { status } = await updateTemperatureSettings(temp);

      if (status === 200) {
        return successToast({
          message: `Zapisano!:`,
        });
      }
    } catch (error) {
      errorToast({ message: `Failed to update temperature: ${error}` });
    }
  };

  return (
    <Card title="Set temperature">
      <div className="flex w-full items-center space-x-4">
        <Input
          id="temperature"
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={temperature}
          onChange={handleTemperatureChange}
        />
        <Text>{temperature}</Text>
      </div>
    </Card>
  );
};
