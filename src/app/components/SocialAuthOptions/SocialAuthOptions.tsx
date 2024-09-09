'use client';

import Image from 'next/image';
import { useSignUp, useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { Divider } from '@salesyy/common-ui/Divider';
import { logger } from '@/app/lib/utils/logger';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { useEffect, useState, useTransition } from 'react';

import { SpinnerSVG } from '@salesyy/common-ui/icons';

type SupportedOAuthStrategy = 'oauth_google' | 'oauth_facebook' | 'oauth_apple';

const SocialButton = ({
  onClick,
  imageUrl,
  altText,
  isLoading,
}: {
  onClick: () => void;
  imageUrl: string;
  altText: string;
  isLoading: boolean;
}) => (
  <button
    onClick={onClick}
    className="w-1/2 py-2 bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-100 flex items-center justify-center"
    disabled={isLoading}
  >
    {isLoading ? (
      <SpinnerSVG />
    ) : (
      <Image src={imageUrl} alt={altText} width={15} height={15} />
    )}
  </button>
);

type SocialAuthOptionsProps = {
  isSignUp: boolean;
};

export const SocialAuthOptions = ({ isSignUp }: SocialAuthOptionsProps) => {
  const { signUp, isLoaded: signUpLoaded } = useSignUp();
  const { signIn, isLoaded: signInLoaded } = useSignIn();
  const t = useTranslations(isSignUp ? 'Sign-up' : 'Sign-in');
  const [visitorId, setVisitorId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const fetchFingerprint = async () => {
      try {
        const id = await loadFingerprint();
        setVisitorId(id);
      } catch (error) {
        logger.error('Failed to load fingerprint', error);
      }
    };
    fetchFingerprint();
  }, []);

  const handleOAuth = async (strategy: SupportedOAuthStrategy) => {
    startTransition(() => {
      if (
        (!isSignUp && !signInLoaded) ||
        (isSignUp && !signUpLoaded) ||
        !visitorId
      )
        return;

      try {
        if (isSignUp) {
          signUp?.authenticateWithRedirect({
            strategy,
            redirectUrl: '/sso-callback',
            redirectUrlComplete: '/',
            unsafeMetadata: { visitorId },
          });
        } else {
          signIn?.authenticateWithRedirect({
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
      }
    });
  };

  const socialPlatforms = {
    oauth_google: {
      imageUrl: 'https://img.clerk.com/static/google.svg',
      altText: 'Google logo',
    },
    oauth_facebook: {
      imageUrl: 'https://img.clerk.com/static/facebook.svg',
      altText: 'Facebook logo',
    },
    oauth_apple: {
      imageUrl: 'https://img.clerk.com/static/apple.svg',
      altText: 'Apple logo',
    },
  };

  return (
    <>
      <div className="max-w-xs w-full flex gap-x-2 mb-4">
        {Object.entries(socialPlatforms).map(
          ([strategy, { imageUrl, altText }]) => (
            <SocialButton
              key={strategy}
              onClick={() => handleOAuth(strategy as SupportedOAuthStrategy)}
              imageUrl={imageUrl}
              altText={altText}
              isLoading={isPending}
            />
          )
        )}
      </div>
      <div className="flex items-center mb-4">
        <Divider soft />
        <p className="font-light text-gray-500 mx-2">{t('or')}</p>
        <Divider soft />
      </div>
    </>
  );
};
