'use client';

import { useOrganizationActivation } from '@/app/hooks/useOrganizationActivation';

/**
 * Client component that ensures organization is activated after sign-in
 * Must be placed inside ClerkProvider in the layout
 *
 * This component has no UI - it only runs the organization activation logic
 * in the background to ensure useOrganization() hook returns valid data
 */
export function OrganizationActivator() {
  useOrganizationActivation();
  return null;
}
