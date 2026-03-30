import type { ChainStreamPart } from '../types/common';

/**
 * Strip LiteLLM's `__thought__<base64>` suffix from tool call IDs.
 * LiteLLM embeds Claude's extended thinking content into tool call IDs when
 * proxying through the OpenAI-compatible API (which has no native thinking field).
 * We strip it here for clean logging/SSE — the AI SDK's internal tool matching
 * uses the original IDs and is unaffected.
 */
function cleanToolCallId(id: string): string {
  const idx = id.indexOf('__thought__');
  return idx !== -1 ? id.slice(0, idx) : id;
}

/**
 * Maps the Vercel AI SDK's fullStream to our simplified ChainStreamPart type.
 * Passes through text-delta, reasoning, and tool events.
 *
 * Note: AI SDK v6 uses `input`/`output` instead of `args`/`result` for tool parts.
 */
export async function* mapFullStream(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdkStream: AsyncIterable<any>,
): AsyncIterable<ChainStreamPart> {
  for await (const part of sdkStream) {
    switch (part.type) {
      case 'text-delta':
        yield { type: 'text-delta', textDelta: part.text };
        break;
      case 'reasoning-start':
        yield { type: 'reasoning-start', id: part.id };
        break;
      case 'reasoning-delta':
        yield { type: 'reasoning-delta', id: part.id, delta: part.text };
        break;
      case 'reasoning-end':
        yield { type: 'reasoning-end', id: part.id };
        break;
      case 'tool-call':
        yield {
          type: 'tool-call',
          toolCallId: cleanToolCallId(part.toolCallId),
          toolName: part.toolName,
          args: part.input ?? part.args,
        };
        break;
      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: cleanToolCallId(part.toolCallId),
          toolName: part.toolName,
          result: part.output !== undefined ? part.output : part.result,
        };
        break;
      // Ignore other event types (source, finish, finish-step, etc.)
    }
  }
}
