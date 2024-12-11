'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useAuth, useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { Card, Input, Button } from '@ragenai/common-ui';

import { type ResetPasswordData, ResetPasswordSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';
import { Logo } from '../../Logo';

export const ResetPasswordForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const { isLoaded, signIn, setActive } = useSignIn();
  const t = useTranslations('Forgot-password');
  const { isSignedIn } = useAuth();
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordData>({
    resolver: zodResolver(ResetPasswordSchema),
  });

  if (!isLoaded) {
    return null;
  }

  if (isSignedIn) {
    push('/');
    return null;
  }

  const reset = async (data: ResetPasswordData) => {
    try {
      setIsLoading(true);
      await signIn?.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: data.code,
        password: data.password,
      });

      setActive({ session: signIn?.createdSessionId! });
      push('/');
      setIsLoading(false);
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
      <Logo />
      <form onSubmit={handleSubmit(reset)}>
        <Input
          errorMessage={errors.password?.message}
          className="py-1.5"
          label={t('Enter-password')}
          placeholder="New password"
          {...register('password')}
          error={errors.password}
          type="password"
        />
        <Input
          errorMessage={errors.code?.message}
          label={t('Enter-reset-code')}
          placeholder="Reset code"
          error={errors.code}
          {...register('code')}
          className="py-1.5"
          type="text"
        />
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white hover:bg-blue-600 flex justify-center items-center"
          isLoading={isLoading}
          label={t('Reset-password')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
      </form>
    </Card>
  );
};
