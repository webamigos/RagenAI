import { Text, FolderIcon, classMerge } from '@ragenai/common-ui';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';
import type { ProjectItemProps } from '../types';
import { ThreadsList } from './ThreadsList';
import { useRouter } from '@/i18n/routing';

export const ProjectItem = ({
  project,
  activeThread,
  onSidebarClose,
}: ProjectItemProps) => {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const hasThreads = project.threads.length > 0;

  useEffect(() => {
    if (
      activeThread &&
      project.threads.some((thread) => thread.public_id === activeThread)
    ) {
      setIsExpanded(true);
    }
  }, [activeThread, project.threads]);

  const handleProjectClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    router.push(`/projects/${project.public_id}`);
  };

  const handleExpandClick = (e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  return (
    <div className="space-y-1">
      <div
        className={classMerge(
          'flex items-center px-4 py-2 rounded-lg transition-colors duration-200',
          'hover:bg-gray-100 dark:hover:bg-accent-dark-500',
          'cursor-pointer'
        )}
        onClick={handleProjectClick}
        role="button"
        tabIndex={0}
        aria-label={`Select project ${project.title}`}
      >
        <div className="flex items-center flex-1">
          <FolderIcon className="w-6 h-6 text-gray-500 dark:text-gray-400" />
          <Text className="ml-2 truncate text-gray-700 dark:text-gray-300">
            {project.title}
          </Text>
        </div>
        {hasThreads && (
          <div
            onClick={handleExpandClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) =>
              e.key === 'Enter' && setIsExpanded((prev) => !prev)
            }
            aria-label={isExpanded ? 'Collapse threads' : 'Expand threads'}
            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <ChevronDownIcon
              className={classMerge(
                'w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform duration-200',
                isExpanded && 'transform -rotate-180'
              )}
            />
          </div>
        )}
      </div>
      {hasThreads && isExpanded && (
        <ThreadsList
          threads={project.threads}
          projectId={project.id}
          projectPublicId={project.public_id}
          activeThread={activeThread}
          onClose={onSidebarClose}
        />
      )}
    </div>
  );
};
