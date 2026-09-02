'use client';

import { createContext } from 'react';

import {
  DEFAULT_FEATURES,
  type FeatureFlags,
} from '@/features/subscriptions/contracts/features.types';

/**
 * Effective feature flags for the active organization, resolved on the server
 * by `getEffectiveFeaturesQuery` (org override > plan > code default) and
 * handed to client components that gate a control on one.
 *
 * The fallback is `DEFAULT_FEATURES` rather than "everything on", so a client
 * component rendered outside the provider hides an opt-in control instead of
 * offering one the server will refuse. Hiding a control is never the whole
 * gate — every flag here has a server-side check behind it.
 */
export const OrgFeaturesContext = createContext<FeatureFlags>(DEFAULT_FEATURES);

type Props = {
  features: FeatureFlags;
  children: React.ReactNode;
};

export const OrgFeaturesProvider = ({ features, children }: Props) => {
  return (
    <OrgFeaturesContext.Provider value={features}>
      {children}
    </OrgFeaturesContext.Provider>
  );
};
