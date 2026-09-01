import { z } from 'zod';
import type { Thread } from '@/generated/prisma/browser';
import type { MessageDtoWithoutId } from '@/features/messages/contracts/message.types';

export const createThreadSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().optional(),
});

export type CreateThreadDto = z.infer<typeof createThreadSchema>;

export type ThreadHistoryResponse = {
  createdAt: string;
  id: string;
  title?: string | null;
  messages: MessageDtoWithoutId[];
  projectId?: string | null;
  preferredModel?: string | null;
  isStarred?: boolean;
};

export type SidebarThreadItem = {
  id: string;
  createdAt: string;
  isStarred: boolean;
  title: string | null;
  projectId: string | null;
  teamId: string | null;
  project: { id: string; title: string } | null;
  team: { id: string; name: string } | null;
  messages?: { content: string }[];
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
  threadId: string;
  sharedWith: ThreadShareRecipient[];
};

export type AllThreadsItem = SidebarThreadItem & {
  organizationId: string | null;
};

export type ToggleStarredResult =
  | { success: true; id: string; isStarred: boolean }
  | { success: false; errorMessage: string };

export type ProjectContext = {
  id: string;
  title: string;
};

export type ThreadContext = {
  project: ProjectContext | null;
  mentionedProject: ProjectContext | null;
  mentionedProjectId: string | null;
};

export type MessagesWithContext = {
  messages: import('@/features/messages/contracts/message.types').MessageDto[];
  threadContext: ThreadContext | null;
  isReadOnly?: boolean;
};

export type ThreadAction =
  | {
      success: true;
      thread: {
        id: Thread['id'];
        projectId: string | null;
      };
    }
  | {
      success: false;
      errorMessage: string;
    };

export type ThreadContextAction =
  | {
      success: true;
      mentionedProjectId: string | null;
    }
  | {
      success: false;
      errorMessage: string;
    };

export type PublicLinkDto = {
  publicId: string;
  threadId: string;
  threadTitle: string | null;
  expiresAt: string | null;
  hasPassword: boolean;
  createdAt: string;
};

export type CreatePublicLinkInput = {
  threadId: string;
  expiresAt: Date | null;
  password?: string;
};

export type PublicThreadResult =
  | {
      status: 'ok';
      title: string | null;
      messages: { role: 'USER' | 'ASSISTANT'; content: string }[];
      createdByName: string | null;
    }
  | { status: 'not_found' }
  | { status: 'password_required' }
  | { status: 'password_invalid' };
