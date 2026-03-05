'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { statusToast } from '@/app/lib/utils/toast';
import { changePassword } from '../actions/user';
import { ChangePasswordSchema, type ChangePasswordFormData } from '../types';

const inputClasses =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500';

const labelClasses = 'block text-sm text-zinc-500 dark:text-zinc-400 mb-1.5';

export function PasswordChangeForm() {
  const t = useTranslations('user-profile.password');
  const { successToast, errorToast } = statusToast();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting, isDirty },
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      {/* Current Password */}
      <div>
        <label htmlFor="currentPassword" className={labelClasses}>
          {t('current')}
        </label>
        <input
          id="currentPassword"
          type="password"
          {...register('currentPassword')}
          disabled={isSubmitting}
          className={inputClasses}
        />
        {errors.currentPassword && (
          <p className="mt-1 text-xs text-red-500">
            {errors.currentPassword.message}
          </p>
        )}
      </div>

      {/* New Password */}
      <div>
        <label htmlFor="newPassword" className={labelClasses}>
          {t('new')}
        </label>
        <input
          id="newPassword"
          type="password"
          {...register('newPassword')}
          disabled={isSubmitting}
          className={inputClasses}
        />
        {errors.newPassword && (
          <p className="mt-1 text-xs text-red-500">
            {errors.newPassword.message}
          </p>
        )}
      </div>

      {/* Confirm Password */}
      <div>
        <label htmlFor="confirmPassword" className={labelClasses}>
          {t('confirm')}
        </label>
        <input
          id="confirmPassword"
          type="password"
          {...register('confirmPassword')}
          disabled={isSubmitting}
          className={inputClasses}
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-500">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={isSubmitting || !isDirty}
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          {isSubmitting ? t('changing') : t('change')}
        </button>
      </div>
    </form>
  );
}
