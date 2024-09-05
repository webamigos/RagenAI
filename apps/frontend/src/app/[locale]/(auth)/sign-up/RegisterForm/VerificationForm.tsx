'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useSignUp } from '@clerk/nextjs';

import { Input } from '@salesyy/common-ui';

import { type VerificationFormData, verificationSchema } from './Schema';

export const VerificationForm: React.FC = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerificationFormData>({
    resolver: zodResolver(verificationSchema),
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onSubmit = async (data: VerificationFormData) => {
    if (!isLoaded) return;
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: data.email_code,
      });

      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
      }
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage('Wystąpił nieznany błąd podczas weryfikacji');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {errorMessage && <p className="text-red-500">{errorMessage}</p>}
      <div>
        <label htmlFor="email_code" className="block mb-1">
          Kod weryfikacyjny
        </label>
        <Input
          type="text"
          id="email_code"
          {...register('email_code')}
          className="w-full px-3 py-2 border rounded"
        />
        {errors.email_code && (
          <p className="text-red-500">{errors.email_code.message}</p>
        )}
      </div>
      <button
        type="submit"
        className="w-full py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Potwierdź kod
      </button>
    </form>
  );
};
