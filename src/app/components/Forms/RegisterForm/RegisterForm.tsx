'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';

import { useRouter } from '@/i18n/routing';
import { Button, Input } from '@ragenai/common-ui';
import { signUp } from '@/app/hooks/use-better-auth';

import { type RegistrationFormData, registrationSchema } from './schema';
import { addSubscriberToKit } from './actions';

export const RegisterForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locale = useLocale();

  const t = useTranslations('sign-up');
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema(t)),
  });

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

      // Email verification is disabled (requireEmailVerification: false)
      // User is automatically logged in after registration
      // Use window.location.href to force full page reload and session refresh
      window.location.href = '/';
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Registration error:', err);
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
      </form>
    </>
  );
};
