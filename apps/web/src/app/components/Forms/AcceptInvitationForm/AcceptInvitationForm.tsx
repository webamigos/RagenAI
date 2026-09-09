'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@ragenai/common-ui/Card';
import { Button } from '@ragenai/common-ui/Button';
import { Logo } from '@/app/components/Logo';
import { useRouter } from '@/i18n/routing';
import { useSession } from '@/app/hooks/use-better-auth';
import { statusToast } from '@/app/lib/utils/toast';
import { ConfirmDialog } from '@/app/components/ConfirmDialog';
import { hardNavigate } from '@/libs/navigation/hard-navigate';
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
  const [isRejectConfirmOpen, setIsRejectConfirmOpen] = useState(false);
  // Acceptance flips this; the redirect in setTimeout fires ~1s later. In
  // between, `setActiveOrganization` updates `session`, which would otherwise
  // re-run the useEffect below, re-fetch the invitation, and surface a stale
  // "already accepted" error in the UI alongside the success toast.
  const submittedRef = useRef(false);

  useEffect(() => {
    if (submittedRef.current) {
      return;
    }
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

      // Server-side gate normally handles this; client-side fallback
      // redirects to sign-in (sign-up reachable from there) for the rare
      // case where the session expires between gate and render.
      if (!session?.user) {
        push(`/sign-in?invitationId=${encodeURIComponent(token)}`);
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
          push(`/sign-in?invitationId=${encodeURIComponent(token)}`);
          return;
        }
        setError(result.error || t('error-accepting'));
        return;
      }

      submittedRef.current = true;
      successToast({ message: t('success-message') });

      setTimeout(() => {
        hardNavigate(locale, '/new');
      }, 1000);
    } catch (err) {
      setError(t('error-accepting'));
    } finally {
      setIsAccepting(false);
    }
  };

  const handleReject = async () => {
    setIsRejectConfirmOpen(false);

    if (!token) {
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

      submittedRef.current = true;
      successToast({ message: t('rejected-message') });

      setTimeout(() => {
        hardNavigate(locale, '/new');
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
          <p className="text-muted-foreground">{t('loading')}</p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <Logo className="h-8 mb-4" />
        <div className="text-center py-8">
          <h2 className="text-xl font-semibold text-foreground mb-4">
            {t('error-title')}
          </h2>
          <p className="text-destructive mb-6">{error}</p>
          <Button
            onClick={() => hardNavigate(locale, '/new')}
            className="bg-brand-600 text-primary-foreground"
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
        <h2 className="text-2xl font-bold text-foreground mb-2">
          {t('title')}
        </h2>
        <p className="text-muted-foreground mb-6">{t('description')}</p>

        {/* Invitation details */}
        <div className="bg-muted rounded-lg p-4 mb-6">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-muted-foreground">
                {t('organization')}
              </p>
              <p className="text-lg font-semibold text-foreground">
                {invitation.organizationName}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('role')}</p>
              <p className="text-base font-medium text-foreground">
                {t(`role-${invitation.role}`)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('email')}</p>
              <p className="text-base text-foreground">{invitation.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('expires')}</p>
              <p className="text-base text-foreground">
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
            className="flex-1 bg-brand-600 text-primary-foreground hover:bg-brand-700"
          >
            {t('accept-button')}
          </Button>
          <Button
            onClick={() => setIsRejectConfirmOpen(true)}
            isLoading={isRejecting}
            disabled={isAccepting}
            className="flex-1 bg-paper-200 text-foreground hover:bg-paper-300 dark:bg-paper-700 dark:hover:bg-paper-600"
          >
            {t('reject-button')}
          </Button>
        </div>

        {error && <p className="text-sm text-destructive mt-4">{error}</p>}
      </div>

      <ConfirmDialog
        open={isRejectConfirmOpen}
        onOpenChange={setIsRejectConfirmOpen}
        title={t('confirm-reject-title')}
        description={t('confirm-reject')}
        confirmLabel={t('reject-button')}
        destructive
        onConfirm={() => void handleReject()}
      />
    </Card>
  );
};
