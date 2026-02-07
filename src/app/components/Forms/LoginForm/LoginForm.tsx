'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

import { Button, Card, Input, Link, Text } from '@ragenai/common-ui';
import { signIn } from '@/app/hooks/use-better-auth';
import { finalizeUserOnboarding } from '@/app/lib/actions/onboarding';

import { type LoginFormData, loginSchema } from './schema';

export const LoginForm = () => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useTranslations('sign-in');
  const locale = useLocale();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    const { email, password } = data;
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await signIn.email({
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || 'Sign in failed');
        return;
      }

      // Finalize user onboarding (set activeOrganizationId + trial subscription)
      try {
        await finalizeUserOnboarding();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(
          'Onboarding finalization failed, relying on fallback:',
          err
        );
        // Continue anyway - middleware/account-configuration will handle it
      }

      // Use window.location.href to force full page reload and session refresh
      window.location.href = `/${locale}/`;
    } catch (err) {
      setError('An unexpected error occurred');
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
        label="Email"
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      <Input
        type="password"
        id="password"
        {...register('password')}
        label={t('Password')}
        error={errors.password}
        errorMessage={errors.password?.message}
      />
      {error && (
        <p className="text-sm text-red-600 dark:text-red-500 mt-2">{error}</p>
      )}
      <Button
        type="submit"
        className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        isLoading={isSubmitting}
        isSubmit={true}
      >
        {t('sign-in')}
      </Button>
    </form>
  );
};
