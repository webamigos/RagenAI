'use client';

import Image from 'next/image';
import { memo, useState } from 'react';
import { useSignUp, useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import { Divider } from '@ragenai/common-ui/Divider';
import { SpinnerSVG } from '@ragenai/common-ui/icons';

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
    className="w-full py-2 bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-100 flex items-center justify-center"
    disabled={isLoading}
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
};

export const SocialAuthOptions = memo(
  ({ isSignUp }: SocialAuthOptionsProps) => {
    const { signUp, isLoaded: signUpLoaded } = useSignUp();
    const { signIn, isLoaded: signInLoaded } = useSignIn();
    const [loadingState, setLoadingState] = useState<
      Record<SupportedOAuthStrategy, boolean>
    >({
      oauth_google: false,
      oauth_github: false,
    });

    const t = useTranslations(isSignUp ? 'sign-up' : 'sign-in');

    const handleOAuth = async (strategy: SupportedOAuthStrategy) => {
      if (loadingState[strategy]) return;

      setLoadingState((prev) => ({ ...prev, [strategy]: true }));

      try {
        if ((!isSignUp && !signInLoaded) || (isSignUp && !signUpLoaded)) return;

        if (isSignUp) {
          await signUp?.authenticateWithRedirect({
            strategy,
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/',
          });
          const user = await signUp?.id;
          if (user) {
            await saveUserMetadata(user, false);
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
      <>
        {/* <div className="w-full flex gap-x-2 mb-4"> */}
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
        {/* </div> */}
        {/* <div className="flex items-center mb-4">
          <Divider soft />
          <p className="font-light text-gray-500 mx-2">{t('or')}</p>
          <Divider soft />
        </div> */}
      </>
    );
  }
);

SocialAuthOptions.displayName = 'SocialAuthOptions';
