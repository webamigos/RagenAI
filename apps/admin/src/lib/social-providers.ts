/**
 * Google sign-in on this panel is optional: `apps/admin/.env.example` says so,
 * and password sign-in always works for the platform administrator created by
 * the first-run screen in apps/web.
 *
 * "Optional" has to mean the same thing in two places, though. Better Auth
 * registers a provider it is given credentials for, and the login page decides
 * whether to offer the button. When only the first knew, an install that had
 * set neither variable still showed "Sign in with Google", and clicking it
 * failed at Google with `invalid_client` — a Google error page for a Ragen
 * misconfiguration. So the question is answered once, here, and both callers
 * ask.
 *
 * Not `import 'server-only'`: `auth.ts` deliberately avoids that import so the
 * module stays loadable where Better Auth needs it, and this is a plain
 * environment read with nothing to protect.
 */

export type GoogleCredentials = {
  clientId: string;
  clientSecret: string;
};

/**
 * The credentials, or `null` when either half is missing. Returning the pair
 * rather than a boolean is what lets `auth.ts` register the provider without a
 * non-null assertion on a value that is genuinely allowed to be undefined.
 *
 * Blank strings count as unset. `apps/admin/.env.example` ships both variables
 * declared as `""`, so a copied env file that was never filled in would
 * otherwise read as configured.
 */
export function getGoogleCredentials(): GoogleCredentials | null {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return null;
  }

  return { clientId, clientSecret };
}

/**
 * Whether the login page should offer the Google button. Read at request time,
 * not at build time — the login page is `force-dynamic`, so a container built
 * without these variables and started with them still offers the button.
 */
export function isGoogleSignInConfigured(): boolean {
  return getGoogleCredentials() !== null;
}
