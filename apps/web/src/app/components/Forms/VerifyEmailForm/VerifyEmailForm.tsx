'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useLocale } from 'next-intl';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { authClient } from '@/app/hooks/use-better-auth';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';
import { logger } from '@/app/lib/utils/logger';
import { hardNavigate } from '@/libs/navigation/hard-navigate';

type VerifyEmailData = {
  code: string;
};

export const VerifyEmailForm = () => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const t = useTranslations('verify-email');
  const locale = useLocale();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyEmailData>();

  const onSubmit = async (data: VerifyEmailData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await authClient.verifyEmail({
        query: {
          token: data.code,
        },
      });

      if (result.error) {
        setError(result.error.message || t('error-verification-failed'));
        return;
      }

      // Finalize user onboarding after verification (set activeOrganizationId + trial subscription)
      try {
        await finalizeUserOnboarding();
      } catch (err) {
        logger.warn(
          { error: err },
          'Onboarding finalization failed after email verification',
        );
      }

      hardNavigate(locale, '/new');
    } catch {
      setError(t('error-generic'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendSuccess(false);
    setError(null);

    try {
      // Get the email from URL search params if available
      const searchParams = new URLSearchParams(window.location.search);
      const email = searchParams.get('email');
      if (email) {
        await authClient.sendVerificationEmail({ email });
        setResendSuccess(true);
      } else {
        setError(t('error-generic'));
      }
    } catch {
      setError(t('error-generic'));
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-foreground">{t('title')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label={t('verification-code')}
          placeholder={t('verification-code-placeholder')}
          {...register('code', { required: t('verification-code') })}
          type="text"
          error={errors.code}
          errorMessage={errors.code?.message}
        />

        {error && <p className="text-sm text-destructive">{error}</p>}

        {resendSuccess && (
          <p className="text-sm text-ready">{t('resend-success')}</p>
        )}

        <Button
          type="submit"
          className="w-full py-2 px-4 bg-brand-600 text-primary-foreground rounded-md hover:bg-brand-700"
          isLoading={isSubmitting}
          isSubmit={true}
        >
          {t('verify')}
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-sm text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 disabled:opacity-50"
          >
            {isResending ? t('resending') : t('resend')}
          </button>
        </div>
      </form>
    </div>
  );
};
