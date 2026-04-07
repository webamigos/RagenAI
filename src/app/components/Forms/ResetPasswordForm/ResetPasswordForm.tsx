'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { useRouter } from '@/i18n/routing';
import { Card } from '@ragenai/common-ui/Card';
import { Input } from '@ragenai/common-ui/Input';
import { Button } from '@ragenai/common-ui/Button';
import { authClient } from '@/app/hooks/use-better-auth';

import { type ResetPasswordData, ResetPasswordSchema } from './schema';
import { Logo } from '../../Logo';

export const ResetPasswordForm = () => {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const t = useTranslations('Forgot-password');
  const { push } = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordData>({
    resolver: zodResolver(ResetPasswordSchema),
  });

  const reset = async (data: ResetPasswordData) => {
    if (!token) {
      setError('Invalid reset token');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const result = await authClient.resetPassword({
        newPassword: data.password,
        token,
      });

      if (result.error) {
        setError(result.error.message || 'Failed to reset password');
        return;
      }

      // Redirect to sign-in after successful password reset
      push('/sign-in');
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <Logo className="h-8" />
      <form onSubmit={handleSubmit(reset)}>
        <Input
          errorMessage={errors.password?.message}
          label={t('Enter-password')}
          placeholder="New password"
          {...register('password')}
          error={errors.password}
          type="password"
        />
        {error && (
          <p className="text-sm text-red-600 dark:text-red-500 mt-2">{error}</p>
        )}
        <Button
          className="w-full py-2 px-4 my-4 bg-blue-500 text-white hover:bg-blue-600 flex justify-center items-center"
          isLoading={isLoading}
          isSubmit={true}
        >
          {t('Reset-password')}
        </Button>
      </form>
    </Card>
  );
};
