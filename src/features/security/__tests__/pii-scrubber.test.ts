import { describe, it, expect } from 'vitest';
import { scrubPii } from '../utils/pii-scrubber';

describe('scrubPii', () => {
  it('returns an empty object when given null or undefined', () => {
    expect(scrubPii(null)).toEqual({});
    expect(scrubPii(undefined)).toEqual({});
  });

  it('redacts top-level secret keys', () => {
    const result = scrubPii({
      password: 'hunter2',
      token: 'abc',
      secret: 'xyz',
      accessToken: 'at',
      refreshToken: 'rt',
      clientSecret: 'cs',
    });
    expect(result.password).toBe('[REDACTED]');
    expect(result.token).toBe('[REDACTED]');
    expect(result.secret).toBe('[REDACTED]');
    expect(result.accessToken).toBe('[REDACTED]');
    expect(result.refreshToken).toBe('[REDACTED]');
    expect(result.clientSecret).toBe('[REDACTED]');
  });

  it('redacts raw content keys (prompt-injection-era keys)', () => {
    const result = scrubPii({
      content: 'raw doc content',
      pageContent: 'chunk text',
      message: 'user typed this',
      prompt: 'system prompt',
      input: 'raw input',
      output: 'raw output',
      rawText: 'stuff',
      pasted: 'pasted blob',
    });
    expect(result.content).toBe('[REDACTED]');
    expect(result.pageContent).toBe('[REDACTED]');
    expect(result.message).toBe('[REDACTED]');
    expect(result.prompt).toBe('[REDACTED]');
    expect(result.input).toBe('[REDACTED]');
    expect(result.output).toBe('[REDACTED]');
    expect(result.rawText).toBe('[REDACTED]');
    expect(result.pasted).toBe('[REDACTED]');
  });

  it('recursively redacts secrets in nested objects', () => {
    const result = scrubPii({
      user: {
        id: 'user-123',
        credentials: {
          password: 'hunter2',
          apiKey: 'sk-abc',
        },
      },
    });
    const user = result.user as Record<string, unknown>;
    const credentials = user.credentials as Record<string, unknown>;
    expect(user.id).toBe('user-123');
    expect(credentials.password).toBe('[REDACTED]');
    expect(credentials.apiKey).toBe('[REDACTED]');
  });

  it('recursively redacts secrets inside arrays of objects', () => {
    const result = scrubPii({
      events: [
        { name: 'login', token: 'abc' },
        { name: 'logout', token: 'def' },
      ],
    });
    const events = result.events as Record<string, unknown>[];
    expect(events[0].name).toBe('login');
    expect(events[0].token).toBe('[REDACTED]');
    expect(events[1].token).toBe('[REDACTED]');
  });

  it('leaves non-sensitive fields intact', () => {
    const result = scrubPii({
      eventType: 'AUTH_LOGIN_FAILED',
      attempts: 5,
      ipAddress: '192.168.1.1',
      nested: { count: 3, sources: ['api', 'web'] },
    });
    expect(result.eventType).toBe('AUTH_LOGIN_FAILED');
    expect(result.attempts).toBe(5);
    expect(result.ipAddress).toBe('192.168.1.1');
    expect(result.nested).toEqual({ count: 3, sources: ['api', 'web'] });
  });

  it('does not mutate the input object', () => {
    const input = { password: 'hunter2', count: 5 };
    scrubPii(input);
    expect(input.password).toBe('hunter2');
  });
});
