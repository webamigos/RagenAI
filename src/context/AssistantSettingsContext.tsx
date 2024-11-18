'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import { fetchSettings } from '../app/components/MyProfile/ChatInstanceSettings/actions';

export type SettingsContextType = {
  hasApiKey: boolean;
  BelongsToOrganization: boolean;
  refreshSettings: () => Promise<void>;
};

export const SettingsContext = createContext<SettingsContextType | undefined>(
  undefined
);

export const SettingsProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [hasApiKey, setHasApiKey] = useState(false);

  const { user } = useUser();
  const BelongsToOrganization = user?.organizationMemberships.length! > 0;

  const refreshSettings = async () => {
    const response = await fetchSettings();
    if (response.success) {
      setHasApiKey(!!response.data.apiKey);
    }
  };

  useEffect(() => {
    refreshSettings();
  }, []);

  return (
    <SettingsContext.Provider
      value={{ hasApiKey, BelongsToOrganization, refreshSettings }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
