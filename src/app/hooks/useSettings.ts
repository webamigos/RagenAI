import { useContext } from 'react';

import {
  SettingsContext,
  SettingsContextType,
} from '@/context/AssistantSettingsContext';

export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};
