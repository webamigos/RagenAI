import { setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { type PropsWihLocale } from '@/app/lib/types/types';
import { AcceptInvitationForm } from '@/app/components/Forms/AcceptInvitationForm';

export async function generateMetadata() {
  return {
    title: 'Accept Invitation - Ragen AI',
  };
}

export default async function AcceptInvitationPage({ params }: PropsWihLocale) {
  const { locale } = await params;

  setRequestLocale(locale);
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AcceptInvitationForm />
    </Suspense>
  );
}
