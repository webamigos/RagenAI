import { useState } from 'react';

import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUser } from '@/app/hooks/use-auth';
import { useTranslations } from 'next-intl';

import { Input } from '@ragenai/common-ui/Input';
import { Button } from '@ragenai/common-ui/Button';
import { Card } from '@ragenai/common-ui/Card';
import { statusToast } from '@/app/lib/utils/toast';
import { logger } from '@/app/lib/utils/logger';

// Simple error type to replace APIError
type APIError = {
  message: string;
  longMessage?: string;
  code?: string;
};
const schema = z
  .object({
    currentPassword: z
      .string()
      .min(8, 'Current password must be at least 8 characters'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Please confirm your new password'),
  })
  .superRefine(({ newPassword, confirmPassword }, ctx) => {
    if (newPassword !== confirmPassword) {
      ctx.addIssue({
        code: 'custom',
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      });
    }
  });

type FormData = z.infer<typeof schema>;

export const ChangePasswordForm = () => {
  const [apiErrors, setApiErrors] = useState<APIError[]>([]);

  const { errorToast } = statusToast();
  const { user: _user } = useUser();
  const t = useTranslations('change-password');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (_data: FormData) => {
    try {
      // TODO: Implement password change with Better Auth
      // Better Auth uses different API for password changes
      // See: https://www.better-auth.com/docs/authentication/password
      logger.warn('Password change not implemented with Better Auth yet');
      errorToast({
        message:
          'Password change functionality is being migrated to Better Auth',
      });
    } catch (error) {
      if (error instanceof Error) {
        setApiErrors([{ message: error.message }]);
      }
    }
  };

  return (
    <Card title="Zmień hasło" size="lg">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input
          errorMessage={errors.currentPassword?.message}
          {...register('currentPassword')}
          error={errors.currentPassword}
          label={t('current-password')}
          id="currentPassword"
          type="password"
        />
        <Input
          errorMessage={errors.confirmPassword?.message}
          {...register('newPassword')}
          error={errors.newPassword}
          label={t('new-password')}
          id="newPassword"
          type="password"
        />
        <Input
          errorMessage={errors.confirmPassword?.message}
          {...register('confirmPassword')}
          error={errors.confirmPassword}
          label={t('confirm-password')}
          id="confirmPassword"
          type="password"
        />
        <div>
          <Button
            className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-xs text-sm font-medium rounded-md text-white bg-primary hover:bg-primary/90"
            disabled={isSubmitting}
            isLoading={isSubmitting}
            isSubmit={true}
          >
            {t('change-password')}
          </Button>
          {apiErrors.length > 0 && (
            <div className="mt-2 text-sm text-destructive">
              {apiErrors.map((error, index) => (
                <p key={index}>{error.message}</p>
              ))}
            </div>
          )}
        </div>
      </form>
    </Card>
  );
};
