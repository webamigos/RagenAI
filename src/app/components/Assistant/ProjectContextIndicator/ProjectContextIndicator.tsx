'use client';

import { useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  FolderIcon,
  XMarkIcon,
  ChevronDownIcon,
} from '@heroicons/react/20/solid';
import { setThreadContext } from '@/store/assistant/assistantSlice';
import { removeThreadContextAction } from '@/app/lib/actions/threads';
import { statusToast } from '@/app/lib/utils/toast';
import { ProjectContextManager } from '../ProjectContextManager';
// Simplified Project type for context management
type ProjectForContext = {
  id: number;
  public_id: string;
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
  const dispatch = useDispatch();
  const { threadContext } = useSelector((state: RootState) => state.assistant);
  const [isRemoving, setIsRemoving] = useState(false);
  const { successToast, errorToast } = statusToast();

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
      <div className="mb-4">
        <ProjectContextManager
          threadId={threadId}
          availableProjects={availableProjects}
          onContextChange={onContextChange}
        />
      </div>
    );
  }

  // Fallback: show read-only indicators when no threadId (shouldn't happen in practice)
  const handleRemoveContext = async () => {
    if (!threadId || isRemoving) return;

    setIsRemoving(true);
    try {
      const result = await removeThreadContextAction(threadId);

      if (result.success) {
        // Update local state - context becomes null (organization fallback)
        const updatedContext = {
          ...threadContext,
          mentionedProject: null,
          mentionedProjectId: null,
        };

        dispatch(setThreadContext(updatedContext));
        onContextChange?.(updatedContext);

        successToast({
          message:
            'Kontekst projektu usunięty. Używane są instrukcje organizacji.',
        });
      } else {
        errorToast({
          message:
            result.errorMessage || 'Nie udało się usunąć kontekstu projektu',
        });
      }
    } catch (error) {
      errorToast({ message: 'Wystąpił błąd podczas usuwania kontekstu' });
    } finally {
      setIsRemoving(false);
    }
  };

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
