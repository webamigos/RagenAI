'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { statusToast } from '@/app/lib/utils/toast';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { cancelInvitation, resendInvitation } from '../actions/invitations';
import { ORG_ADMIN_ROLE, canManageOrg } from '@/lib/auth-access-control';
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

  const canManageInvitations = canManageOrg(currentUserRole);

  const [invitationPendingCancel, setInvitationPendingCancel] = useState<
    string | null
  >(null);

  const handleCancelInvitation = async (invitationId: string) => {
    setInvitationPendingCancel(null);

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
      <h2 className="text-base font-semibold text-foreground dark:text-white">
        {t('title')} ({pendingInvitations.length})
      </h2>

      {/* Invitations list */}
      {pendingInvitations.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-sm text-muted-foreground">{t('no-invitations')}</p>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {pendingInvitations.map((invitation) => (
            <div key={invitation.id} className="flex items-center gap-3 py-3">
              {/* Email & role */}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground dark:text-white">
                  {invitation.email}
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span
                    className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      invitation.role === ORG_ADMIN_ROLE
                        ? 'bg-accent text-primary dark:bg-primary/30'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {t(`role-${invitation.role}`)}
                  </span>
                  <span className="rounded-md bg-pending-tint px-2 py-0.5 text-xs font-medium text-pending dark:bg-pending/30">
                    {t(`status-${invitation.status}`)}
                  </span>
                </div>
              </div>

              {/* Sent date */}
              <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
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
                    className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted dark:bg-card"
                  >
                    {t('resend')}
                  </button>
                  <button
                    onClick={() => setInvitationPendingCancel(invitation.id)}
                    className="rounded-lg border border-destructive/40 bg-white px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-crimson-50 dark:bg-card dark:hover:bg-crimson-950/30"
                  >
                    {t('cancel')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={invitationPendingCancel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setInvitationPendingCancel(null);
          }
        }}
        title={t('confirm-cancel-title')}
        description={t('confirm-cancel')}
        confirmLabel={t('cancel')}
        destructive
        onConfirm={() => {
          if (invitationPendingCancel) {
            void handleCancelInvitation(invitationPendingCancel);
          }
        }}
      />
    </div>
  );
}
