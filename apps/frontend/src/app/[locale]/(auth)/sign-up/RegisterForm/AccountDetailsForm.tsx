'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';
import Link from 'next/link';

import { Input } from '@salesyy/common-ui';

import { type RegistrationFormData, registrationSchema } from './Schema';
import { logger } from 'nx/src/devkit-exports';

type Props = {
  onSuccess: () => void;
};

export const AccountDetailsForm = ({ onSuccess }: Props) => {
  const { isLoaded, signUp } = useSignUp();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegistrationFormData>({
    resolver: zodResolver(registrationSchema),
  });

  const onSubmit = async (data: RegistrationFormData) => {
    if (!isLoaded) return;

    const { email, password } = data;

    try {
      const result = await signUp.create({
        emailAddress: email,
        password,
      });

      await signUp.prepareEmailAddressVerification({
        strategy: 'email_code',
      });
      onSuccess();
    } catch (error) {
      logger.error(error);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div>
        <Input
          type="email"
          id="email"
          {...register('email')}
          className="w-full px-3 py-2 border rounded"
          label="email"
          error={errors.email}
          errorMessage={errors.email?.message}
        />
      </div>
      <div>
        <Input
          label="password"
          type="password"
          id="password"
          {...register('password')}
          className="w-full px-3 py-2 border rounded"
          error={errors.email}
          errorMessage={errors.password?.message}
        />
      </div>
      <button
        type="submit"
        className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Zarejestruj się
      </button>
      <p className="text-center">
        Masz już konto?{' '}
        <Link href="/sign-in" className="text-blue-500 hover:underline">
          Zaloguj się
        </Link>
      </p>
    </form>
  );
};
