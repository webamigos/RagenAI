'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';
import { Button, Input, Card, Link, Text } from '@ragenai/common-ui';
import { Logo } from '../../Logo';

import { type RegistrationFormData, registrationSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const RegisterForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);

  const { isLoaded, signUp } = useSignUp();
  const t = useTranslations('sign-up');
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

    const { email, password } = data;

    try {
      await signUp.create({
        emailAddress: email,
        password,
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
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input
        type="email"
        id="email"
        {...register('email')}
        className="w-full px-3 py-2 border rounded-md"
        label="Email"
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      <Input
        label={t('password')}
        type="password"
        id="password"
        {...register('password')}
        className="w-full py-2 border rounded-md"
        error={errors.email}
        errorMessage={errors.password?.message}
      />
      <Button
        className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        disabled={isSubmitting}
        isLoading={isSubmitting}
        label={t('sign-up')}
        type="submit"
      />
      <ClerkErrorsInterface apiErrors={apiErrors} />
    </form>
  );
};
