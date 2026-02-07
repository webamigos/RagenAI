'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useSignIn, useClerk } from '@clerk/nextjs';
import { useState } from 'react';

import { useRouter } from '@/i18n/routing';
import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { Button, Card, Input, Link, Text } from '@ragenai/common-ui';

import { type LoginFormData, loginSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const LoginForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoaded, signIn, setActive } = useSignIn();
  const clerk = useClerk();

  const t = useTranslations('sign-in');
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    const { email, password } = data;

    if (!isLoaded) return;

    setIsSubmitting(true);

    try {
      const result = await signIn.create({
        identifier: email,
        password: password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });

        // Set active organization if user has one
        const firstOrgId =
          clerk.user?.organizationMemberships[0]?.organization.id;
        if (firstOrgId) {
          await setActive({ organization: firstOrgId });
        }

        push('/');
      }
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
      <Button
        type="submit"
        className="mt-4 flex w-full justify-center rounded-md bg-indigo-600 px-3 py-1.5 text-sm/6 font-semibold text-white shadow-xs hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        isLoading={isSubmitting}
        isSubmit={true}
      >
        {t('sign-in')}
      </Button>
      <ClerkErrorsInterface apiErrors={apiErrors} />
    </form>
  );
};
