import { ThreadCommunicationType } from '@prisma/client';

export type ThreadType = {
  created_at: Date;
  public_id: string;
  id: string;
  openai_thread_id: string;
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
  onProjectClick: (projectId: number) => Promise<void>;
  onSidebarClose: () => void;
};

export type EmptyProjectsStateProps = {
  onCreateClick: () => void;
};
