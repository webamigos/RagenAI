import { toOpenAIMessage } from './messages.mapper.js';

describe('toOpenAIMessage', () => {
  const base = {
    id: 'msg-1',
    threadId: 't-1',
    role: 'USER',
    content: 'Hello',
    createdAt: new Date('2026-04-14T12:00:00Z'),
  };

  it('maps USER → user + plain text content array', () => {
    const out = toOpenAIMessage(base);
    expect(out).toMatchObject({
      id: 'msg-msg-1',
      object: 'thread.message',
      thread_id: 'thread-t-1',
      role: 'user',
      status: 'completed',
      content: [
        {
          type: 'text',
          text: { value: 'Hello', annotations: [] },
        },
      ],
      attachments: null,
      metadata: {},
    });
  });

  it('maps ASSISTANT → assistant', () => {
    const out = toOpenAIMessage({ ...base, role: 'ASSISTANT' });
    expect(out.role).toBe('assistant');
  });

  it('replaces content with placeholder when encrypted', () => {
    const out = toOpenAIMessage(base, { isEncrypted: true });
    expect(out.content[0].text.value).toContain('encrypted');
    expect(out.content[0].text.value).not.toContain('Hello');
  });

  it('empty thread_id when threadId null', () => {
    const out = toOpenAIMessage({ ...base, threadId: null });
    expect(out.thread_id).toBe('');
  });

  it('normalizes unknown role to user', () => {
    const out = toOpenAIMessage({ ...base, role: 'SYSTEM' });
    expect(out.role).toBe('user');
  });
});
