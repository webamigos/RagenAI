'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { signUp, authClient } from '@/app/hooks/use-better-auth';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';

import { logger } from '@/app/lib/utils/logger';
import { Link } from '@/i18n/routing';

import { useSearchParams } from 'next/navigation';

import { type RegistrationFormData, registrationSchema } from './schema';
import { addSubscriberToKit } from './actions';

type RegisterFormProps = {
  prefillEmail?: string;
};

export const RegisterForm = ({ prefillEmail }: RegisterFormProps = {}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const locale = useLocale();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get('invitationId');

  const t = useTranslations('sign-up');

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema(t)),
    defaultValues: prefillEmail ? { email: prefillEmail } : undefined,
  });

  const termsAccepted = watch('terms');

  const handleResendVerification = async () => {
    if (!registeredEmail) {
      return;
    }
    setIsResending(true);
    setResendSuccess(false);
    setError(null);
    try {
      const { error: resendError } = await authClient.sendVerificationEmail({
        email: registeredEmail,
      });
      if (resendError) {
        setError(resendError.message || t('email_code.resend-failed'));
        return;
      }
      setResendSuccess(true);
    } catch {
      setError(t('email_code.resend-failed'));
    } finally {
      setIsResending(false);
    }
  };

  const onSubmit = async (data: RegistrationFormData) => {
    setIsSubmitting(true);
    setError(null);

    const { email, password } = data;

    try {
      const result = await signUp.email({
        email,
        password,
        name: email.split('@')[0], // Default name from email
      });

      if (result.error) {
        setError(result.error.message || 'Registration failed');
        return;
      }

      // Add to newsletter if consent given
      if (data.newsletter_consent) {
        await addSubscriberToKit(email);
      }

      // Check if user came from invitation link
      let invitingOrgId: string | undefined;
      if (invitationId) {
        // Auto-accept invitation after registration
        try {
          const { acceptInvitation } =
            await import('@/app/[locale]/(auth)/accept-invitation/actions');
          const acceptResult = await acceptInvitation(invitationId);

          if (acceptResult.success && acceptResult.organizationId) {
            logger.info('Invitation accepted automatically after registration');
            invitingOrgId = acceptResult.organizationId;
          } else {
            logger.warn(
              { error: acceptResult.error },
              'Failed to auto-accept invitation',
            );
          }
        } catch (inviteError) {
          logger.error(
            { error: inviteError },
            'Error auto-accepting invitation',
          );
        }
      }

      // If email verification is required, Better Auth returns token: null.
      // Show the "check your email" state instead of redirecting.
      if (!result.data?.token) {
        setRegisteredEmail(email);
        return;
      }

      // User is automatically logged in (email verification not required)
      // Finalize user onboarding (set activeOrganizationId + trial subscription)
      // Pass invitingOrgId so the user lands in the inviting org, not their personal one
      try {
        await finalizeUserOnboarding(invitingOrgId);
      } catch (err) {
        logger.warn(
          { error: err },
          'Onboarding finalization failed, relying on fallback',
        );
        // Continue anyway - middleware/account-configuration will handle it
      }

      // Use window.location.href to force full page reload and session refresh
      window.location.href = `/${locale}/new`;
    } catch (err) {
      logger.error({ error: err }, 'Registration error');
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Show "check your email" state after successful registration with email verification
  if (registeredEmail) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <svg
            className="h-6 w-6 text-green-600 dark:text-green-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
            />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('verification-email-sent-title')}
        </h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          {t('verification-email-sent-description', {
            email: registeredEmail,
          })}
        </p>
        <p className="mt-4 text-sm text-gray-500 dark:text-gray-500">
          {t('verification-email-sent-hint')}
        </p>

        {resendSuccess && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">
            {t('resend-success')}
          </p>
        )}

        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-500">{error}</p>
        )}

        <Button
          type="button"
          onClick={handleResendVerification}
          className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          isLoading={isResending}
          disabled={isResending}
        >
          {t('resend-verification')}
        </Button>

        <div className="mt-4">
          <Link
            href="/sign-in"
            className="text-sm font-semibold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {t('go-to-sign-in')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
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
          label={t('password')}
          type="password"
          id="password"
          {...register('password')}
          error={errors.password}
          errorMessage={errors.password?.message}
        />
        <Input
          label={t('confirm-password')}
          type="password"
          id="confirmPassword"
          {...register('confirmPassword')}
          error={errors.confirmPassword}
          errorMessage={errors.confirmPassword?.message}
        />

        <div className="pt-4 ml-1">
          <div className="space-y-5">
            <div className="flex gap-3">
              <div className="flex h-6 shrink-0 items-center">
                <div className="group grid size-4 grid-cols-1">
                  <input
                    id="terms"
                    {...register('terms')}
                    type="checkbox"
                    aria-describedby="comments-description"
                    className="col-start-1 row-start-1 rounded border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                  />
                </div>
              </div>
              <div className="flex w-full text-sm/6">
                <label
                  htmlFor="terms"
                  className="font-normal  text-sm dark:text-gray-300 text-gray-600"
                >
                  {t('i-agree-to')}{' '}
                  <a
                    href={`https://ragen.ai/${locale}/terms-of-use`}
                    className="text-indigo-600"
                    target="_blank"
                  >
                    {t('terms-of-use')}
                  </a>{' '}
                  {t('and')}{' '}
                  <a
                    href={`https://ragen.ai/${locale}/privacy-policy`}
                    className="text-indigo-600"
                    target="_blank"
                  >
                    {t('privacy-policy')}.
                    <span className="text-red-600">*</span>
                  </a>
                </label>
              </div>
            </div>
            {errors.terms && (
              <p className="text-sm mt-0 text-red-600 dark:text-red-500">
                {t('validation.terms')}
              </p>
            )}
          </div>
        </div>

        <div className="pt-4 ml-1">
          <div className="space-y-5">
            <div className="flex gap-3">
              <div className="flex h-6 shrink-0 items-center">
                <div className="group grid size-4 grid-cols-1">
                  <input
                    id="newsletter-consent"
                    {...register('newsletter_consent')}
                    type="checkbox"
                    aria-describedby="comments-description"
                    className="col-start-1 row-start-1 rounded border border-gray-300 bg-white checked:border-indigo-600 checked:bg-indigo-600 indeterminate:border-indigo-600 indeterminate:bg-indigo-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:border-gray-300 disabled:bg-gray-100 disabled:checked:bg-gray-100 forced-colors:appearance-auto"
                  />
                </div>
              </div>
              <div className="flex w-full text-sm/6">
                <label
                  htmlFor="newsletter-consent"
                  className="font-sm text-sm dark:text-gray-300 text-gray-600"
                >
                  {t('newsletter-consent')}{' '}
                  <a
                    href={`https://ragen.ai/${locale}/newsletter-policy`}
                    className="text-indigo-600"
                    target="_blank"
                  >
                    {t('newsletter-consent-link')}
                  </a>
                  .<span className="text-red-600">*</span>
                </label>
              </div>
            </div>
            {errors.newsletter_consent && (
              <p className="text-sm mt-0 text-red-600 dark:text-red-500">
                {t('validation.newsletter-consent')}
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-500 mt-2">{error}</p>
        )}

        <Button
          type="submit"
          className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          isSubmit={true}
        >
          {t('sign-up')}
        </Button>

      </form>
    </>
  );
};
