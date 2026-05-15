import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { type PropsWihLocale } from '@/app/lib/types/types';
import { AcceptInvitationForm } from '@/app/components/Forms/AcceptInvitationForm';
import { auth } from '@/lib/auth';
import { redirect } from '@/i18n/routing';
import db from '@ragenai/prisma-client';
import { getInvitationDetails } from './actions';

export async function generateMetadata() {
  return {
    title: 'Accept Invitation - Ragen AI',
  };
}

type Props = PropsWihLocale & {
  searchParams: Promise<{ token?: string }>;
};

export default async function AcceptInvitationPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  const { token } = await searchParams;

  setRequestLocale(locale);

  // Gate server-side. Route unauthenticated visitors to sign-in if the
  // invited email already has an account, otherwise sign-up — that way new
  // invitees don't bounce off "Invalid email or password" and existing
  // members don't see a redundant registration form.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    let target: 'sign-in' | 'sign-up' = 'sign-in';
    if (token) {
      const result = await getInvitationDetails(token);
      if (result.success && result.invitation) {
        const existingUser = await db.user.findUnique({
          where: { email: result.invitation.email.toLowerCase() },
          select: { id: true },
        });
        target = existingUser ? 'sign-in' : 'sign-up';
      }
    }
    const href = token
      ? `/${target}?invitationId=${encodeURIComponent(token)}`
      : `/${target}`;
    redirect({ href, locale });
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
