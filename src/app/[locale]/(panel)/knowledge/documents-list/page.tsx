import { getTranslations } from 'next-intl/server';

import { DocumentsListContent } from './DocumentsListContent';

type Props = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:document-list.title'),
  };
}

const UploadedListPage = () => {
  return <DocumentsListContent />;
};

export default UploadedListPage;
