'use client';

import { useState } from 'react';
import { useLocale } from 'next-intl';

import { signIn } from '@/app/hooks/use-better-auth';
import { logger } from '@/app/lib/utils/logger';

type GoogleSignInButtonProps = {
  label: string;
  invitationId?: string | null;
  onBeforeSignIn?: () => boolean;
  onError?: (message: string) => void;
};

export const GoogleSignInButton = ({
  label,
  invitationId,
  onBeforeSignIn,
  onError,
}: GoogleSignInButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const locale = useLocale();

  const handleGoogleSignIn = async () => {
    if (onBeforeSignIn && !onBeforeSignIn()) {
      return;
    }

    setIsLoading(true);

    try {
      const callbackURL = invitationId
        ? `/${locale}/accept-invitation?token=${invitationId}`
        : `/${locale}/`;

      await signIn.social({
        provider: 'google',
        callbackURL,
        errorCallbackURL: `/${locale}/sign-in`,
      });
    } catch (err) {
      logger.error({ error: err }, 'Google sign-in error');
      onError?.('An unexpected error occurred');
      setIsLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleGoogleSignIn}
      disabled={isLoading}
      className="flex w-full items-center justify-center gap-3 rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm font-semibold text-gray-900 dark:text-gray-200 shadow-xs ring-1 ring-gray-300 dark:ring-gray-600 ring-inset hover:bg-gray-50 dark:hover:bg-gray-700 focus-visible:ring-transparent disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12.0003 4.75C13.7703 4.75 15.3553 5.36002 16.6053 6.54998L20.0303 3.125C17.9502 1.19 15.2353 0 12.0003 0C7.31028 0 3.25527 2.69 1.28027 6.60998L5.27028 9.70498C6.21525 6.86002 8.87028 4.75 12.0003 4.75Z"
          fill="#EA4335"
        />
        <path
          d="M23.49 12.275C23.49 11.49 23.415 10.73 23.3 10H12V14.51H18.47C18.18 15.99 17.34 17.25 16.08 18.1L19.945 21.1C22.2 19.01 23.49 15.92 23.49 12.275Z"
          fill="#4285F4"
        />
        <path
          d="M5.26498 14.2949C5.02498 13.5699 4.88501 12.7999 4.88501 11.9999C4.88501 11.1999 5.01998 10.4299 5.26498 9.7049L1.275 6.60986C0.46 8.22986 0 10.0599 0 11.9999C0 13.9399 0.46 15.7699 1.28 17.3899L5.26498 14.2949Z"
          fill="#FBBC05"
        />
        <path
          d="M12.0004 24.0001C15.2404 24.0001 17.9654 22.935 19.9454 21.095L16.0804 18.095C15.0054 18.82 13.6204 19.245 12.0004 19.245C8.8704 19.245 6.21537 17.135 5.2654 14.29L1.27539 17.385C3.25539 21.31 7.3104 24.0001 12.0004 24.0001Z"
          fill="#34A853"
        />
      </svg>
      {isLoading ? (
        <span className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            aria-hidden="true"
          />
          <span>{label}</span>
        </span>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
};
