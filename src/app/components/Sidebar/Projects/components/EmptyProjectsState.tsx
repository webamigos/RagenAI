import { useTranslations } from 'next-intl';
import { Text, Button, FolderPlusIcon } from '@ragenai/common-ui';
import { EmptyProjectsStateProps } from '../types';

export const EmptyProjectsState = ({
  onCreateClick,
}: EmptyProjectsStateProps) => {
  const t = useTranslations('sidebar.projects');

  return (
    <Button isLink onClick={onCreateClick}>
      <FolderPlusIcon className="w-6 h-6" />
      <Text className="ml-1">{t('create-project')}</Text>
    </Button>
  );
};
