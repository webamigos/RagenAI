'use client';

import { useSelector } from 'react-redux';
import { type RootState } from '@/store';
import { FolderIcon } from '@heroicons/react/20/solid';
import { ProjectContextManager } from '../ProjectContextManager';
// Simplified Project type for context management
type ProjectForContext = {
  id: string;
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
      <div className="flex items-center gap-2 px-3 py-2 bg-accent border border-primary/40 rounded-lg mb-4">
        <FolderIcon className="h-4 w-4 text-primary flex-shrink-0" />
        <span className="text-sm text-primary font-medium">
          Kontekst projektu:
        </span>
        <span className="text-sm text-primary truncate">
          {threadContext.mentionedProject.title}
        </span>
        <div className="flex-1" />
        <span className="text-xs text-primary bg-accent px-2 py-1 rounded">
          Baza wiedzy i instrukcje
        </span>
      </div>
    );
  }

  // Show organization fallback indicator (read-only fallback)
  if (showOrgFallback) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-lg mb-4">
        <FolderIcon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
        <span className="text-sm text-foreground font-medium">
          Kontekst organizacji:
        </span>
        <span className="text-sm text-foreground">
          Instrukcje organizacji
        </span>
        <div className="flex-1" />
        <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
          Domyślne instrukcje
        </span>
      </div>
    );
  }

  return null;
};
