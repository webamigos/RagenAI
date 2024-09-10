'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useSignIn } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

import { ClerkErrorsInterface } from '../../ClerkErrorsInterface';
import { Button, Input, Card } from '@salesyy/common-ui';

import { type ClerkAPIError } from '@clerk/types';
import { type ForgotPasswordData, ForgotPasswordSchema } from './schema';

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
    push('/');
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
    <Card>
      <h1>{t('Forgot-password')}</h1>
      <form onSubmit={handleSubmit(create)}>
        <Input
          label={t('Provide-email')}
          type="email"
          {...register('email')}
          placeholder="e.g john@doe.com"
          error={errors.email}
          errorMessage={errors.email?.message}
        />
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex justify-center items-center"
          label={t('Send-reset-code')}
          isLoading={isLoading}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
      </form>
    </Card>
  );
};
