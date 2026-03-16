'use client';

import { useSelector } from 'react-redux';
import { type RootState } from '@/store';
import { FolderIcon } from '@heroicons/react/20/solid';
import { ProjectContextManager } from '../ProjectContextManager';
// Simplified Project type for context management
type ProjectForContext = {
  id: number;
  publicId: string;
  title: string;
};

interface ProjectContextIndicatorProps {
  threadId?: string;
  onContextChange?: (projectContext: any) => void;
  availableProjects?: ProjectForContext[];
}

export const ProjectContextIndicator = ({
  threadId,
  onContextChange,
  availableProjects = [],
}: ProjectContextIndicatorProps) => {
  const { threadContext } = useSelector((state: RootState) => state.assistant);

  // Show organization fallback indicator if no mentioned project but threadContext exists
  const showOrgFallback = threadContext && !threadContext.mentionedProject;

  // Show project context if mentioned project exists
  const showProjectContext = threadContext?.mentionedProject;

  // Don't show anything if no thread context at all
  if (!threadContext) {
    return null;
  }

  // If threadId is available, show the full ProjectContextManager dropdown
  if (threadId && availableProjects.length >= 0) {
    return (
      <ProjectContextManager
        threadId={threadId}
        availableProjects={availableProjects}
        onContextChange={onContextChange}
      />
    );
  }

  // Show project context indicator (read-only fallback)
  if (showProjectContext && threadContext.mentionedProject?.title) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
        <FolderIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <span className="text-sm text-blue-900 dark:text-blue-100 font-medium">
          Kontekst projektu:
        </span>
        <span className="text-sm text-blue-700 dark:text-blue-300 truncate">
          {threadContext.mentionedProject.title}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-800 px-2 py-1 rounded">
          Baza wiedzy i instrukcje
        </span>
      </div>
    );
  }

  // Show organization fallback indicator (read-only fallback)
  if (showOrgFallback) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-800 rounded-lg mb-4">
        <FolderIcon className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
        <span className="text-sm text-gray-900 dark:text-gray-100 font-medium">
          Kontekst organizacji:
        </span>
        <span className="text-sm text-gray-700 dark:text-gray-300">
          Instrukcje organizacji
        </span>
        <div className="flex-1" />
        <span className="text-xs text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
          Domyślne instrukcje
        </span>
      </div>
    );
  }

  return null;
};
