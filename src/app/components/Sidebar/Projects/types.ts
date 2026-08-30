import { z } from 'zod';

import { type ThreadCommunicationType } from '@/generated/prisma/browser';

export type ThreadType = {
  createdAt: string;
  id: string;
  visitorId: string | null;
  preferredCommunicationType: ThreadCommunicationType;
  projectId: string | null;
  preferredModel?: string | null;
  title?: string | null;
  messages?: {
    content: string;
  }[];
};

export type ProjectType = {
  createdAt: string;
  id: string;
  title: string;
  threads: ThreadType[];
  isShared?: boolean;
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
  projectId: string;
  activeThread?: string;
};

export type ThreadItemProps = {
  thread: ThreadType;
  projectId: string;
  isActive: boolean;
};

export type ProjectItemProps = {
  project: ProjectType;
  activeThread?: string;
};

export type EmptyProjectsStateProps = {
  onCreateClick: () => void;
  isLoading: boolean;
};

export type CreateProjectFormData = z.infer<typeof createProjectSchema>;

export const createProjectSchema = z.object({
  title: z.string().trim().min(1, { error: 'projects.error.title-required' }),
});
