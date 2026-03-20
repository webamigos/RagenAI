import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db';

const ALLOWED_DOMAIN = 'webamigos.pl';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scopes: ['openid', 'email', 'profile'],
    },
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    cookiePrefix: 'ragen-admin',
  },
  callbacks: {
    async onBeforeCreateUser({ user }: { user: { email: string } }) {
      const email = user.email?.trim().toLowerCase();
      if (!email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
        throw new Error(
          `Only @${ALLOWED_DOMAIN} email addresses are allowed to sign in.`,
        );
      }
      return { ...user, email };
    },
  },
});
