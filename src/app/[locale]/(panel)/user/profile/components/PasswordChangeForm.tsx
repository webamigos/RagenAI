'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button, Input } from '@ragenai/common-ui';
import { statusToast } from '@/app/lib/utils/toast';
import { changePassword } from '../actions/user';
import { ChangePasswordSchema, type ChangePasswordFormData } from '../types';

export function PasswordChangeForm() {
  const t = useTranslations('user-profile.password');
  const { successToast, errorToast } = statusToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(ChangePasswordSchema),
    defaultValues: {
      currentPassword: '',
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    const result = await changePassword(data.currentPassword, data.newPassword);

    if (result.success) {
      successToast({ message: t('success') });
      reset();
    } else {
      errorToast({ message: result.error || t('error') });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Current Password */}
      <div>
        <label
          htmlFor="currentPassword"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('current')}
        </label>
        <Input
          id="currentPassword"
          type="password"
          {...register('currentPassword')}
          disabled={isSubmitting}
          error={errors.currentPassword}
          errorMessage={errors.currentPassword?.message}
        />
      </div>

      {/* New Password */}
      <div>
        <label
          htmlFor="newPassword"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('new')}
        </label>
        <Input
          id="newPassword"
          type="password"
          {...register('newPassword')}
          disabled={isSubmitting}
          error={errors.newPassword}
          errorMessage={errors.newPassword?.message}
        />
      </div>

      {/* Confirm Password */}
      <div>
        <label
          htmlFor="confirmPassword"
          className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
        >
          {t('confirm')}
        </label>
        <Input
          id="confirmPassword"
          type="password"
          {...register('confirmPassword')}
          disabled={isSubmitting}
          error={errors.confirmPassword}
          errorMessage={errors.confirmPassword?.message}
        />
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-4">
        <Button isSubmit={true} disabled={isSubmitting}>
          {isSubmitting ? t('changing') : t('change')}
        </Button>
      </div>
    </form>
  );
}
