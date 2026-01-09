import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Suspense } from 'react';

import { PropsWihLocale } from '@/app/lib/types/types';
import { AcceptInvitationForm } from '@/app/components/Forms/AcceptInvitationForm';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

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
