'use client';

import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useSignIn } from '@clerk/nextjs';
import { useState } from 'react';

import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';
import { Button, Card, Input, Link, Text } from '@salesyy/common-ui';
import { Logo } from '../../Logo';

import { type LoginFormData, loginSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const LoginForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoaded, signIn, setActive } = useSignIn();

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
    <Card className="w-screen">
      <div className="w-full flex justify-center mb-2">
        <Logo />
      </div>
      <div className="flex flex-col mb-4 text-center">
        <Text fontSize="md" fontWeight="medium">
          {t('sign-in')}
        </Text>
        <Text color="gray-400" fontSize="xs" fontWeight="light">
          {t('to-continue')}
        </Text>
      </div>
      <SocialAuthOptions isSignUp={false} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Input
          type="email"
          id="email"
          {...register('email')}
          className="w-full px-3 py-2 border "
          label="Email"
          error={errors.email}
          errorMessage={errors.email?.message}
        />
        <Input
          type="password"
          id="password"
          {...register('password')}
          className="w-full px-3 py-2 border"
          label={t('Password')}
          error={errors.password}
          errorMessage={errors.password?.message}
        />
        <Link
          href="/forgot-password"
          className="text-end text-sm font-light hover:underline"
        >
          {t('Forgot-password')}
        </Link>
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white hover:bg-blue-600 flex justify-center items-center"
          isLoading={isSubmitting}
          label={t('sign-in')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
        <div className="flex items-baseline">
          <Text className="text-start mr-2">{t('Dont-have-an-account')}</Text>
          <Link underline href="/sign-up">
            {t('sign-up')}
          </Link>
        </div>
      </form>
    </Card>
  );
};
