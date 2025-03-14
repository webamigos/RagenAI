'use client';

import Image from 'next/image';
import { memo, useState } from 'react';
import { useSignUp, useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import { SpinnerSVG, Text } from '@ragenai/common-ui';

import { logger } from '@/app/lib/utils/logger';
import { saveUserMetadata } from '@/app/actions';

type SupportedOAuthStrategy = 'oauth_google' | 'oauth_github';

const SocialButton = ({
  onClick,
  imageUrl,
  altText,
  isLoading,
  label,
}: {
  onClick: () => void;
  imageUrl: string;
  altText: string;
  isLoading: boolean;
  label: string;
}) => (
  <button
    onClick={onClick}
    className="w-full py-2 dark:bg-accent-dark-500 bg-white dark:text-gray-200 text-gray-700 dark:border-gray-700 border-gray-200 rounded hover:bg-gray-100 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {isLoading ? (
      <SpinnerSVG size="sm" />
    ) : (
      <Image src={imageUrl} alt={altText} width={15} height={15} />
    )}
    <span className="ml-2 text-sm/6 font-semibold">{label}</span>
  </button>
);

type SocialAuthOptionsProps = {
  isSignUp: boolean;
  termsAccepted?: boolean;
};

export const SocialAuthOptions = memo(
  ({ isSignUp, termsAccepted = true }: SocialAuthOptionsProps) => {
    const { signUp, isLoaded: signUpLoaded } = useSignUp();
    const { signIn, isLoaded: signInLoaded } = useSignIn();
    const [loadingState, setLoadingState] = useState<
      Record<SupportedOAuthStrategy, boolean>
    >({
      oauth_google: false,
      oauth_github: false,
    });
    const [termsError, setTermsError] = useState(false);

    const t = useTranslations(isSignUp ? 'sign-up' : 'sign-in');

    const metadata = {
      onboardingComplete: false,
      viewMode: 'list',
    };

    const handleOAuth = async (strategy: SupportedOAuthStrategy) => {
      if (isSignUp && !termsAccepted) {
        setTermsError(true);
        return;
      }
      setTermsError(false);

      if (loadingState[strategy]) return;
      setLoadingState((prev) => ({ ...prev, [strategy]: true }));

      try {
        if ((!isSignUp && !signInLoaded) || (isSignUp && !signUpLoaded)) return;

        if (isSignUp) {
          await signUp?.authenticateWithRedirect({
            strategy,
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/account-configuration',
          });
          const user = await signUp?.id;
          if (user) {
            await saveUserMetadata(user, metadata);
          }
        } else {
          await signIn?.authenticateWithRedirect({
            strategy,
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/',
          });
        }
      } catch (error) {
        logger.error(
          `Error during ${isSignUp ? 'sign-up' : 'sign-in'} with ${strategy}`,
          error
        );
      } finally {
        setLoadingState((prev) => ({ ...prev, [strategy]: false }));
      }
    };

    const socialPlatforms = {
      oauth_google: {
        imageUrl: 'https://img.clerk.com/static/google.svg',
        altText: 'Google logo',
        label: 'Google',
      },
      oauth_github: {
        imageUrl: 'https://img.clerk.com/static/github.svg',
        altText: 'Github logo',
        label: 'Github',
      },
    };

    return (
      <div className="mt-10">
        <div className="relative">
          <div
            className="absolute inset-0 flex items-center"
            aria-hidden="true"
          >
            <div className="w-full border-t border-gray-300"></div>
          </div>
          <div className="relative flex justify-center text-sm/6 font-medium">
            <span className="bg-[#E2E8F3] dark:bg-[#06141B] px-6 dark:text-white text-gray-900">
              {t('or-continue-with')}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4">
          {Object.entries(socialPlatforms).map(
            ([strategy, { imageUrl, altText, label }]) => (
              <SocialButton
                key={strategy}
                onClick={() => handleOAuth(strategy as SupportedOAuthStrategy)}
                imageUrl={imageUrl}
                altText={altText}
                label={label}
                isLoading={loadingState[strategy as SupportedOAuthStrategy]}
              />
            )
          )}
        </div>
        {termsError && (
          <Text fontSize="sm" color="red-500" className="mt-2" role="alert">
            {t('TSO-required')}
          </Text>
        )}
      </div>
    );
  }
);

SocialAuthOptions.displayName = 'SocialAuthOptions';
