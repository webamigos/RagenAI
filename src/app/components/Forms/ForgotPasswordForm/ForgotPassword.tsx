'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { startTransition, useState } from 'react';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '../../ClerkErrorsInterface';
import { Button, Input, Card, Text } from '@ragenai/common-ui';

import { type ClerkAPIError } from '@clerk/types';
import { type ForgotPasswordData, ForgotPasswordSchema } from './schema';
import { Logo } from '../../Logo';

export const ForgotPasswordForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const t = useTranslations('Forgot-password');
  const { isLoaded, signIn } = useSignIn();
  const { isSignedIn } = useAuth();
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordData>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    startTransition(() => push('/'));
    return null;
  }

  const create = async (data: ForgotPasswordData) => {
    const { email } = data;
    try {
      setIsLoading(true);
      const response = await signIn?.create({
        strategy: 'reset_password_email_code',
        identifier: email,
      });
      if (response.status === 'needs_first_factor') {
        push('/reset-password');
      }
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        setApiErrors(error.errors);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(create)} className="space-y-6">
      <Input
        label={t('Provide-email')}
        type="email"
        {...register('email')}
        className="py-1.5 border rounded-md"
        placeholder="e.g john@doe.com"
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      <Button
        className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        label={t('Send-reset-code')}
        isLoading={isLoading}
        type="submit"
      />
      <ClerkErrorsInterface apiErrors={apiErrors} />
    </form>
  );
};
