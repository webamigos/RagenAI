'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useUser, useOrganization, useClerk } from '@clerk/nextjs';

import {
  checkIfApiKeyExists,
  fetchSettings,
} from '../app/components/MyProfile/ChatInstanceSettings/actions';
import { logger } from '@/app/lib/utils/logger';

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

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkIfOrganizationHasApiKey = async () => {
      //TODO: in future revalidate clerk session to use useOrganization hook, now we use a bad hack by getting index 0 from user.organizationMemberships
      const userOrgId = user?.organizationMemberships[0]?.organization.id;
      const settingsResponse = await checkIfApiKeyExists(userOrgId!);

      if (settingsResponse.success) {
        const apiKeyExists = settingsResponse.data.apiKeyExists;
        if (apiKeyExists) {
          setHasApiKey(apiKeyExists);
          clearInterval(intervalId);
        }
      } else {
        logger.error('Failed to fetch settings');
      }
    };

    if (user && !organization) {
      checkIfOrganizationHasApiKey();
      intervalId = setInterval(checkIfOrganizationHasApiKey, 1000);
    }

    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [organization, user]);

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
