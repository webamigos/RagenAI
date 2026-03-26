import { z } from 'zod';

import { type ThreadCommunicationType } from '@/generated/prisma/browser';

export type ThreadType = {
  createdAt: string;
  publicId: string;
  visitorId: string | null;
  preferredCommunicationType: ThreadCommunicationType;
  projectId: number | null;
  preferredModel?: string | null;
  title?: string | null;
  messages?: {
    content: string;
  }[];
};

export type ProjectType = {
  createdAt: string;
  publicId: string;
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
