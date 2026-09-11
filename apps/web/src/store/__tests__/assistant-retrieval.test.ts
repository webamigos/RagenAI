import { describe, it, expect } from 'vitest';

import reducer, {
  setPendingRetrieval,
  setPendingCitations,
  attachPendingRetrieval,
  clearPendingRetrieval,
  clearMessages,
} from '../assistant/assistantSlice';

const THREAD = 'thread-a';

const RETRIEVAL = {
  sources: [{ fileId: 'a', fileName: 'umowa.pdf', chunkCount: 1 }],
  chunkCount: 3,
  durationMs: 42,
  threadId: THREAD,
};

/** What `attachPendingRetrieval` files: the turn without its thread tag. */
const { threadId: _tag, ...FILED } = RETRIEVAL;

const run = (actions: { type: string; payload?: unknown }[]) =>
  actions.reduce(
    (state, action) => reducer(state, action as never),
    reducer(undefined, { type: '@@INIT' }),
  );

describe('retrieval, from before the message exists to filed under it', () => {
  it('holds the turn pending, because the message has no id yet', () => {
    // `retrieval` is sent ahead of the first token so the row can render while
    // the answer streams; the id only arrives with `final_response`.
    const state = run([setPendingRetrieval(RETRIEVAL)]);

    expect(state.pendingRetrieval).toEqual({ ...RETRIEVAL, citedFileIds: [] });
    expect(state.retrievalByMessage).toEqual({});
  });

  it('files it under the id when the answer is saved', () => {
    const state = run([
      setPendingRetrieval(RETRIEVAL),
      setPendingCitations(['a']),
      attachPendingRetrieval('msg-1'),
    ]);

    // Filed without the thread tag: a message id is unique across threads, and
    // this map is only ever read through the current thread's messages.
    expect(state.retrievalByMessage['msg-1']).toEqual({
      ...FILED,
      citedFileIds: ['a'],
    });
    expect(state.pendingRetrieval).toBeNull();
  });

  it('attaches nothing when the turn never retrieved', () => {
    // Conversation mode and MODEL_ONLY threads send no retrieval event, so
    // `final_response` finds nothing pending — a no-op, not an empty entry
    // that would render as "searched and found nothing".
    const state = run([attachPendingRetrieval('msg-1')]);

    expect(state.retrievalByMessage).toEqual({});
  });

  it('does not invent a pending turn from a stray citations event', () => {
    const state = run([setPendingCitations(['a'])]);

    expect(state.pendingRetrieval).toBeNull();
  });

  it('keeps each turn separate across two answers', () => {
    const second = {
      sources: [{ fileId: 'b', fileName: 'regulamin.pdf', chunkCount: 1 }],
      chunkCount: 1,
      durationMs: 7,
      threadId: THREAD,
    };
    const state = run([
      setPendingRetrieval(RETRIEVAL),
      attachPendingRetrieval('msg-1'),
      setPendingRetrieval(second),
      setPendingCitations(['b']),
      attachPendingRetrieval('msg-2'),
    ]);

    expect(state.retrievalByMessage['msg-1'].citedFileIds).toEqual([]);
    expect(state.retrievalByMessage['msg-2'].sources[0].fileId).toBe('b');
  });

  it('does not carry a half-finished turn into the next answer', () => {
    // A `retrieval` event followed by a stream error leaves the turn pending.
    // Without a turn-start reset the *next* answer's `final_response` files
    // the previous turn's sources under it — the misattribution this feature
    // exists to avoid, arriving through the back door. `clearMessages` does
    // not cover it: that fires when a thread is created, and this happens
    // inside one thread.
    const state = run([
      setPendingRetrieval(RETRIEVAL),
      // …stream dies here, no final_response…
      clearPendingRetrieval({ threadId: THREAD }),
      attachPendingRetrieval('msg-2'),
    ]);

    expect(state.retrievalByMessage).toEqual({});
  });

  /**
   * The reset is scoped to the thread that fired it. A new turn in thread B
   * must not discard the turn thread A is still streaming — `final_response`
   * would then find nothing to file and A would lose its sources for good.
   */
  it("leaves another thread's pending turn alone", () => {
    const state = run([
      setPendingRetrieval(RETRIEVAL),
      clearPendingRetrieval({ threadId: 'thread-b' }),
    ]);

    expect(state.pendingRetrieval).toEqual({
      ...RETRIEVAL,
      citedFileIds: [],
    });
  });

  it('is dropped with the messages it describes', () => {
    // Otherwise one thread's sources would land under another thread's answer
    // the moment a message id repeated.
    const state = run([
      setPendingRetrieval(RETRIEVAL),
      attachPendingRetrieval('msg-1'),
      clearMessages(),
    ]);

    expect(state.retrievalByMessage).toEqual({});
    expect(state.pendingRetrieval).toBeNull();
  });
});
