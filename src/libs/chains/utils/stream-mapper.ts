import type { ChainStreamPart } from '../types/common';

/**
 * Maps the Vercel AI SDK's fullStream to our simplified ChainStreamPart type.
 * Only passes through text-delta and reasoning events, ignoring everything else.
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
      // Ignore all other event types (tool-call, source, finish, etc.)
    }
  }
}
