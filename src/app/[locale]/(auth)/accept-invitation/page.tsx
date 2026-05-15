import { headers } from 'next/headers';
import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { type PropsWihLocale } from '@/app/lib/types/types';
import { AcceptInvitationForm } from '@/app/components/Forms/AcceptInvitationForm';
import { auth } from '@/lib/auth';
import { redirect } from '@/i18n/routing';

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

  // Gate server-side. Send unauthenticated visitors to sign-in (not sign-up) —
  // most invitees already have an account elsewhere, and the sign-in page
  // links to sign-up if they don't.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    const href = token
      ? `/sign-in?invitationId=${encodeURIComponent(token)}`
      : '/sign-in';
    redirect({ href, locale });
  }

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
