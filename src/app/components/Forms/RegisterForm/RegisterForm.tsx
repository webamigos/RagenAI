'use client';
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useLocale, useTranslations } from 'next-intl';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { Button, Input } from '@ragenai/common-ui';

import { type RegistrationFormData, registrationSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';
import { addSubscriberToKit } from './actions';
import { SocialAuthOptions } from '../../SocialAuthOptions';

export const RegisterForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const locale = useLocale();

  const { isLoaded, signUp } = useSignUp();
  const t = useTranslations('sign-up');
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
    setError,
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema(t)),
  });

  const termsValue = watch('terms');
  useEffect(() => {
    setTermsAccepted(!!termsValue);
  }, [termsValue]);

  const onSubmit = async (data: RegistrationFormData) => {
    if (!isLoaded) return;
    setIsSubmitting(true);

    const { email, password } = data;

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });

      if (data.newsletter_consent) {
        await addSubscriberToKit(email);
      }

      push('/enter-code');
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        setApiErrors(error.errors);
      }
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
          className="w-full px-3 py-2 border rounded-md"
          label="Email"
          error={errors.email}
          errorMessage={errors.email?.message}
        />
        <Input
          label={t('password')}
          type="password"
          id="password"
          {...register('password')}
          className="w-full py-2 border rounded-md"
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

        <Button
          className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          label={t('sign-up')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
      </form>

      <SocialAuthOptions
        setError={setError}
        isSignUp={true}
        termsAccepted={termsAccepted}
      />
    </>
  );
};
