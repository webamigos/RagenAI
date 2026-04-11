import { describe, it, expect } from 'vitest';
import toolApprovalsReducer, {
  setPendingApproval,
  clearPendingApproval,
  clearAllPendingApprovals,
  type PendingToolApproval,
  type ToolApprovalsState,
} from '../tool-approvals/toolApprovalsSlice';

const sampleApproval: PendingToolApproval = {
  approvalId: 'apr-1',
  toolCallId: 'tc-1',
  toolName: 'google_calendar__gcal_create_event',
  provider: 'google_calendar',
  createdAt: '2026-04-11T12:00:00Z',
};

function initialState(): ToolApprovalsState {
  return { pendingByThread: {} };
}

describe('toolApprovalsSlice', () => {
  it('returns the initial state with an empty map', () => {
    expect(toolApprovalsReducer(undefined, { type: '@@init' })).toEqual({
      pendingByThread: {},
    });
  });

  it('sets a pending approval for a thread', () => {
    const next = toolApprovalsReducer(
      initialState(),
      setPendingApproval({ threadId: 'thread-1', approval: sampleApproval }),
    );
    expect(next.pendingByThread['thread-1']).toEqual(sampleApproval);
  });

  it('replaces an existing approval for the same thread', () => {
    let state = toolApprovalsReducer(
      initialState(),
      setPendingApproval({ threadId: 'thread-1', approval: sampleApproval }),
    );
    const second: PendingToolApproval = {
      ...sampleApproval,
      approvalId: 'apr-2',
      toolCallId: 'tc-2',
    };
    state = toolApprovalsReducer(
      state,
      setPendingApproval({ threadId: 'thread-1', approval: second }),
    );
    expect(state.pendingByThread['thread-1']).toEqual(second);
  });

  it('keeps approvals for other threads when clearing one', () => {
    const otherApproval: PendingToolApproval = {
      ...sampleApproval,
      approvalId: 'apr-other',
      toolCallId: 'tc-other',
    };
    let state = initialState();
    state = toolApprovalsReducer(
      state,
      setPendingApproval({ threadId: 'thread-1', approval: sampleApproval }),
    );
    state = toolApprovalsReducer(
      state,
      setPendingApproval({ threadId: 'thread-2', approval: otherApproval }),
    );
    state = toolApprovalsReducer(
      state,
      clearPendingApproval({ threadId: 'thread-1' }),
    );
    expect(state.pendingByThread['thread-1']).toBeUndefined();
    expect(state.pendingByThread['thread-2']).toEqual(otherApproval);
  });

  it('clearAllPendingApprovals wipes every thread', () => {
    let state = initialState();
    state = toolApprovalsReducer(
      state,
      setPendingApproval({ threadId: 'thread-1', approval: sampleApproval }),
    );
    state = toolApprovalsReducer(
      state,
      setPendingApproval({
        threadId: 'thread-2',
        approval: { ...sampleApproval, approvalId: 'apr-2' },
      }),
    );
    state = toolApprovalsReducer(state, clearAllPendingApprovals());
    expect(state.pendingByThread).toEqual({});
  });

  it('clearing a non-existent thread is a no-op', () => {
    const state = toolApprovalsReducer(
      initialState(),
      clearPendingApproval({ threadId: 'does-not-exist' }),
    );
    expect(state.pendingByThread).toEqual({});
  });
});
