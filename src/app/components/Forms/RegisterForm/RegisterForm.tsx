'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { loadFingerprint } from '@/app/lib/utils/fingerprint';
import { useRouter } from 'next/navigation';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';
import { Button, Input, Card } from '@salesyy/common-ui';

import { type RegistrationFormData, registrationSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const RegisterForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);

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
      await signUp.create({
        emailAddress: email,
        password,
        unsafeMetadata: { visitorId },
      });

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      push('/enter-code');
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        setApiErrors(error.errors);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
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
          className="w-full py-2 px-4 mt-9 mb-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex justify-center items-center"
          disabled={isSubmitting}
          label={t('sign-up')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
        <p className="text-start">
          {t('Already-have-an-account')}{' '}
          <Link href="/sign-in" className="text-blue-500 hover:underline">
            {t('sign-in')}
          </Link>
        </p>
      </form>
    </Card>
  );
};
