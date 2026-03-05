'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@ragenai/common-ui/Card';
import { Button } from '@ragenai/common-ui/Button';
import { Logo } from '@/app/components/Logo';
import { useRouter } from '@/i18n/routing';
import { useSession } from '@/app/hooks/use-better-auth';
import { statusToast } from '@/app/lib/utils/toast';
import {
  getInvitationDetails,
  acceptInvitation,
  rejectInvitation,
} from '@/app/[locale]/(auth)/accept-invitation/actions';

type InvitationDetails = {
  id: string;
  email: string;
  role: string;
  organizationId: string;
  organizationName: string;
  expiresAt: Date;
};

export const AcceptInvitationForm = () => {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const t = useTranslations('accept-invitation');
  const { push } = useRouter();
  const locale = useLocale();
  const { data: session, isPending: sessionLoading } = useSession();
  const { successToast } = statusToast();

  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  useEffect(() => {
    async function loadInvitation() {
      if (!token) {
        setError(t('invalid-token'));
        setLoading(false);
        return;
      }

      // Wait for session to load
      if (sessionLoading) {
        return;
      }

      // If not logged in, redirect to sign-up with invitationId
      if (!session?.user) {
        push(`/sign-up?invitationId=${token}`);
        return;
      }

      // Fetch invitation details
      const result = await getInvitationDetails(token);
      if (!result.success) {
        setError(result.error || t('error-loading'));
        setLoading(false);
        return;
      }

      setInvitation(result.invitation!);
      setLoading(false);
    }

    loadInvitation();
  }, [token, session, sessionLoading, push, t]);

  const handleAccept = async () => {
    if (!token) {
      return;
    }

    setIsAccepting(true);
    setError(null);

    try {
      const result = await acceptInvitation(token);

      if (!result.success) {
        if (result.requiresAuth) {
          push(`/sign-up?invitationId=${token}`);
          return;
        }
        setError(result.error || t('error-accepting'));
        return;
      }

      successToast({ message: t('success-message') });

      // Redirect to home page - use window.location.href to force full page reload
      setTimeout(() => {
        window.location.href = `/${locale}/`;
      }, 1000);
    } catch (err) {
      setError(t('error-accepting'));
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    if (!token || !confirm(t('confirm-reject'))) {
      return;
    }

    setIsRejecting(true);
    setError(null);

    try {
      const result = await rejectInvitation(token);

      if (!result.success) {
        setError(result.error || t('error-rejecting'));
        return;
      }

      successToast({ message: t('rejected-message') });

      // Redirect to home page - use window.location.href to force full page reload
      setTimeout(() => {
        window.location.href = `/${locale}/`;
      }, 1000);
    } catch (err) {
      setError(t('error-rejecting'));
    } finally {
      setIsRejecting(false);
    }
  };

  if (loading || sessionLoading) {
    return (
      <Card>
        <Logo className="h-8 mb-4" />
        <div className="text-center py-8">
          <p className="text-gray-600 dark:text-gray-400">{t('loading')}</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Logo className="h-8 mb-4" />
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
            {t('error-title')}
          </h2>
          <p className="text-red-600 dark:text-red-500 mb-6">{error}</p>
          <Button
            onClick={() => (window.location.href = `/${locale}/`)}
            className="bg-indigo-600 text-white"
          >
            {t('go-home')}
          </Button>
        </div>
      </Card>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <Card>
      <Logo className="h-8 mb-4" />
      <div className="py-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
          {t('title')}
        </h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {t('description')}
        </p>

        {/* Invitation details */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-6">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('organization')}
              </p>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                {invitation.organizationName}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('role')}
              </p>
              <p className="text-base font-medium text-gray-900 dark:text-gray-100">
                {t(`role-${invitation.role}`)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('email')}
              </p>
              <p className="text-base text-gray-900 dark:text-gray-100">
                {invitation.email}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {t('expires')}
              </p>
              <p className="text-base text-gray-900 dark:text-gray-100">
                {new Date(invitation.expiresAt).toLocaleDateString(locale, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-3">
          <Button
            onClick={handleAccept}
            isLoading={isAccepting}
            disabled={isRejecting}
            className="flex-1 bg-indigo-600 text-white hover:bg-indigo-700"
          >
            {t('accept-button')}
          </Button>
          <Button
            onClick={handleReject}
            isLoading={isRejecting}
            disabled={isAccepting}
            className="flex-1 bg-gray-200 text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            {t('reject-button')}
          </Button>
        </div>

        {error && (
          <p className="text-sm text-red-600 dark:text-red-500 mt-4">{error}</p>
        )}
      </div>
    </Card>
  );
};
