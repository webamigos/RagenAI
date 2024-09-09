'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignIn } from '@clerk/nextjs';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';

import { SocialAuthOptions } from '../SocialAuthOptions';
import { LoginFormData, loginSchema } from './schema';
import { Card, Input } from '@salesyy/common-ui';
import Link from 'next/link';

export const LoginForm = () => {
  const [apiError, setApiError] = useState<string | null>(null);
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
    try {
      const result = await signIn.create({
        identifier: email,
        password: password,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        push('/');
      }
    } catch (error: any) {
      setApiError(error?.errors[0].message);
    }
  };

  return (
    <Card>
      <div className="flex flex-col mb-4 text-center">
        <p className="font-bold text-lg	">{t('sign-in')}</p>
        <p className="font-light text-xs text-gray-500">{t('to-continue')}</p>
      </div>
      <SocialAuthOptions />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
        <button
          type="submit"
          className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          {t('sign-in')}
        </button>
        <p> {apiError && <div className="text-red-500">{apiError}</div>}</p>
        <p className="text-start">
          {t('Dont-have-an-account')}{' '}
          <Link href="/sign-in" className="text-blue-500 hover:underline">
            {t('Sign-up')}
          </Link>
        </p>
      </form>
    </Card>
  );
};
