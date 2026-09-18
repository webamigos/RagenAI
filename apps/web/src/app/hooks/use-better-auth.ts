'use client';

import { publicRuntimeConfig } from '@/config/public-runtime-config';
import { createAuthClient } from 'better-auth/react';
import {
  organizationClient,
  adminClient,
  magicLinkClient,
} from 'better-auth/client/plugins';
import { stripeClient } from '@better-auth/stripe/client';

export const authClient = createAuthClient({
  baseURL:
    typeof window !== 'undefined'
      ? window.location.origin
      : publicRuntimeConfig().appUrl || 'http://localhost:3000',
  plugins: [
    organizationClient({
      teams: {
        enabled: true,
      },
    }),
    adminClient(),
    magicLinkClient(),
    stripeClient({ subscription: true }),
  ],
});

export const {
  useSession,
  signIn,
  signUp,
  signOut,
  useActiveOrganization,
  organization,
} = authClient;
