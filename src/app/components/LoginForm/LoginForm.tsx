'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { SocialAuthOptions } from '../SocialAuthOptions';
import { Button, Card, Input } from '@salesyy/common-ui';
import Link from 'next/link';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';

import { LoginFormData, loginSchema } from './schema';
import { type ClerkAPIError } from '@clerk/types';

export const LoginForm = () => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[] | undefined>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { isLoaded, signIn, setActive } = useSignIn();

  const t = useTranslations('Sign-in');
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
    <Card>
      <div className="flex flex-col mb-4 text-center">
        <p className="font-bold text-lg	">{t('sign-in')}</p>
        <p className="font-light text-xs text-gray-500">{t('to-continue')}</p>
      </div>
      <SocialAuthOptions isSignUp={false} />
      <form onSubmit={handleSubmit(onSubmit)}>
        <div>
          <Input
            type="email"
            id="email"
            {...register('email')}
            className="w-full px-3 py-2 border rounded"
            label="Email"
            error={errors.email}
            errorMessage={errors.email?.message}
          />
        </div>
        <div>
          <Input
            type="password"
            id="password"
            {...register('password')}
            className="w-full px-3 py-2 border rounded"
            label={t('Password')}
            error={errors.password}
            errorMessage={errors.password?.message}
          />
        </div>
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white rounded hover:bg-blue-600 flex justify-center items-center"
          isLoading={isSubmitting}
          label={t('sign-in')}
          type="submit"
        />
        {apiErrors && apiErrors.length > 0 && (
          <ul className="mb-2 text-red-500 text-sm">
            {apiErrors.map((error, index) => (
              <li key={index}>{error.longMessage || error.message}</li>
            ))}
          </ul>
        )}
        <p className="text-start">
          {t('Dont-have-an-account')}{' '}
          <Link href="/sign-up" className="text-blue-500 hover:underline">
            {t('Sign-up')}
          </Link>
        </p>
      </form>
    </Card>
  );
};
