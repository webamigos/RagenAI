'use client';

import { createAuthClient } from 'better-auth/react';
import { organizationClient } from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';

export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  plugins: [organizationClient(), stripeClient({ subscription: true })],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  useActiveOrganization,
  organization,
} = authClient;
