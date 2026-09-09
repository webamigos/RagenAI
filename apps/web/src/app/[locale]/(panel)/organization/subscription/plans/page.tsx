import { getTranslations, setRequestLocale } from 'next-intl/server';
import { SubscriptionPlans } from './components/subscription-plans';
import { Suspense } from 'react';
import { Fallback } from '@/app/components/Fallback';
import { Container } from '@ragenai/common-ui/Container';
import { Header } from '@ragenai/common-ui/Header';
import { Link } from '@/i18n/routing';
import { ArrowLeftIcon } from '@heroicons/react/20/solid';
import { type PropsWihLocale } from '@/app/lib/types/types';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('plans.title'),
  };
}

export default async function PlansPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'plans' });

  return (
    <Container size="2xl">
      <div className="mb-6">
        <Link
          href="/organization/subscription"
          className="flex text-sm align-middle items-center text-muted-foreground"
        >
          <ArrowLeftIcon className="w-4 h-4" />{' '}
          <span className="inline-block ml-2">{t('back-to-subscription')}</span>
        </Link>
      </div>
      <Header showDivider={false}>{t('title')}</Header>
      <Suspense fallback={<Fallback />}>
        <SubscriptionPlans />
      </Suspense>
    </Container>
  );
}
