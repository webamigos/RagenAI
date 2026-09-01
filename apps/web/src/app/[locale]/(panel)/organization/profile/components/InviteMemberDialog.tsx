'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { inviteMember } from '../actions/members';
import { InviteMemberSchema, type InviteMemberFormData } from '../types';

const inputClasses =
  'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-950 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:placeholder:text-zinc-500 dark:focus:border-zinc-500 dark:focus:ring-zinc-500';

const labelClasses = 'block text-sm text-zinc-500 dark:text-zinc-400 mb-1.5';

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

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
        {/* Email input */}
        <div>
          <label htmlFor="invite-email" className={labelClasses}>
            {t('email')}
          </label>
          <input
            id="invite-email"
            type="email"
            placeholder="user@example.com"
            {...register('email')}
            ref={(e) => {
              register('email').ref(e);
              inputRef.current = e;
            }}
            disabled={isSubmitting}
            className={inputClasses}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>
          )}
        </div>

        {/* Role select */}
        <div>
          <label htmlFor="invite-role" className={labelClasses}>
            {t('role')}
          </label>
          <div className="relative">
            <select
              id="invite-role"
              {...register('role')}
              disabled={isSubmitting}
              className={`${inputClasses} appearance-none pr-8`}
            >
              <option value="member">{t('role-member')}</option>
              <option value="admin">{t('role-admin')}</option>
            </select>
            <svg
              className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          {errors.role && (
            <p className="mt-1 text-xs text-red-500">{errors.role.message}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 pt-2">
          <Button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            outline
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
