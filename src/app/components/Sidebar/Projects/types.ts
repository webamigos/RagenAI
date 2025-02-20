import { z } from 'zod';

import { ThreadCommunicationType } from '@prisma/client';

export type ThreadType = {
  created_at: Date;
  public_id: string;
  id: string;
  visitor_id: string | null;
  preferred_communication_type: ThreadCommunicationType;
  project_id: number | null;
  messages: {
    content: string;
  }[];
};

export type ProjectType = {
  created_at: Date;
  public_id: string;
  title: string;
  id: number;
  threads: ThreadType[];
};

export type ProjectsListProps = {
  projects: ProjectType[];
  setIsCreateModalOpen: (isOpen: boolean) => void;
  activeThread?: string;
  isCreateModalOpen: boolean;
  isLoading: boolean;
  refreshProjects: () => Promise<void>;
};

export type ThreadsListProps = {
  threads: ThreadType[];
  projectId: number;
  activeThread?: string;
  onClose: () => void;
};

export type ThreadItemProps = {
  thread: ThreadType;
  projectId: number;
  isActive: boolean;
  onClose: () => void;
};

export type ProjectItemProps = {
  project: ProjectType;
  activeThread?: string;
  onProjectClick: (projectId: string) => Promise<void>;
  onSidebarClose: () => void;
};

export type EmptyProjectsStateProps = {
  onCreateClick: () => void;
  isLoading: boolean;
};

export type CreateProjectFormData = z.infer<typeof createProjectSchema>;

export const createProjectSchema = z.object({
  title: z.string().min(1, { message: 'projects.error.title-required' }),
});
