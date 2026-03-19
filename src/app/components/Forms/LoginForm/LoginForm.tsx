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
import { GoogleSignInButton } from '@/app/components/Forms/GoogleSignInButton';

import { type LoginFormData, loginSchema } from './schema';

export const LoginForm = () => {
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

      <div className="relative mt-6">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
        </div>
        <div className="relative flex justify-center text-sm/6 font-medium">
          <span className="bg-primary-light dark:bg-primary-dark px-6 text-gray-900 dark:text-gray-300">
            {t('or-continue-with')}
          </span>
        </div>
      </div>

      <div className="mt-6">
        <GoogleSignInButton
          label={t('sign-in-with-google')}
          invitationId={invitationId}
          onError={(message) => setError(message)}
        />
      </div>
    </form>
  );
};
