'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { ClerkErrorsInterface } from '@/app/components/ClerkErrorsInterface';
import { SocialAuthOptions } from '@/app/components/SocialAuthOptions';
import { Button, Input, Card, Link, Text } from '@salesyy/common-ui';
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
    resolver: zodResolver(registrationSchema),
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
    <Card className="w-screen">
      <div className="w-full flex justify-center mb-2">
        <Logo />
      </div>
      <div className="flex flex-col mb-4 text-center">
        <Text fontSize="md" fontWeight="medium">
          {t('create-account')}
        </Text>
        <Text fontSize="xs" fontWeight="light" color="gray-400">
          {t('to-continue')}
        </Text>
      </div>
      <SocialAuthOptions isSignUp={true} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <Input
          type="email"
          id="email"
          {...register('email')}
          className="w-full px-3 py-2 border"
          label="Email"
          error={errors.email}
          errorMessage={errors.email?.message}
        />
        <Input
          label={t('password')}
          type="password"
          id="password"
          {...register('password')}
          className="w-full py-2 border"
          error={errors.email}
          errorMessage={errors.password?.message}
        />
        <Button
          className="w-full py-2 px-4 mt-10 mb-4 bg-blue-500 text-white hover:bg-blue-600 flex justify-center items-center"
          disabled={isSubmitting}
          isLoading={isSubmitting}
          label={t('sign-up')}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
        <div className="flex items-baseline">
          <Text className="text-start mr-2">
            {t('Already-have-an-account')}{' '}
          </Text>
          <Link underline href="/sign-in">
            {t('sign-in')}
          </Link>
        </div>
      </form>
    </Card>
  );
};
