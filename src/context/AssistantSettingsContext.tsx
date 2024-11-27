'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useUser, useOrganization, useClerk } from '@clerk/nextjs';

import { fetchSettings } from '../app/components/MyProfile/ChatInstanceSettings/actions';

export type SettingsContextType = {
  hasApiKey: boolean;
  belongsToOrganization: boolean;
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
  const [hasKnowledge, setHasKnowledge] = useState(false);

  const { user } = useUser();
  const { organization } = useOrganization();
  const clerk = useClerk();

  const belongsToOrganization = user?.organizationMemberships.length! > 0;

  const refreshSettings = async () => {
    const response = await fetchSettings();
    if (response.success) {
      const newApiKeyState = !!response.data.apiKey;
      setHasApiKey(newApiKeyState);
    }

    if (clerk.organization) {
      await clerk.organization.reload();
      setHasKnowledge(!!clerk.organization.publicMetadata.hasKnowledge);
    }
  };

  useEffect(() => {
    if (user?.id && organization?.id) {
      setHasKnowledge(!!organization.publicMetadata.hasKnowledge);
      refreshSettings();
    }
  }, [user?.id, organization?.id]);

  return (
    <SettingsContext.Provider
      value={{
        hasApiKey,
        belongsToOrganization,
        hasKnowledge,
        refreshSettings,
      }}
    >
      {children}
    </SettingsContext.Provider>
  );
};
