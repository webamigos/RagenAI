import { useTranslations } from 'next-intl';

import {
  Text,
  Button,
  FolderPlusIcon,
  FolderIcon,
  classMerge,
  SidebarItem,
  SidebarLabel,
} from '@ragenai/common-ui';

import type { ProjectType } from './types';

type Props = {
  projects: ProjectType[];
  setIsCreateModalOpen: (arg0: boolean) => void;
};

export const ProjectsList = ({ projects, setIsCreateModalOpen }: Props) => {
  const t = useTranslations();

  return (
    <>
      <SidebarLabel className="text-gray-600 dark:text-gray-100 font-bold p-2">
        {t('projects')}
      </SidebarLabel>
      {!projects.length ? (
        <Button isLink onClick={() => setIsCreateModalOpen(true)}>
          <FolderPlusIcon className="w-6 h-6" />{' '}
          <Text className="ml-1">{t('create-project')}</Text>
        </Button>
      ) : (
        <div>
          {projects.map((item) => (
            <SidebarItem
              key={item.public_id}
              href={'/'}
              className={classMerge('font-normal text-gray-700')}
            >
              <FolderIcon className="w-6 h-6" />
              <Text>{item.title}</Text>
            </SidebarItem>
          ))}
        </div>
      )}
    </>
  );
};
