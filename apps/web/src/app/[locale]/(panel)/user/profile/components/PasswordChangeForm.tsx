'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { changePassword } from '../actions/user';
import { ChangePasswordSchema, type ChangePasswordFormData } from '../types';

const inputClasses =
  'w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50';

const labelClasses = 'block text-sm text-muted-foreground mb-1.5';

type Props = {
  /**
   * The shared demo account: a changed password would lock every other
   * visitor out. The auth hook refuses the write; this keeps the form honest
   * about it instead of letting it fail on submit.
   */
  locked?: boolean;
};

export function PasswordChangeForm({ locked = false }: Props) {
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
          disabled={isSubmitting || locked}
          className={inputClasses}
        />
        {errors.currentPassword && (
          <p className="mt-1 text-xs text-destructive">
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
          disabled={isSubmitting || locked}
          className={inputClasses}
        />
        {errors.newPassword && (
          <p className="mt-1 text-xs text-destructive">
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
          disabled={isSubmitting || locked}
          className={inputClasses}
        />
        {errors.confirmPassword && (
          <p className="mt-1 text-xs text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      {locked && (
        <p className="text-xs text-muted-foreground">
          {t('demo-account-locked')}
        </p>
      )}

      {/* Submit Button */}
      <div className="flex justify-end pt-2">
        <Button isSubmit={true} disabled={isSubmitting || !isDirty || locked}>
          {isSubmitting ? t('changing') : t('change')}
        </Button>
      </div>
    </form>
  );
}
