import { getTranslations } from 'next-intl/server';

import { FileListWrapper } from '@/app/components/ManageKnowledge/UserFiles/UserFilesWrapper';

type Props = {
  params: {
    locale: string;
  };
};

export async function generateMetadata({ params }: Props) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'Metadata' });

  return {
    title: t('manage-knowledge:document-list.title'),
  };
}

const UploadedListPage = () => {
  return (
    <div className="h-screen-minus-10 flex-1 flex flex-col pb-5 pl-4 lg:pl-0 gap-4 overflow-hidden">
      <FileListWrapper />
    </div>
  );
};

export default UploadedListPage;
