'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useUser, useOrganization } from '@clerk/nextjs';

import { fetchSettings } from '../app/components/MyProfile/ChatInstanceSettings/actions';

export type SettingsContextType = {
  hasApiKey: boolean;
  BelongsToOrganization: boolean;
  hasKnowledge: boolean;
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
  const { organization } = useOrganization();
  const BelongsToOrganization = user?.organizationMemberships.length! > 0;

  const organizationPublicMetadata = organization?.publicMetadata;
  const hasKnowledge = organizationPublicMetadata?.hasKnowledge as boolean;

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
      value={{
        hasApiKey,
        BelongsToOrganization,
        hasKnowledge,
        refreshSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
