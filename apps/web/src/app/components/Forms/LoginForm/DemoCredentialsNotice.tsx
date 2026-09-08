'use client';

import { useTranslations } from 'next-intl';

import { demoCredentials } from '@/libs/demo-credentials';

/**
 * Shown above the sign-in form on a deployment that offers a shared demo
 * account, and nowhere else.
 *
 * A visible box rather than input placeholders: a placeholder disappears the
 * moment the field is focused, reads to a screen reader as a hint rather than
 * content, and is easily mistaken for a value already filled in. Someone
 * copying a password wants it to stay on screen while they type.
 *
 * It renders nothing unless both `NEXT_PUBLIC_DEMO_EMAIL` and
 * `NEXT_PUBLIC_DEMO_PASSWORD` are set — see `@/libs/demo-credentials` for why
 * that, and not `TARGET_ENV`, is the gate.
 */
export function DemoCredentialsNotice({
  onFill,
}: {
  onFill: (credentials: { email: string; password: string }) => void;
}) {
  const t = useTranslations('sign-in');

  if (!demoCredentials) {
    return null;
  }

  // Captured locally: an imported binding is a mutable module reference to
  // TypeScript, so the narrowing above does not survive into the callback.
  const credentials = demoCredentials;

  return (
    <div className="mb-6 rounded-lg border border-brand-200 bg-brand-50 p-4 dark:border-brand-800 dark:bg-brand-950/40">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {t('demo-account')}
          </p>
          <dl className="mt-2 space-y-0.5 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex gap-2">
              <dt className="text-gray-500 dark:text-gray-400">Email</dt>
              <dd className="truncate font-mono">{credentials.email}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 dark:text-gray-400">
                {t('Password')}
              </dt>
              <dd className="truncate font-mono">{credentials.password}</dd>
            </div>
          </dl>
        </div>

        <button
          type="button"
          onClick={() => onFill(credentials)}
          className="shrink-0 rounded-md border border-brand-300 px-3 py-1.5 text-sm font-medium text-brand-700 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 dark:border-brand-700 dark:text-brand-300 dark:hover:bg-brand-900/40"
        >
          {t('demo-fill')}
        </button>
      </div>

      <p className="mt-3 text-xs/5 text-gray-600 dark:text-gray-400">
        {t('demo-account-note')}
      </p>
    </div>
  );
}
