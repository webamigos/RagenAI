'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { authClient } from '@/app/hooks/use-better-auth';

import { type ForgotPasswordData, ForgotPasswordSchema } from './schema';

export const ForgotPasswordForm = () => {
  const locale = useLocale();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const t = useTranslations('Forgot-password');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordData>({
    resolver: zodResolver(ForgotPasswordSchema),
  });

  const create = async (data: ForgotPasswordData) => {
    const { email } = data;
    setIsLoading(true);
    setError(null);

    try {
      const { error: apiError } = await authClient.requestPasswordReset({
        email,
        redirectTo: `/${locale}/reset-password`,
      });

      if (apiError) {
        setError(apiError.message || 'Failed to send reset email');
        return;
      }

      setSuccess(true);
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="text-center">
        <p className="text-ready">{t('email-sent')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(create)} className="space-y-6">
      <Input
        label={t('Provide-email')}
        type="email"
        {...register('email')}
        placeholder="e.g john@doe.com"
        error={errors.email}
        errorMessage={errors.email?.message}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Button
        className="mt-4 flex w-full justify-center rounded-md bg-brand-600 px-3 py-1.5 text-sm/6 font-semibold text-primary-foreground shadow-xs hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        isLoading={isLoading}
        isSubmit={true}
      >
        {t('Send-reset-code')}
      </Button>
    </form>
  );
};
