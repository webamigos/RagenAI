import { messageId, threadId } from '../common/utils/openai-format.js';

export type MessageLike = {
  id: string;
  threadId: string | null;
  role: string;
  content: string;
  createdAt: Date | null;
};

/**
 * OpenAI thread message object. Content is an array of typed parts
 * (text blocks, images, etc.) — we only emit `text` today since
 * messages in Ragen are plain strings.
 */
export type OpenAIMessage = {
  id: string;
  object: 'thread.message';
  created_at: number;
  thread_id: string;
  status: 'completed' | 'in_progress' | 'incomplete';
  role: 'user' | 'assistant';
  content: Array<{
    type: 'text';
    text: { value: string; annotations: [] };
  }>;
  attachments: [] | null;
  metadata: Record<string, never>;
};

function normalizeRole(role: string): 'user' | 'assistant' {
  return role.toUpperCase() === 'ASSISTANT' ? 'assistant' : 'user';
}

/**
 * Build an OpenAI thread.message from a Ragen Message row.
 *
 * If the owning thread is KMS-encrypted (caller sets
 * `isEncrypted: true`), the `content` field is surfaced as a
 * placeholder rather than the ciphertext — ragen-api can't decrypt
 * (KMS isn't wired here), and returning raw ciphertext would mislead
 * callers into thinking it's plain text. Clients that need the real
 * text should read through ragen-app's UI flow.
 */
export function toOpenAIMessage(
  msg: MessageLike,
  opts: { isEncrypted?: boolean } = {},
): OpenAIMessage {
  const text = opts.isEncrypted
    ? '[encrypted — open this thread in the dashboard to view]'
    : msg.content;

  return {
    id: messageId(msg.id),
    object: 'thread.message',
    created_at: msg.createdAt ? Math.floor(msg.createdAt.getTime() / 1000) : 0,
    thread_id: msg.threadId ? threadId(msg.threadId) : '',
    status: 'completed',
    role: normalizeRole(msg.role),
    content: [
      {
        type: 'text',
        text: { value: text, annotations: [] },
      },
    ],
    attachments: null,
    metadata: {},
  };
}
