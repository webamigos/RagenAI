'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { Input } from '@ragenai/common-ui/Input';
import { statusToast } from '@/app/lib/utils/toast';
import { inviteMember } from '../actions/members';
import { InviteMemberSchema, type InviteMemberFormData } from '../types';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
};

export function InviteMemberDialog({ isOpen, onClose, organizationId }: Props) {
  const t = useTranslations('organization.members');
  const { successToast, errorToast } = statusToast();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<InviteMemberFormData>({
    resolver: zodResolver(InviteMemberSchema),
    defaultValues: { role: 'member' },
  });

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const onSubmit = async (data: InviteMemberFormData) => {
    const result = await inviteMember(data.email, data.role, organizationId);

    if (result.success) {
      successToast({ message: t('invite-success') });
      onClose();
      reset();
    } else {
      errorToast({ message: result.error || t('invite-error') });
    }
  };

  const handleClose = () => {
    onClose();
    reset();
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>{t('invite-member')}</DialogTitle>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 mt-6">
        {/* Email input */}
        <div>
          <label
            htmlFor="email"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            {t('email')}
          </label>
          <Input
            id="email"
            type="email"
            placeholder="user@example.com"
            {...register('email')}
            ref={(e) => {
              register('email').ref(e);
              inputRef.current = e;
            }}
            disabled={isSubmitting}
            error={errors.email}
            errorMessage={errors.email?.message}
          />
        </div>

        {/* Role select */}
        <div>
          <label
            htmlFor="role"
            className="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300"
          >
            {t('role')}
          </label>
          <select
            id="role"
            {...register('role')}
            disabled={isSubmitting}
            className="w-full rounded-md border border-gray-300 px-3 py-2 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 focus:border-indigo-500 focus:ring-indigo-500"
          >
            <option value="member">{t('role-member')}</option>
            <option value="admin">{t('role-admin')}</option>
          </select>
          {errors.role && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">
              {errors.role.message}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end space-x-2">
          <Button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {t('cancel')}
          </Button>
          <Button isSubmit={true} disabled={isSubmitting}>
            {isSubmitting ? t('sending') : t('send-invitation')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
