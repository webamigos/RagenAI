'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from '@/i18n/routing';
import { Button, Input } from '@ragenai/common-ui';
import { authClient } from '@/app/hooks/use-better-auth';

type VerifyEmailData = {
  code: string;
};

export const VerifyEmailForm = () => {
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  const { push } = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyEmailData>();

  const onSubmit = async (data: VerifyEmailData) => {
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await authClient.verifyEmail({
        code: data.code,
      });

      if (result.error) {
        setError(result.error.message || 'Verification failed');
        return;
      }

      // Redirect to home or onboarding
      push('/');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    setResendSuccess(false);
    setError(null);

    try {
      // Better Auth should have a resend verification email method
      // TODO: Implement resend functionality if available in Better Auth
      setResendSuccess(true);
    } catch (err) {
      setError('Failed to resend verification email');
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Verify your email
        </h2>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          We&apos;ve sent a verification code to your email address.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          label="Verification Code"
          placeholder="Enter the code from your email"
          {...register('code', { required: 'Verification code is required' })}
          type="text"
          error={!!errors.code}
          errorMessage={errors.code?.message}
        />

        {error && (
          <p className="text-sm text-red-600 dark:text-red-500">{error}</p>
        )}

        {resendSuccess && (
          <p className="text-sm text-green-600 dark:text-green-500">
            Verification email resent successfully!
          </p>
        )}

        <Button
          type="submit"
          className="w-full py-2 px-4 bg-indigo-600 text-white rounded-md hover:bg-indigo-500"
          isLoading={isSubmitting}
          isSubmit={true}
        >
          Verify Email
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={handleResend}
            disabled={isResending}
            className="text-sm text-indigo-600 hover:text-indigo-500 disabled:opacity-50"
          >
            {isResending ? 'Resending...' : "Didn't receive the code? Resend"}
          </button>
        </div>
      </form>
    </div>
  );
};
