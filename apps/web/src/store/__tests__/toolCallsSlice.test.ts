import { describe, expect, it } from 'vitest';
import toolCallsReducer, {
  startToolCall,
  completeToolCall,
  clearToolCalls,
} from '../tool-calls/toolCallsSlice';

const thread = 'thread-1';

function makeCall(id: string) {
  return {
    toolCallId: id,
    toolName: 'clickup__create_task',
    provider: 'CLICKUP',
    startedAt: '2026-04-16T10:00:00.000Z',
  };
}

describe('toolCallsSlice', () => {
  it('returns empty activeByThread on init', () => {
    expect(toolCallsReducer(undefined, { type: '@@init' })).toEqual({
      activeByThread: {},
    });
  });

  it('tracks concurrent tool calls per thread', () => {
    let state = toolCallsReducer(
      undefined,
      startToolCall({ threadId: thread, toolCall: makeCall('c1') }),
    );
    state = toolCallsReducer(
      state,
      startToolCall({ threadId: thread, toolCall: makeCall('c2') }),
    );
    expect(state.activeByThread[thread]?.map((c) => c.toolCallId)).toEqual([
      'c1',
      'c2',
    ]);
  });

  it('is idempotent — repeat startToolCall with same id replaces in place', () => {
    let state = toolCallsReducer(
      undefined,
      startToolCall({ threadId: thread, toolCall: makeCall('c1') }),
    );
    state = toolCallsReducer(
      state,
      startToolCall({ threadId: thread, toolCall: makeCall('c1') }),
    );
    expect(state.activeByThread[thread]).toHaveLength(1);
  });

  it('completeToolCall removes only the matching id', () => {
    let state = toolCallsReducer(
      undefined,
      startToolCall({ threadId: thread, toolCall: makeCall('c1') }),
    );
    state = toolCallsReducer(
      state,
      startToolCall({ threadId: thread, toolCall: makeCall('c2') }),
    );
    state = toolCallsReducer(
      state,
      completeToolCall({ threadId: thread, toolCallId: 'c1' }),
    );
    expect(state.activeByThread[thread]?.map((c) => c.toolCallId)).toEqual([
      'c2',
    ]);
  });

  it('completeToolCall on unknown thread is a no-op', () => {
    const state = toolCallsReducer(
      undefined,
      completeToolCall({ threadId: 'ghost', toolCallId: 'c1' }),
    );
    expect(state.activeByThread).toEqual({});
  });

  it('clearToolCalls wipes only the specified thread', () => {
    let state = toolCallsReducer(
      undefined,
      startToolCall({ threadId: thread, toolCall: makeCall('c1') }),
    );
    state = toolCallsReducer(
      state,
      startToolCall({ threadId: 'thread-2', toolCall: makeCall('c9') }),
    );
    state = toolCallsReducer(state, clearToolCalls({ threadId: thread }));
    expect(state.activeByThread[thread]).toBeUndefined();
    expect(state.activeByThread['thread-2']).toHaveLength(1);
  });
});
