'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations, useLocale } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { signIn } from '@/app/hooks/use-better-auth';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';

import { logger } from '@/app/lib/utils/logger';

import { type LoginFormData, loginSchema } from './schema';

type LoginFormProps = {
  prefillEmail?: string;
};

export const LoginForm = ({ prefillEmail }: LoginFormProps = {}) => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const t = useTranslations('sign-in');
  const locale = useLocale();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitationId');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: prefillEmail ? { email: prefillEmail } : undefined,
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
        if (result.error.message === 'Email not verified') {
          setError(t('email-not-verified'));
        } else {
          setError(result.error.message || 'Sign in failed');
        }
        return;
      }

      // Finalize user onboarding (set activeOrganizationId + trial subscription)
      try {
        await finalizeUserOnboarding();
      } catch (err) {
        logger.warn(
          { error: err },
          'Onboarding finalization failed, relying on fallback',
        );
        // Continue anyway - middleware/account-configuration will handle it
      }

      // If user came from invitation link, redirect to accept it
      if (invitationId) {
        window.location.href = `/${locale}/accept-invitation?token=${encodeURIComponent(invitationId)}`;
        return;
      }

      // Use window.location.href to force full page reload and session refresh
      window.location.href = `/${locale}/new`;
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
        readOnly={Boolean(prefillEmail)}
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
        className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        isLoading={isSubmitting}
        isSubmit={true}
        data-testid="sign-in-submit"
      >
        {t('sign-in')}
      </Button>

    </form>
  );
};
