import type { ChainStreamPart } from '../types/common';

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
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: part.input ?? part.args,
        };
        break;
      case 'tool-result':
        yield {
          type: 'tool-result',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          result: part.output !== undefined ? part.output : part.result,
        };
        break;
      // Ignore other event types (source, finish, finish-step, etc.)
    }
  }
}
