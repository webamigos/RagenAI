import { type PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';
import { Container } from '@ragenai/common-ui/Container';
import { Header } from '@ragenai/common-ui/Header';
import { SupportWizard } from '@/app/components/Support/SupportWizard';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('support-page.title'),
  };
}

export default async function SupportPage({ params }: PropsWihLocale) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'support-page' });

  return (
    <Container>
      <Header>{t('header')}</Header>
      <div className="max-w-lg">
        <SupportWizard context="page" />
      </div>
    </Container>
  );
}
