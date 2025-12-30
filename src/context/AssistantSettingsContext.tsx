'use client';

import React, { createContext, useState, useEffect } from 'react';
import { useUser, useOrganization } from '@/app/hooks/use-auth';

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

  const belongsToOrganization = !!organization?.id;

  const refreshSettings = async () => {
    const response = await fetchSettings();
    if (response.success) {
      const newApiKeyState = !!response.data.apiKey;
      setHasApiKey(newApiKeyState);
    }

    if (organization?.id) {
      // Refetch organization data to get latest hasKnowledge status
      await refreshSettings();
    }
  };

  useEffect(() => {
    if (user?.id && organization?.id) {
      setHasKnowledge(!!(organization as any).hasKnowledge);
      refreshSettings();
    }
  }, [user?.id, organization?.id]);

  useEffect(() => {
    let intervalId: NodeJS.Timeout;

    const checkIfOrganizationHasApiKey = async () => {
      if (!organization?.id) return;

      const settingsResponse = await checkIfApiKeyExists(organization.id);

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
