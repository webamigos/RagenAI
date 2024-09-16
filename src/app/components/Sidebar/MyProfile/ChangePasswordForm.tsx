import React, { useState } from 'react';

import { type ClerkAPIError } from '@clerk/types';
import { isClerkAPIResponseError } from '@clerk/nextjs/errors';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useUser } from '@clerk/clerk-react';
import { useTranslations } from 'next-intl';

import { ClerkErrorsInterface } from '../../ClerkErrorsInterface';
import { Input, Button } from '@salesyy/common-ui';
import { useToast } from '../../../hooks/useToast';

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

type Props = {
  handleCloseDialog: () => void;
};

export const ChangePasswordForm = ({ handleCloseDialog }: Props) => {
  const [apiErrors, setApiErrors] = useState<ClerkAPIError[]>([]);

  const { successToast } = useToast();
  const { user } = useUser();
  const t = useTranslations('change-password');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const onSubmit = async (data: FormData) => {
    try {
      await user?.updatePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      successToast({ message: t('password-changed') });
      handleCloseDialog();
      reset();
    } catch (error) {
      if (isClerkAPIResponseError(error)) {
        setApiErrors(error.errors);
      }
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <Input
        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
        errorMessage={errors.currentPassword?.message}
        {...register('currentPassword')}
        error={errors.currentPassword}
        label={t('current-password')}
        id="currentPassword"
        type="password"
      />
      <Input
        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
        errorMessage={errors.confirmPassword?.message}
        {...register('newPassword')}
        error={errors.newPassword}
        label={t('new-password')}
        id="newPassword"
        type="password"
      />
      <Input
        className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
        errorMessage={errors.confirmPassword?.message}
        {...register('confirmPassword')}
        error={errors.confirmPassword}
        label={t('confirm-password')}
        id="confirmPassword"
        type="password"
      />
      <div>
        <Button
          className="w-full inline-flex justify-center py-2 px-4 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          label={t('change-password')}
          disabled={isSubmitting}
          isLoading={isSubmitting}
          type="submit"
        />
        <ClerkErrorsInterface apiErrors={apiErrors} />
      </div>
    </form>
  );
};
