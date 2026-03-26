import { z } from 'zod';
import type { Thread } from '@/generated/prisma/browser';
import type { MessageDtoWithoutPublicId } from '@/features/messages/contracts/message.types';

export const createThreadSchema = z.object({
  publicId: z.string().min(1),
  projectId: z.number().optional(),
});

export type CreateThreadDto = z.infer<typeof createThreadSchema>;

export type ThreadHistoryResponse = {
  createdAt: string;
  publicId: string;
  messages: MessageDtoWithoutPublicId[];
  projectId?: number | null;
  preferredModel?: string | null;
  isStarred?: boolean;
};

export type SidebarThreadItem = {
  publicId: string;
  createdAt: string;
  isStarred: boolean;
  title: string | null;
  projectId: number | null;
  teamId: string | null;
  project: { publicId: string; title: string } | null;
  team: { id: string; name: string } | null;
  messages: { content: string }[];
  sharedByUser?: { name: string | null; email: string } | null;
};

export type ThreadShareRecipient = {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  isShared: boolean;
};

export type ThreadShareInfo = {
  threadPublicId: string;
  sharedWith: ThreadShareRecipient[];
};

export type AllThreadsItem = SidebarThreadItem & {
  organizationId: string | null;
};

export type ToggleStarredResult =
  | { success: true; publicId: string; isStarred: boolean }
  | { success: false; errorMessage: string };

export type ProjectContext = {
  id: number;
  publicId: string;
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
        publicId: Thread['publicId'];
        projectId: number | null;
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
