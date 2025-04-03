import { useTranslations } from 'next-intl';

import { Text, OpenBookIcon, Button } from '@ragenai/common-ui';
import { Link } from '@/i18n/routing';
import { Router } from 'next/router';
import { useRouter } from 'next/navigation';

export const ManageKnowledgeButton = () => {
  const router = useRouter();
  const t = useTranslations('sidebar');

  // TODO: replace to Link component
  const handleClick = () => {
    router.push('/manage-knowledge/documents-list');
  };

  return (
    <Button
      onClick={handleClick}
      className="relative ml-4 mb-2 w-10/12 flex hover:bg-gray-200"
      isLink
    >
      <OpenBookIcon />
      <Text className="ml-1">{t('manage-knowledge')}</Text>
    </Button>
  );
};
