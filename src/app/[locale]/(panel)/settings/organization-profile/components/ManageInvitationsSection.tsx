'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@ragenai/common-ui/Button';
import { statusToast } from '@/app/lib/utils/toast';
import { cancelInvitation, resendInvitation } from '../actions/invitations';
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
  const { successToast, errorToast } = statusToast();

  const canManageInvitations = ['admin', 'owner'].includes(currentUserRole);

  const handleCancelInvitation = async (invitationId: string) => {
    if (!confirm(t('confirm-cancel'))) return;

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
      organizationId
    );
    if (result.success) {
      successToast({ message: t('resend-success') });
    } else {
      errorToast({ message: result.error || t('resend-error') });
    }
  };

  const pendingInvitations = invitations.filter(
    (inv) => inv.status === 'pending'
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {t('title')} ({pendingInvitations.length})
        </h2>
      </div>

      {/* Invitations table */}
      {pendingInvitations.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">
            {t('no-invitations')}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('email')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('status')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                  {t('sent')}
                </th>
                {canManageInvitations && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider dark:text-gray-400">
                    {t('actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200 dark:bg-gray-900 dark:divide-gray-700">
              {pendingInvitations.map((invitation) => (
                <tr key={invitation.id}>
                  {/* Email */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {invitation.email}
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        invitation.role === 'admin'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {t(`role-${invitation.role}`)}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        invitation.status === 'pending'
                          ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                          : invitation.status === 'accepted'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                          : invitation.status === 'rejected'
                          ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {t(`status-${invitation.status}`)}
                    </span>
                  </td>

                  {/* Sent date */}
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {new Date(invitation.createdAt).toLocaleDateString(
                      'pl-PL',
                      {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      }
                    )}
                  </td>

                  {/* Actions */}
                  {canManageInvitations && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                      <Button
                        onClick={() => handleResendInvitation(invitation)}
                        className="bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        {t('resend')}
                      </Button>
                      <Button
                        onClick={() => handleCancelInvitation(invitation.id)}
                        className="bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
                      >
                        {t('cancel')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
