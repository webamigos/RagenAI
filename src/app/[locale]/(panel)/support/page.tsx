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

export default function SupportPage() {
  return (
    <Container>
      <Header>Support</Header>
      <div className="max-w-lg">
        <SupportWizard context="page" />
      </div>
    </Container>
  );
}
