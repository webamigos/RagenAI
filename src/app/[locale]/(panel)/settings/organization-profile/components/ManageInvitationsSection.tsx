'use client';

import { useTranslations, useLocale } from 'next-intl';
import { statusToast } from '@/app/lib/utils/toast';
import { cancelInvitation, resendInvitation } from '../actions/invitations';
import { isOrgAdmin } from '@/lib/auth-access-control';
import type { Invitation } from '../types';

type Props = {
  invitations: Invitation[];
  organizationId: string;
  currentUserRole: string;
};

export function ManageInvitationsSection({
  invitations,
  organizationId,
  currentUserRole,
}: Props) {
  const t = useTranslations('organization.invitations');
  const locale = useLocale();
  const { successToast, errorToast } = statusToast();

  const canManageInvitations = isOrgAdmin(currentUserRole);

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm(t('confirm-cancel'))) {
      return;
    }

    const result = await cancelInvitation(invitationId);
    if (result.success) {
      successToast({ message: t('cancel-success') });
    } else {
      errorToast({ message: result.error || t('cancel-error') });
    }
  };

  const handleResendInvitation = async (invitation: Invitation) => {
    const result = await resendInvitation(
      invitation.email,
      invitation.role,
      organizationId,
    );
    if (result.success) {
      successToast({ message: t('resend-success') });
    } else {
      errorToast({ message: result.error || t('resend-error') });
    }
  };

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === 'pending',
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <h2 className="text-base font-semibold text-zinc-950 dark:text-white">
        {t('title')} ({pendingInvitations.length})
      </h2>

      {/* Invitations list */}
      {pendingInvitations.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t('no-invitations')}
          </p>
        </div>
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {pendingInvitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center gap-3 py-3">
              {/* Email & role */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-zinc-950 dark:text-white">
                  {invitation.email}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      invitation.role === 'admin'
                        ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                        : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                    }`}
                  >
                    {t(`role-${invitation.role}`)}
                  </span>
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    {t(`status-${invitation.status}`)}
                  </span>
                </div>
              </div>

              {/* Sent date */}
              <span className="hidden shrink-0 text-xs text-zinc-400 sm:block dark:text-zinc-500">
                {new Date(invitation.createdAt).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'short',
                  day: 'numeric',
                })}
              </span>

              {/* Actions */}
              {canManageInvitations && (
                <div className="flex shrink-0 gap-2">
                  <button
                    onClick={() => handleResendInvitation(invitation)}
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    {t('resend')}
                  </button>
                  <button
                    onClick={() => handleCancelInvitation(invitation.id)}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-zinc-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    {t('cancel')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
