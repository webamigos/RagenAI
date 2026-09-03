import { z } from 'zod';
import {
  type MessageDtoWithoutId,
  type MessageDto,
} from '../messages/types.js';

/**
 * Ported from apps/web's src/features/threads/contracts/thread.types.ts.
 * See docs/adrs/21-monorepo-and-api-decoupling.md — Phase C, sixth (last)
 * slice. `events.types.ts` (SSE wire-format types) was NOT ported — nothing
 * in this slice's in-scope services/utils imports from it.
 *
 * These are a distinct, parallel set of contracts from `dto/*.ts` in this
 * same directory — those back the pre-existing, live, OpenAI-compatible
 * `ThreadsController`/`ThreadsService`. This file backs the new,
 * unwired-so-far panel-UI thread feature port below.
 */

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
  messages: MessageDto[];
  threadContext: ThreadContext | null;
  isReadOnly?: boolean;
};

export type ThreadAction =
  | {
      success: true;
      thread: {
        id: string;
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
