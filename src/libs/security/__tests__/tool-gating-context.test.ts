import { describe, it, expect } from 'vitest';
import {
  readToolGatingContext,
  shouldPauseForApproval,
} from '../tool-gating-context';

describe('readToolGatingContext', () => {
  it('returns null for undefined', () => {
    expect(readToolGatingContext(undefined)).toBeNull();
  });

  it('returns null for null', () => {
    expect(readToolGatingContext(null)).toBeNull();
  });

  it('returns null for a primitive', () => {
    expect(readToolGatingContext('not an object')).toBeNull();
    expect(readToolGatingContext(42)).toBeNull();
  });

  it('returns null when ragContextPresent is missing', () => {
    expect(readToolGatingContext({})).toBeNull();
    expect(readToolGatingContext({ approvedToolCalls: [] })).toBeNull();
  });

  it('returns null when ragContextPresent is not a boolean', () => {
    expect(readToolGatingContext({ ragContextPresent: 'true' })).toBeNull();
    expect(readToolGatingContext({ ragContextPresent: 1 })).toBeNull();
  });

  it('normalizes a missing approvedToolCalls array to []', () => {
    const result = readToolGatingContext({ ragContextPresent: true });
    expect(result).toEqual({
      ragContextPresent: true,
      approvedToolCalls: [],
    });
  });

  it('normalizes a non-array approvedToolCalls to []', () => {
    const result = readToolGatingContext({
      ragContextPresent: true,
      approvedToolCalls: 'not an array',
    });
    expect(result?.approvedToolCalls).toEqual([]);
  });

  it('passes through a valid context unchanged', () => {
    const result = readToolGatingContext({
      ragContextPresent: true,
      approvedToolCalls: ['tc-1', 'tc-2'],
    });
    expect(result).toEqual({
      ragContextPresent: true,
      approvedToolCalls: ['tc-1', 'tc-2'],
    });
  });
});

describe('shouldPauseForApproval — Phase 2 gating decision', () => {
  it('does not pause when context is missing (non-RAG flow assumption)', () => {
    expect(shouldPauseForApproval(undefined, 'tc-1')).toBe(false);
    expect(shouldPauseForApproval(null, 'tc-1')).toBe(false);
    expect(shouldPauseForApproval({}, 'tc-1')).toBe(false);
  });

  it('does not pause when ragContextPresent is false (no exfil vector)', () => {
    expect(
      shouldPauseForApproval(
        { ragContextPresent: false, approvedToolCalls: [] },
        'tc-1',
      ),
    ).toBe(false);
  });

  it('pauses when RAG context is present and toolCallId is not approved', () => {
    expect(
      shouldPauseForApproval(
        { ragContextPresent: true, approvedToolCalls: [] },
        'tc-1',
      ),
    ).toBe(true);
  });

  it('does not pause when the toolCallId is in approvedToolCalls (Phase 2b path)', () => {
    expect(
      shouldPauseForApproval(
        { ragContextPresent: true, approvedToolCalls: ['tc-1'] },
        'tc-1',
      ),
    ).toBe(false);
  });

  it('only bypasses the matching toolCallId, not others in the same turn', () => {
    const ctx = {
      ragContextPresent: true,
      approvedToolCalls: ['tc-1'],
    };
    expect(shouldPauseForApproval(ctx, 'tc-1')).toBe(false);
    // A different write tool call in the same turn must still pause
    expect(shouldPauseForApproval(ctx, 'tc-2')).toBe(true);
  });

  it('malformed context falls through to "not paused" fail-safe', () => {
    // If someone accidentally passes { approvedToolCalls: [...] } without
    // the boolean flag, we should not silently gate — that would break
    // legitimate non-RAG flows. The safer behavior is: "without a valid
    // context, assume it's a non-RAG flow and let the tool execute."
    expect(shouldPauseForApproval({ approvedToolCalls: [] }, 'tc-1')).toBe(
      false,
    );
  });
});
