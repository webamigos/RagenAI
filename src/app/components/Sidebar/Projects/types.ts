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
