import { assistantId, threadId } from '../common/utils/openai-format.js';

export type ThreadLike = {
  id: string;
  title: string | null;
  createdAt: Date | null;
  projectId: string | null;
};

/**
 * OpenAI thread object. `tool_resources` / `metadata` / `title` are
 * round-tripped as constants for now — persisting them needs schema
 * work, but clients that set metadata won't see errors.
 */
export type OpenAIThread = {
  id: string;
  object: 'thread';
  created_at: number;
  tool_resources: Record<string, never>;
  metadata: Record<string, never>;
  // Ragen extensions — exposed alongside the OpenAI shape to avoid
  // forcing two formats.
  title: string | null;
  assistant_id: string | null;
};

export function toOpenAIThread(t: ThreadLike): OpenAIThread {
  return {
    id: threadId(t.id),
    object: 'thread',
    created_at: t.createdAt ? Math.floor(t.createdAt.getTime() / 1000) : 0,
    tool_resources: {},
    metadata: {},
    title: t.title,
    assistant_id: t.projectId ? assistantId(t.projectId) : null,
  };
}

export type OpenAIDeletedThread = {
  id: string;
  object: 'thread.deleted';
  deleted: true;
};
