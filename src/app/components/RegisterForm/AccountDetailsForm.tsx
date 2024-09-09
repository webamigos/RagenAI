import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { Input } from '@salesyy/common-ui';
import { logger } from '@/app/lib/utils/logger';

import { SocialAuthOptions } from '../SocialAuthOptions';
import { Divider } from '@salesyy/common-ui/Divider/divider';
import { type RegistrationFormData, registrationSchema } from './schema';

type Props = {
  onSuccess: () => void;
};

export const AccountDetailsForm = ({ onSuccess }: Props) => {
  const { isLoaded, signUp } = useSignUp();
  const t = useTranslations('Sign-up');
  const [apiError, setApiError] = useState<string | null>(null);

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

  return (
    <>
      <div className="flex flex-col mb-4 text-center">
        <p className="font-bold text-lg	">{t('create-account')}</p>
        <p className="font-light text-xs text-gray-500">{t('to-continue')}</p>
      </div>
      <SocialAuthOptions />
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
