import { getTranslations } from 'next-intl/server';

import { UploadKnowledge } from '@/app/components/ManageKnowledge/UploadKnowledge';

type Props = {
  params: Promise<{
    locale: string;
  }>;
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:upload-document.title'),
  };
}

const AddFilesPage = () => {
  return (
    <div className="h-full flex-1 flex flex-col ml-4 lg:ml-0 gap-4">
      <UploadKnowledge />
    </div>
  );
};

export default AddFilesPage;
