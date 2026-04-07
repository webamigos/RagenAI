import { describe, it, expect } from 'vitest';
import { getThreadTitle } from '../threadUtils';

describe('getThreadTitle', () => {
  const baseThread = {
    createdAt: '2026-03-26T00:00:00Z',
    id: 'abc12345-6789-0000-0000-000000000000',
    visitorId: null,
    preferredCommunicationType: 'TEXT' as const,
    projectId: null,
  };

  it('returns thread.title when present', () => {
    const thread = { ...baseThread, title: 'My Chat Title' };
    expect(getThreadTitle(thread)).toBe('My Chat Title');
  });

  it('truncates long titles to 30 chars', () => {
    const thread = {
      ...baseThread,
      title: 'This is a very long thread title that exceeds thirty characters',
    };
    expect(getThreadTitle(thread)).toBe('This is a very long thread tit...');
  });

  it('returns fallback when no title', () => {
    const thread = { ...baseThread, title: null };
    expect(getThreadTitle(thread)).toBe('New conversation');
  });

  it('returns fallback when title is undefined', () => {
    const thread = { ...baseThread };
    expect(getThreadTitle(thread)).toBe('New conversation');
  });
});
