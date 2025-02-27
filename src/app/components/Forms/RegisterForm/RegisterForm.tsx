'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';
import { Button, Input, Card, Link, Text } from '@ragenai/common-ui';
import { Logo } from '../../Logo';

import { type RegistrationFormData, registrationSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const RegisterForm = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);

  const { isLoaded, signUp } = useSignUp();
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
                <svg
                  fill="none"
                  viewBox="0 0 14 14"
                  className="pointer-events-none col-start-1 row-start-1 size-5.5 self-center justify-self-center stroke-white group-has-[:disabled]:stroke-gray-950/25"
                >
                  <path
                    d="M3 8L6 11L11 3.5"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-0 group-has-[:checked]:opacity-100"
                  />
                  <path
                    d="M3 7H11"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="opacity-0 group-has-[:indeterminate]:opacity-100"
                  />
                </svg>
              </div>
            </div>
            <div className="flex w-full text-sm/6">
              <label
                htmlFor="terms"
                className="font-normal dark:text-gray-300 text-gray-900"
              >
                {t('i-agree-to')}{' '}
                <a
                  href="https://ragen.ai/en/terms-of-use"
                  className="text-indigo-600"
                  target="_blank"
                >
                  {t('terms-of-use')}
                </a>
              </label>{' '}
            </div>
          </div>
          {errors.terms && (
            <div>
              <p className="text-sm text-red-600 dark:text-red-500">
                {t('validation.terms')}
              </p>
            </div>
          )}
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
  );
};
