import { SupportForm } from '@/app/components/Support/SupportForm';
import { PropsWihLocale } from '@/app/lib/types/types';
import { getTranslations } from 'next-intl/server';

import { CTA } from '@/app/components/Support/CTA';
import { Container } from '@ragenai/common-ui/Container';
import { Header } from '@ragenai/common-ui/Header';

export async function generateMetadata({ params: { locale } }: PropsWihLocale) {
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('support-page.title'),
  };
}

export default function SupportPage() {
  return (
    <Container>
      <Header>Support</Header>
      <CTA />
      <SupportForm />
    </Container>
  );
}
