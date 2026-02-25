import { useState, useEffect } from 'react';
import { FolderIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { useRouter } from '@/i18n/routing';

import { SidebarItem, SidebarLabel } from '@ragenai/tui/sidebar';
import { Button } from '@ragenai/tui/button';

import { TUIThreadsList } from './TUIThreadsList';
import type { ProjectItemProps } from '../Projects/types';

export const TUIProjectItem = ({
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

  const handleProjectClick = () => {
    router.push(`/assistants/${project.public_id}`);
  };

  const handleExpandClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setIsExpanded((prev) => !prev);
  };

  const handleExpandKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      setIsExpanded((prev) => !prev);
    }
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center">
        <SidebarItem
          onClick={handleProjectClick}
          className="flex-1"
          aria-describedby={
            hasThreads ? `threads-count-${project.public_id}` : undefined
          }
        >
          <FolderIcon data-slot="icon" className="w-6 h-6" />
          <SidebarLabel>{project.title}</SidebarLabel>
        </SidebarItem>
        {hasThreads && (
          <>
            <span id={`threads-count-${project.public_id}`} className="sr-only">
              {project.threads.length} threads available
            </span>
            <Button
              type="button"
              onClick={handleExpandClick}
              onKeyDown={handleExpandKeyDown}
              plain
              className="p-1 hover:bg-zinc-950/5 dark:hover:bg-white/5 rounded-md transition-colors ml-1 shrink-0"
              aria-label={isExpanded ? 'Collapse threads' : 'Expand threads'}
              aria-expanded={isExpanded}
              aria-controls={`threads-${project.public_id}`}
              tabIndex={0}
            >
              <ChevronDownIcon
                className={`w-4 h-4 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${
                  isExpanded ? 'rotate-180' : ''
                }`}
              />
            </Button>
          </>
        )}
      </div>
      {hasThreads && isExpanded && (
        <div
          id={`threads-${project.public_id}`}
          className="ml-6 space-y-1 animate-in slide-in-from-top-2 duration-200"
          role="region"
          aria-label={`Threads for project ${project.title}`}
        >
          <TUIThreadsList
            threads={project.threads}
            projectPublicId={project.public_id}
            activeThread={activeThread}
            onClose={onSidebarClose}
          />
        </div>
      )}
    </div>
  );
};
