import { describe, it, expect } from 'vitest';

import { prepareApiSseMessage, type ApiEvent } from '../prepare-sse-message';
import type {
  ApiSseRetrieval,
  ApiSseCitations,
} from '@/features/threads/contracts/events.types';
import enMessages from '@/app/messages/en.json';

/**
 * Gap 1: the stream now carries what retrieval did. These pin the parts a
 * consumer depends on and that nothing else would catch.
 */
describe('the retrieval events', () => {
  it('serialises as SSE frames the client parser can split', () => {
    const retrieval: ApiSseRetrieval = {
      sources: [{ fileId: 'f1', fileName: 'regulamin.pdf', chunkCount: 1 }],
      chunkCount: 3,
      durationMs: 42,
    };

    const frame = prepareApiSseMessage('retrieval', retrieval);

    expect(frame).toBe(
      `event: retrieval\ndata: ${JSON.stringify(retrieval)}\n\n`,
    );
  });

  it('sends citations as ids only', () => {
    // The client already has the names from `retrieval`; sending them twice
    // invites the two copies to disagree.
    const citations: ApiSseCitations = { fileIds: ['f1'] };

    expect(prepareApiSseMessage('citations', citations)).toContain(
      '{"fileIds":["f1"]}',
    );
  });

  it.each(['retrieval', 'citations'] as ApiEvent[])(
    'has an api-events label for %s',
    (event) => {
      // `handle-assistant-stream` looks up every event name it receives as a
      // translation key, so an event added without one throws MISSING_MESSAGE
      // in the browser on a perfectly good stream.
      expect(
        (enMessages['api-events'] as Record<string, string>)[event],
      ).toBeDefined();
    },
  );
});
