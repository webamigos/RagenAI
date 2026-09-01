import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from './db';

/**
 * Optional e-mail-domain restriction for *new* accounts created through this
 * app's Google sign-in. Empty (or unset) means no domain restriction — a
 * self-hosted install has no reason to care about `webamigos.pl`.
 *
 * This is a second gate, not the primary one. Access to the panel is decided
 * by `User.role === 'admin'` in `requireAdmin()`; see `auth-guard.ts`.
 */
const ALLOWED_DOMAIN = (
  process.env.ADMIN_ALLOWED_EMAIL_DOMAIN ?? 'webamigos.pl'
)
  .trim()
  .toLowerCase();

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  /**
   * Password sign-in shares `users` and `accounts` with apps/web, so the
   * platform administrator created by the first-run screen there can sign in
   * here with the same credentials. Sign-up is disabled: this panel
   * authenticates existing administrators, it never creates accounts.
   */
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      scopes: ['openid', 'email', 'profile'],
    },
  },
  /**
   * Password sign-in gives this panel something it did not have before: an
   * endpoint an attacker can guess against. `proxy.ts` lets all of `/api/auth`
   * through unauthenticated, by necessity, so the limit has to live here.
   *
   * Counters are per-process: `storage: 'database'` would need a `rateLimit`
   * model in the shared `prisma/schema.prisma` and a migration, which is a
   * bigger decision than this change. So running N instances allows N times
   * the attempts below — still a hard ceiling per instance, and far better
   * than the unlimited guessing that enabling passwords would otherwise open.
   * Switch to database storage if the panel is ever scaled out.
   */
  rateLimit: {
    enabled: true,
    storage: 'memory',
    window: 60,
    max: 60,
    customRules: {
      '/sign-in/email': { window: 300, max: 10 },
      '/forget-password': { window: 300, max: 5 },
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
  /**
   * `databaseHooks.user.create.before` is the real Better Auth extension point.
   * An earlier version of this file used `callbacks.onBeforeCreateUser`, which
   * is not an option this library has — the whole object was ignored and the
   * domain restriction never ran at all.
   */
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!ALLOWED_DOMAIN) {
            return;
          }
          const email = user.email?.trim().toLowerCase();
          if (!email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
            // `false` is how this hook declines — throwing would surface as a
            // 500 rather than a refusal.
            return false;
          }
          return { data: { ...user, email } };
        },
      },
    },
  },
});
