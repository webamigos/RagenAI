import { Suspense } from 'react';

import { isGoogleSignInConfigured } from '@/lib/social-providers';
import { LoginForm } from './login-form';

/**
 * The environment decides whether this page offers Google sign-in, so it has
 * to be read per request rather than baked in at build time: one image serves
 * installs that configure Google and installs that do not.
 */
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm googleEnabled={isGoogleSignInConfigured()} />
    </Suspense>
  );
}
