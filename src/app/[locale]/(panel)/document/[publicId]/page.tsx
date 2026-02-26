import { getTranslations } from 'next-intl/server';
import { DocumentComponent } from './DocumentComponent';

type DocumentPageProps = {
  params: Promise<{
    locale: string;
    publicId: string;
  }>;
};

export async function generateMetadata({ params }: DocumentPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return { title: t('document.title') };
}

export default async function DocumentPage({ params }: DocumentPageProps) {
  const { publicId } = await params;

  return <DocumentComponent publicId={publicId} />;
}
