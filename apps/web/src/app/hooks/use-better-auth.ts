'use client';

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
      : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
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
