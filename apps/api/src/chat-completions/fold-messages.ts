import { type ChatMessageDto } from './dto/create-chat-completion.dto.js';

export type FoldedMessages = {
  question: string;
  chatHistory: string;
  systemPrompts: string[];
};

/**
 * Ported from ragen-app's src/app/api/v1/chat/completions/route.ts
 * (foldMessages). See docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Fold an OpenAI-style messages array into what the RAG chain expects.
 *
 * - The last `user` message becomes `question`.
 * - `user`/`assistant` turns before it become `chat_history`, using the
 *   `"USER: ..."`/`"ASSISTANT: ..."` format that `formatChatHistory()`
 *   in `basic-rag/operations.ts` parses. The prefix casing matters —
 *   anything else is silently dropped by the parser.
 * - `system` messages are pulled out into `systemPrompts` so the caller
 *   can merge them into the chain's `projectInstruction` (the chain
 *   parser has no `SYSTEM:` branch, so they can't ride the history).
 * - If no user message is present we fall back to the last message as
 *   the prompt — the DTO's `ArrayMinSize(1)` guarantees at least one.
 */
export function foldMessages(messages: ChatMessageDto[]): FoldedMessages {
  const systemPrompts = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content);

  const conversation = messages.filter((m) => m.role !== 'system');

  if (conversation.length === 0) {
    return {
      question: messages[messages.length - 1].content,
      chatHistory: '',
      systemPrompts,
    };
  }

  let lastUserIdx = -1;
  for (let i = conversation.length - 1; i >= 0; i -= 1) {
    if (conversation[i].role === 'user') {
      lastUserIdx = i;
      break;
    }
  }

  if (lastUserIdx === -1) {
    return {
      question: conversation[conversation.length - 1].content,
      chatHistory: '',
      systemPrompts,
    };
  }

  const question = conversation[lastUserIdx].content;
  const history = conversation
    .slice(0, lastUserIdx)
    .map((m) => `${m.role === 'user' ? 'USER' : 'ASSISTANT'}: ${m.content}`)
    .join('\n');

  return { question, chatHistory: history, systemPrompts };
}

/**
 * Merge caller-supplied `system` messages with the project's existing
 * instructions. Order: project instruction first (the owner's intent),
 * then the caller's system messages appended as per-request overrides.
 */
export function mergeProjectInstruction(
  projectInstruction: string | null | undefined,
  systemPrompts: string[],
): string | null {
  const parts: string[] = [];
  if (projectInstruction?.trim()) {
    parts.push(projectInstruction);
  }
  for (const p of systemPrompts) {
    if (p.trim()) {
      parts.push(p);
    }
  }
  if (parts.length === 0) {
    return null;
  }
  return parts.join('\n\n');
}
