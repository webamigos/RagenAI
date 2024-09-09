import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp, useSignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { Input } from '@salesyy/common-ui';
import { logger } from '@/app/lib/utils/logger';
import { SignUp } from '@clerk/nextjs';
import { type RegistrationFormData, registrationSchema } from './schema';
import Image from 'next/image';
import { Divider } from '@salesyy/common-ui/Divider/divider';

type Props = {
  onSuccess: () => void;
};

export const AccountDetailsForm = ({ onSuccess }: Props) => {
  const { isLoaded, signUp } = useSignUp();
  const t = useTranslations('Sign-up');
  const [apiError, setApiError] = useState<string | null>(null);
  const { signIn } = useSignIn();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  const onSubmit = async (data: RegistrationFormData) => {
    if (!isLoaded) return;
    const visitorId = await loadFingerprint();

    const { email, password } = data;

    try {
      await signUp.create({
        emailAddress: email,
        password,
        unsafeMetadata: { visitorId },
      });

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });
      onSuccess();
    } catch (error: any) {
      logger.error(error);
      setApiError(error?.errors[0].message);
    }
  };

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
      <div className="flex flex-col mb-4 text-center">
        <p className="font-bold text-lg	">{t('create-account')}</p>
        <p className="font-light text-xs text-gray-500">{t('to-continue')}</p>
      </div>
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
      <form onSubmit={handleSubmit(onSubmit)} className="">
        <Input
          type="email"
          id="email"
          {...register('email')}
          className="w-full px-3 py-2 border rounded"
          label="Email"
          error={errors.email}
          errorMessage={errors.email?.message}
        />
        <Input
          label={t('password')}
          type="password"
          id="password"
          {...register('password')}
          className="w-full py-2 border rounded"
          error={errors.email}
          errorMessage={errors.password?.message}
        />
        <button
          type="submit"
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {t('sign-up')}
        </button>
        <p> {apiError && <div className="text-red-500">{apiError}</div>}</p>
        <p className="text-start">
          {t('Already-have-an-account')}{' '}
          <Link href="/sign-in" className="text-blue-500 hover:underline">
            {t('sign-in')}
          </Link>
        </p>
      </form>
    </>
  );
};
