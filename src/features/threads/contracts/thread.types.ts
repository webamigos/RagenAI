import { z } from 'zod';
import type { Thread } from '@/generated/prisma/browser';
import type { MessageDtoWithoutPublicId } from '@/features/messages/contracts/message.types';

export const createThreadSchema = z.object({
  public_id: z.string().min(1),
  project_id: z.number().optional(),
});

export type CreateThreadDto = z.infer<typeof createThreadSchema>;

export type ThreadHistoryResponse = {
  created_at: string;
  public_id: string;
  messages: MessageDtoWithoutPublicId[];
  project_id?: number | null;
  preferred_model?: string | null;
  is_starred?: boolean;
};

export type SidebarThreadItem = {
  public_id: string;
  created_at: string;
  is_starred: boolean;
  title: string | null;
  project_id: number | null;
  project: { public_id: string; title: string } | null;
  messages: { content: string }[];
};

export type AllThreadsItem = SidebarThreadItem & {
  organization_id: string | null;
};

export type ToggleStarredResult =
  | { success: true; public_id: string; is_starred: boolean }
  | { success: false; errorMessage: string };

export type ProjectContext = {
  id: number;
  public_id: string;
  title: string;
};

export type ThreadContext = {
  project: ProjectContext | null;
  mentionedProject: ProjectContext | null;
  mentionedProjectId: number | null;
};

export type MessagesWithContext = {
  messages: import('@/features/messages/contracts/message.types').MessageDto[];
  threadContext: ThreadContext | null;
};

export type ThreadAction =
  | {
      success: true;
      thread: {
        public_id: Thread['public_id'];
        project_id?: number;
      };
    }
  | {
      success: false;
      errorMessage: string;
    };

export type ThreadContextAction =
  | {
      success: true;
      mentionedProjectId: number | null;
    }
  | {
      success: false;
      errorMessage: string;
    };
