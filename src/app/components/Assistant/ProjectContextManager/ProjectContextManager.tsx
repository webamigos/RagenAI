'use client';

import { useState, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import {
  FolderIcon,
  ChevronDownIcon,
  BuildingOfficeIcon,
  CheckIcon,
} from '@heroicons/react/20/solid';
import { setThreadContext } from '@/store/assistant/assistantSlice';
import { updateThreadContextAction } from '@/app/lib/actions/threads';
import { statusToast } from '@/app/lib/utils/toast';

type ProjectForContext = {
  id: number;
  public_id: string;
  title: string;
};

interface ProjectContextManagerProps {
  threadId: string;
  availableProjects: ProjectForContext[];
  onContextChange?: (projectContext: any) => void;
}

export const ProjectContextManager = ({
  threadId,
  availableProjects,
  onContextChange,
}: ProjectContextManagerProps) => {
  const dispatch = useDispatch();
  const { threadContext } = useSelector((state: RootState) => state.assistant);
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const { successToast, errorToast } = statusToast();

  const currentMentionedProject = threadContext?.mentionedProject;
  const currentProject = threadContext?.project;

  const handleProjectSelect = async (project: ProjectForContext | null) => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      const result = await updateThreadContextAction(
        threadId,
        project?.id || null
      );

      if (result.success) {
        const updatedContext = {
          project: threadContext?.project || null,
          mentionedProject: project
            ? {
                id: project.id,
                public_id: project.public_id,
                title: project.title,
              }
            : null,
          mentionedProjectId: project?.id || null,
        };

        dispatch(setThreadContext(updatedContext));
        onContextChange?.(updatedContext);

        if (project) {
          successToast({
            message: `Kontekst zmieniony na projekt: ${project.title}`,
          });
        } else {
          successToast({
            message: 'Używane są instrukcje organizacji',
          });
        }

        setIsOpen(false);
      } else {
        errorToast({
          message:
            result.errorMessage || 'Nie udało się zmienić kontekstu projektu',
        });
      }
    } catch (error) {
      errorToast({ message: 'Wystąpił błąd podczas zmiany kontekstu' });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveContext = () => {
    handleProjectSelect(null);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('[data-project-context-manager]')) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () =>
        document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const getCurrentLabel = () => {
    if (currentMentionedProject) {
      return `Projekt: ${currentMentionedProject.title}`;
    }
    if (currentProject) {
      return `Asystent: ${currentProject.title}`;
    }
    return 'Instrukcje organizacji';
  };

  const getCurrentIcon = () => {
    if (currentMentionedProject || currentProject) {
      return <FolderIcon className="h-4 w-4" />;
    }
    return <BuildingOfficeIcon className="h-4 w-4" />;
  };

  return (
    <div className="relative" data-project-context-manager>
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isUpdating}
        className="flex items-center gap-1 md:gap-2 px-2 py-1 md:px-3 md:py-2 text-xs md:text-sm border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 min-w-0"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {getCurrentIcon()}
          <span className="truncate">{getCurrentLabel()}</span>
        </div>
        <ChevronDownIcon
          className={`h-4 w-4 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 min-w-full w-72 md:w-80 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
          {/* Organization option */}
          <button
            onClick={() => handleRemoveContext()}
            disabled={isUpdating}
            className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
          >
            <BuildingOfficeIcon className="h-4 w-4 text-gray-600 dark:text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Instrukcje organizacji
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Domyślne ustawienia organizacji
              </div>
            </div>
            {!currentMentionedProject && !currentProject && (
              <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
            )}
          </button>

          {/* Divider */}
          {availableProjects.length > 0 && (
            <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
          )}

          {/* Project options */}
          {availableProjects.map((project) => {
            const isSelected = currentMentionedProject?.id === project.id;
            const isCurrentThreadProject =
              currentProject?.id === project.id && !currentMentionedProject;

            return (
              <button
                key={project.id}
                onClick={() => handleProjectSelect(project)}
                disabled={isUpdating}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <FolderIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.title}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {isSelected
                      ? 'Wymieniony projekt (@)'
                      : isCurrentThreadProject
                      ? 'Projekt wątku (domyślny)'
                      : `ID: ${project.public_id}`}
                  </div>
                </div>
                {(isSelected || isCurrentThreadProject) && (
                  <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                )}
              </button>
            );
          })}

          {availableProjects.length === 0 && (
            <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
              Brak dostępnych projektów
            </div>
          )}
        </div>
      )}
    </div>
  );
};
