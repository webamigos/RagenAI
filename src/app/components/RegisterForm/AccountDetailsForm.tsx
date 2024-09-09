import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { Button, Input } from '@salesyy/common-ui';
import { logger } from '@/app/lib/utils/logger';
import { saveUserIdToClerk } from '@/app/actions';
import { useRouter } from 'next/navigation';

import { SocialAuthOptions } from '../SocialAuthOptions';
import { type RegistrationFormData, registrationSchema } from './schema';

export const AccountDetailsForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  const { isLoaded, signUp } = useSignUp();
  const t = useTranslations('Sign-up');
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  const onSubmit = async (data: RegistrationFormData) => {
    if (!isLoaded) return;
    setIsSubmitting(true);

    const visitorId = await loadFingerprint();

    const { email, password } = data;

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
        unsafeMetadata: { visitorId },
      });

      await saveUserIdToClerk(result.id as string, visitorId);

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      push('/enter-code');
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
      <SocialAuthOptions isSignUp={true} />
      <form onSubmit={handleSubmit(onSubmit)}>
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
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex justify-center items-center"
          disabled={isSubmitting}
          label={t('sign-up')}
          type="submit"
        />
        <p>{apiError && <div className="text-red-500">{apiError}</div>}</p>
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
