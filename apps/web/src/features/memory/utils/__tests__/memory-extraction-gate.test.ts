import { describe, expect, it } from 'vitest';

import {
  memoryExtractionGate,
  type MemoryGateThread,
} from '../memory-extraction-gate';

const thread: MemoryGateThread = {
  kind: 'CHAT',
  source: 'UI',
  chatbotId: null,
  visitorId: 'user-1',
  teamId: null,
  shareCount: 0,
  hasPublicLink: false,
};
const open = {
  thread,
  sessionUserId: 'user-1',
  featureOn: true,
  extractionEnabled: true,
  turnRefused: false,
};

describe('memoryExtractionGate', () => {
  it('lets the owner’s own private panel turn through', () => {
    expect(memoryExtractionGate(open)).toBeNull();
  });

  it.each([
    ['a Brain assistant thread', { kind: 'BRAIN_OPERATOR' }],
    ['an API thread', { source: 'API' }],
    ['a chatbot embed thread', { chatbotId: 'bot-1' }],
  ])('refuses %s: panel chat only', (_case, change) => {
    expect(
      memoryExtractionGate({ ...open, thread: { ...thread, ...change } }),
    ).toBe('not-panel-chat');
  });

  // The ownership rule: a reader of someone else's thread neither gets nor
  // writes the owner's memory.
  it('refuses a turn by someone who is not the thread’s owner', () => {
    expect(memoryExtractionGate({ ...open, sessionUserId: 'user-2' })).toBe(
      'not-owner',
    );
  });

  it('refuses a request with no signed-in user', () => {
    expect(memoryExtractionGate({ ...open, sessionUserId: null })).toBe(
      'not-owner',
    );
  });

  it('refuses a thread with no owner recorded', () => {
    expect(
      memoryExtractionGate({ ...open, thread: { ...thread, visitorId: null } }),
    ).toBe('not-owner');
  });

  it.each([
    ['on a team', { teamId: 'team-1' }],
    ['shared with someone', { shareCount: 1 }],
    ['behind a public link', { hasPublicLink: true }],
  ])('refuses the owner’s thread when it is %s', (_case, change) => {
    expect(
      memoryExtractionGate({ ...open, thread: { ...thread, ...change } }),
    ).toBe('not-private');
  });

  it('refuses while the organization has personalMemory off', () => {
    expect(memoryExtractionGate({ ...open, featureOn: false })).toBe(
      'feature-off',
    );
  });

  it('refuses after the user switched extraction off', () => {
    expect(memoryExtractionGate({ ...open, extractionEnabled: false })).toBe(
      'opted-out',
    );
  });

  it('refuses a turn a guardrail or ceiling refused: it must not survive as a memory', () => {
    expect(memoryExtractionGate({ ...open, turnRefused: true })).toBe(
      'refused-turn',
    );
  });
});
