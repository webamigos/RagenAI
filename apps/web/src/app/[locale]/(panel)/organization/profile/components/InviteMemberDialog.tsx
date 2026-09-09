'use client';

import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { Dialog, DialogTitle } from '@ragenai/common-ui/Dialog';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { createMemberAccount, inviteMember } from '../actions/members';
import { AddMemberSchema, type AddMemberFormData } from '../types';
import { CreatedAccountPanel } from './CreatedAccountPanel';

const inputClasses =
  'w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 dark:bg-card dark:text-white';

const labelClasses = 'block text-sm text-muted-foreground mb-1.5';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  organizationId: string;
};

type Mode = 'invite' | 'create';

export function InviteMemberDialog({ isOpen, onClose, organizationId }: Props) {
  const t = useTranslations('organization.members');
  const { successToast, errorToast } = statusToast();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setModeState] = useState<Mode>('invite');
  const [created, setCreated] = useState<{
    email: string;
    temporaryPassword: string;
  } | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
    setValue,
  } = useForm<AddMemberFormData>({
    resolver: zodResolver(AddMemberSchema),
    defaultValues: { role: 'member', mode: 'invite' },
  });

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const onSubmit = async (data: AddMemberFormData) => {
    if (data.mode === 'create') {
      const result = await createMemberAccount(
        data.email,
        // superRefine guarantees a name in this mode.
        data.name as string,
        data.role,
        organizationId,
      );

      if (result.success && result.data) {
        // Deliberately does not close: the password is shown once and is not
        // recoverable afterwards.
        setCreated(result.data);
        reset();
      } else {
        errorToast({ message: result.error || t('create-account-error') });
      }
      return;
    }

    const result = await inviteMember(data.email, data.role, organizationId);

    if (result.success) {
      successToast({ message: t('invite-success') });
      onClose();
      reset();
    } else {
      errorToast({ message: result.error || t('invite-error') });
    }
  };

  // Mirrored into form state so the schema can branch on it.
  const setMode = (next: Mode) => {
    setModeState(next);
    setValue('mode', next);
  };

  const submitLabel =
    mode === 'create' ? t('create-account') : t('send-invitation');
  const dialogTitle = created ? t('account-created') : submitLabel;

  const handleClose = () => {
    onClose();
    reset();
    setCreated(null);
    setModeState('invite');
    setValue('mode', 'invite');
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} size="md">
      <DialogTitle>{dialogTitle}</DialogTitle>

      {created ? (
        <CreatedAccountPanel
          email={created.email}
          temporaryPassword={created.temporaryPassword}
          onDone={handleClose}
        />
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
          <div
            role="radiogroup"
            aria-label={t('add-member-mode')}
            className="flex gap-2"
          >
            {(['invite', 'create'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                disabled={isSubmitting}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm ${
                  mode === value
                    ? 'border-border bg-paper-900 text-white dark:border-white dark:bg-white dark:text-muted-foreground'
                    : 'border-border text-muted-foreground'
                }`}
              >
                {value === 'invite' ? t('mode-invite') : t('mode-create')}
              </button>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">
            {mode === 'create' ? t('mode-create-hint') : t('mode-invite-hint')}
          </p>

          {mode === 'create' && (
            <div>
              <label htmlFor="invite-name" className={labelClasses}>
                {t('name')}
              </label>
              <input
                id="invite-name"
                type="text"
                {...register('name')}
                disabled={isSubmitting}
                className={inputClasses}
              />
              {errors.name && (
                <p className="mt-1 text-xs text-destructive">
                  {errors.name.message}
                </p>
              )}
            </div>
          )}

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
              <p className="mt-1 text-xs text-destructive">
                {errors.email.message}
              </p>
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
                className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
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
              <p className="mt-1 text-xs text-destructive">
                {errors.role.message}
              </p>
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
              {isSubmitting ? t('sending') : submitLabel}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
