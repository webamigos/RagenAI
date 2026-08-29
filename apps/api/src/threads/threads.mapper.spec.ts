import { toOpenAIThread } from './threads.mapper.js';

describe('toOpenAIThread', () => {
  it('maps fields and prefixes ids', () => {
    const out = toOpenAIThread({
      id: 'abc',
      title: 'Daily standup',
      createdAt: new Date('2026-04-14T12:00:00Z'),
      projectId: 'proj-1',
    });
    expect(out).toEqual({
      id: 'thread-abc',
      object: 'thread',
      created_at: Math.floor(new Date('2026-04-14T12:00:00Z').getTime() / 1000),
      tool_resources: {},
      metadata: {},
      title: 'Daily standup',
      assistant_id: 'asst-proj-1',
    });
  });

  it('assistant_id null when projectId is null', () => {
    const out = toOpenAIThread({
      id: 'abc',
      title: null,
      createdAt: new Date(),
      projectId: null,
    });
    expect(out.assistant_id).toBeNull();
    expect(out.title).toBeNull();
  });

  it('created_at = 0 when createdAt null', () => {
    const out = toOpenAIThread({
      id: 'abc',
      title: null,
      createdAt: null,
      projectId: null,
    });
    expect(out.created_at).toBe(0);
  });
});
