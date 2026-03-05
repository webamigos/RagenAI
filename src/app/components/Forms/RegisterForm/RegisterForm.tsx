'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { signUp } from '@/app/hooks/use-better-auth';
import { finalizeOnboardingCommand as finalizeUserOnboarding } from '@/features/onboarding/services/commands/finalize-onboarding-command';

import { logger } from '@/app/lib/utils/logger';
import { GoogleSignInButton } from '@/app/components/Forms/GoogleSignInButton';

import { type RegistrationFormData, registrationSchema } from './schema';
import { addSubscriberToKit } from './actions';

export const RegisterForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();

  const t = useTranslations('sign-up');

  const {
    register,
    handleSubmit,
    watch,
    trigger,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema(t)),
  });

  const termsAccepted = watch('terms');

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
      const searchParams = new URLSearchParams(window.location.search);
      const invitationId = searchParams.get('invitationId');

      if (invitationId) {
        // Auto-accept invitation after registration
        try {
          const { acceptInvitation } =
            await import('@/app/[locale]/(auth)/accept-invitation/actions');
          const acceptResult = await acceptInvitation(invitationId);

          if (acceptResult.success) {
            logger.info('Invitation accepted automatically after registration');
            // Redirect to home page
            window.location.href = `/${locale}/`;
            return;
          } else {
            logger.warn(
              { error: acceptResult.error },
              'Failed to auto-accept invitation',
            );
            // Continue with normal onboarding
          }
        } catch (inviteError) {
          logger.error(
            { error: inviteError },
            'Error auto-accepting invitation',
          );
          // Continue with normal onboarding
        }
      }

      // Email verification is disabled (requireEmailVerification: false)
      // User is automatically logged in after registration
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

      // Use window.location.href to force full page reload and session refresh
      window.location.href = `/${locale}/`;
    } catch (err) {
      logger.error({ error: err }, 'Registration error');
      const errorMessage =
        err instanceof Error ? err.message : 'An unexpected error occurred';
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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
          label={t('password')}
          type="password"
          id="password"
          {...register('password')}
          error={errors.email}
          errorMessage={errors.password?.message}
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
                  .
                </label>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-500 mt-2">{error}</p>
        )}

        <Button
          type="submit"
          className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          isSubmit={true}
        >
          {t('sign-up')}
        </Button>

        <div className="relative mt-6">
          <div
            className="absolute inset-0 flex items-center"
            aria-hidden="true"
          >
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
            label={t('sign-up-with-google')}
            onBeforeSignIn={() => {
              if (!termsAccepted) {
                void trigger('terms');
                return false;
              }
              return true;
            }}
            onError={(message) => setError(message)}
          />
        </div>
      </form>
    </>
  );
};
