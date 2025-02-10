import { useTranslations } from 'next-intl';
import { format, subDays } from 'date-fns';

import {
  Text,
  Button,
  FolderPlusIcon,
  FolderIcon,
  BulletListIcon,
  classMerge,
  SidebarLabel,
  SidebarItem,
} from '@ragenai/common-ui';

import type { ProjectType, ThreadType } from './types';
import { useNewThread } from '@/app/hooks/useNewThread';
import { logger } from '@/app/lib/utils/logger';
import { useSidebar } from '@/app/hooks/useSidebar';

type Props = {
  projects: ProjectType[];
  setIsCreateModalOpen: (arg0: boolean) => void;
  activeThread?: string;
};

type ThreadCategory = {
  title: string;
  threads: ThreadType[];
};

export const ProjectsList = ({
  projects,
  setIsCreateModalOpen,
  activeThread,
}: Props) => {
  const t = useTranslations('sidebar');
  const { handleNewThread } = useNewThread();
  const { closeSidebar } = useSidebar();

  const handleProjectClick = async (projectId: number) => {
    try {
      await handleNewThread(projectId);
    } catch (error) {
      logger.error('Error creating thread for project:', { projectId, error });
    }
  };

  const isThreadActive = (threadId: string) => {
    return activeThread === threadId;
  };

  const getThreadTitle = (thread: ThreadType) => {
    if (thread.messages && thread.messages.length > 0) {
      const firstMessage = thread.messages[0];
      if (firstMessage?.content) {
        return firstMessage.content.length > 30
          ? `${firstMessage.content.substring(0, 30)}...`
          : firstMessage.content;
      }
    }
    return `Thread ${thread.openai_thread_id.substring(0, 8)}...`;
  };

  const categorizeThreads = (threads: ThreadType[]) => {
    const now = new Date();
    const todayDate = format(now, 'EEE MMM dd yyyy');
    const yesterdayDate = format(subDays(now, 1), 'EEE MMM dd yyyy');

    return threads.reduce(
      (acc, thread) => {
        const threadDate = format(
          new Date(thread.created_at),
          'EEE MMM dd yyyy'
        );
        if (threadDate === todayDate) acc.today.push(thread);
        else if (threadDate === yesterdayDate) acc.yesterday.push(thread);
        else acc.older.push(thread);
        return acc;
      },
      {
        today: [] as ThreadType[],
        yesterday: [] as ThreadType[],
        older: [] as ThreadType[],
      }
    );
  };

  return (
    <div className="mb-4">
      <SidebarLabel className="text-gray-600 dark:text-gray-100 font-bold p-2">
        {t('projects.title')}
      </SidebarLabel>
      {!projects.length ? (
        <Button isLink onClick={() => setIsCreateModalOpen(true)}>
          <FolderPlusIcon className="w-6 h-6" />
          <Text className="ml-1">{t('projects.create')}</Text>
        </Button>
      ) : (
        <div className="space-y-1">
          {projects.map((project) => (
            <div key={project.public_id} className="space-y-1">
              <div
                className={classMerge(
                  'w-[92%] flex items-center px-4 py-2 rounded-lg transition-colors duration-200',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  'cursor-pointer'
                )}
                onClick={() => handleProjectClick(project.id)}
                role="button"
                tabIndex={0}
                aria-label={`Select project ${project.title}`}
                onKeyDown={(e) =>
                  e.key === 'Enter' && handleProjectClick(project.id)
                }
              >
                <FolderIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
                <Text className="ml-2 truncate text-gray-700 dark:text-gray-300">
                  {project.title}
                </Text>
              </div>
              {project.threads && project.threads.length > 0 && (
                <div className="ml-6 space-y-1">
                  {(() => {
                    const { today, yesterday, older } = categorizeThreads(
                      project.threads
                    );
                    const categories: ThreadCategory[] = [
                      { title: t('chat.today'), threads: today },
                      { title: t('chat.yesterday'), threads: yesterday },
                      { title: t('chat.older'), threads: older },
                    ];

                    return categories.map(
                      ({ title, threads }) =>
                        threads.length > 0 && (
                          <div key={title} className="w-11/12">
                            <SidebarLabel className="text-gray-500 dark:text-gray-400 text-xs font-medium pl-2">
                              {title}
                            </SidebarLabel>
                            {threads.map((thread) => (
                              <SidebarItem
                                key={thread.id}
                                href={`/projects/${project.id}/threads/${thread.public_id}`}
                                current={isThreadActive(thread.id)}
                                className={classMerge(
                                  'font-normal text-gray-700',
                                  isThreadActive(thread.id)
                                    ? 'text-primary-blue-400 dark:text-gray-100'
                                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                                )}
                                onClick={() => closeSidebar()}
                              >
                                <div className="flex items-center">
                                  <BulletListIcon className="w-5 h-5 mr-2" />
                                  {getThreadTitle(thread)}
                                </div>
                              </SidebarItem>
                            ))}
                          </div>
                        )
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
