import Image from 'next/image';
import { useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';

import { Divider } from '@salesyy/common-ui/Divider';
import { logger } from '@/app/lib/utils/logger';

export const SocialAuthOptions = () => {
  const { signIn, isLoaded } = useSignIn();
  const t = useTranslations('Sign-up');

  const handleGoogleSignUp = async () => {
    if (!isLoaded) return;

    try {
      await signIn?.authenticateWithRedirect({
        strategy: 'oauth_google',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (error) {
      logger.error(error);
    }
  };

  const handleAppleSignUp = async () => {
    if (!isLoaded) return;
    try {
      await signIn?.authenticateWithRedirect({
        strategy: 'oauth_apple',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (error) {
      logger.error(error);
    }
  };

  const handleFacebookSignUp = async () => {
    if (!isLoaded) return;
    try {
      await signIn?.authenticateWithRedirect({
        strategy: 'oauth_facebook',
        redirectUrl: '/sso-callback',
        redirectUrlComplete: '/',
      });
    } catch (error) {
      logger.error(error);
    }
  };

  return (
    <>
      <div className="max-w-xs w-full flex gap-x-2 mb-4">
        <button
          onClick={handleGoogleSignUp}
          className="w-1/2 py-2 ml-3 bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-100 flex items-center justify-center"
        >
          <Image
            src="https://img.clerk.com/static/google.svg"
            alt="Google logo"
            width={15}
            height={15}
          />
        </button>
        <button
          onClick={handleFacebookSignUp}
          className="w-1/2 py-2 bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-100 flex items-center justify-center"
        >
          <Image
            src="https://img.clerk.com/static/facebook.svg"
            alt="Facebook logo"
            width={15}
            height={15}
          />
        </button>
        <button
          onClick={handleAppleSignUp}
          className="w-1/2 py-2 bg-white text-gray-700 border border-gray-200 rounded hover:bg-gray-100 flex items-center justify-center"
        >
          <Image
            src="https://img.clerk.com/static/apple.svg"
            alt="Apple logo"
            width={15}
            height={15}
          />
        </button>
      </div>
      <div className="flex items-center mb-4">
        <Divider soft />
        <p className="font-light text-gray-500 mx-2">{t('or')}</p>
        <Divider soft />
      </div>
    </>
  );
};
