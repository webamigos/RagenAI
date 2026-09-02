'use client';

import { useContext } from 'react';

import { OrgFeaturesContext } from '@/context/OrgFeaturesContext';
import type {
  FeatureFlags,
  FeatureKey,
} from '@/features/subscriptions/contracts/features.types';

/** All effective feature flags for the active organization. */
export function useOrgFeatures(): FeatureFlags {
  return useContext(OrgFeaturesContext);
}

/** Whether one feature is enabled for the active organization. */
export function useOrgFeature(feature: FeatureKey): boolean {
  return useOrgFeatures()[feature];
}
