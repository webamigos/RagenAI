import { z } from 'zod';

import { ThreadCommunicationType } from '@/generated/prisma/client';

export type ThreadType = {
  created_at: string;
  public_id: string;
  visitor_id: string | null;
  preferred_communication_type: ThreadCommunicationType;
  project_id: number | null;
  preferred_model?: string | null;
  messages: {
    content: string;
  }[];
};

export type ProjectType = {
  created_at: string;
  public_id: string;
  title: string;
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
  projectPublicId: string;
  activeThread?: string;
  onClose: () => void;
};

export type ThreadItemProps = {
  thread: ThreadType;
  projectPublicId: string;
  isActive: boolean;
  onClose: () => void;
};

export type ProjectItemProps = {
  project: ProjectType;
  activeThread?: string;
  onSidebarClose: () => void;
};

export type EmptyProjectsStateProps = {
  onCreateClick: () => void;
  isLoading: boolean;
};

export type CreateProjectFormData = z.infer<typeof createProjectSchema>;

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, { error: 'projects.error.title-required' }),
});
