import { describe, it, expect } from 'vitest';
import { inspectToolArgs } from '../tool-arg-inspector';

describe('inspectToolArgs — secret pattern detection', () => {
  it('flags a Bearer token', () => {
    const result = inspectToolArgs({
      authHeader: 'Bearer sk-proj-abc1234567890xyz',
    });
    expect(result.risk).toBe('high');
    expect(result.signals.some((s) => s.type === 'secretPattern')).toBe(true);
    // Should include the path pointing at the offending field
    expect(result.signals.find((s) => s.type === 'secretPattern')?.path).toBe(
      'authHeader',
    );
  });

  it('flags an OpenAI-style key', () => {
    const result = inspectToolArgs({
      note: 'debug value: sk-proj1234567890abcdefghij',
    });
    expect(result.risk).toBe('high');
  });

  it('flags an Anthropic key', () => {
    const result = inspectToolArgs({
      note: 'anthropic: sk-ant-api03-AbCdEfGhIjKlMnOp',
    });
    expect(result.risk).toBe('high');
  });

  it('flags a JWT', () => {
    const result = inspectToolArgs({
      session:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyLTEifQ.abc123signature',
    });
    expect(result.risk).toBe('high');
  });

  it('flags an AWS access key', () => {
    expect(inspectToolArgs({ data: 'AKIAIOSFODNN7EXAMPLE' }).risk).toBe('high');
    expect(inspectToolArgs({ data: 'ASIAXXXXXXXXXXXXXXXX' }).risk).toBe('high');
  });

  it('flags a PEM block header', () => {
    const result = inspectToolArgs({
      cert: '-----BEGIN PRIVATE KEY-----\nMIIEvQIBAD...',
    });
    expect(result.risk).toBe('high');
  });

  it('flags a GitHub personal access token', () => {
    const result = inspectToolArgs({
      token: 'ghp_abcdefghijklmnopqrstuvwxyzABCDEFGHIJ',
    });
    expect(result.risk).toBe('high');
  });

  it('flags a Slack token', () => {
    const result = inspectToolArgs({
      note: 'webhook: xoxb-1234567890-abcdefghij',
    });
    expect(result.risk).toBe('high');
  });
});

describe('inspectToolArgs — long base64 detection', () => {
  it('flags a 300-char base64-looking string as medium risk', () => {
    const fakeBase64 = 'A'.repeat(300); // base64 charset, long enough
    const result = inspectToolArgs({ payload: fakeBase64 });
    expect(result.signals.some((s) => s.type === 'longBase64')).toBe(true);
    // longBase64 weight is 3 → medium on its own
    expect(result.risk).toBe('medium');
  });

  it('does not flag a short base64-looking string', () => {
    const result = inspectToolArgs({ id: 'AbCdEfGhIjKlMnOp' }); // 16 chars
    expect(result.signals.some((s) => s.type === 'longBase64')).toBe(false);
  });

  it('does not flag a long natural-language string that happens to be mostly base64 chars', () => {
    // Natural language has spaces and punctuation, which fails the 85%
    // base64-char prefilter.
    const natural =
      'Hello world, this is a long-ish English sentence that should not trigger the base64 detector even though it is quite long. '.repeat(
        5,
      );
    const result = inspectToolArgs({ note: natural });
    expect(result.signals.some((s) => s.type === 'longBase64')).toBe(false);
  });
});

describe('inspectToolArgs — high-entropy detection', () => {
  it('flags a long high-entropy string', () => {
    // Build a long string with varied characters → high entropy.
    // Use a pseudo-random-ish pattern seeded by index.
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let blob = '';
    for (let i = 0; i < 600; i += 1) {
      blob += chars[(i * 31 + 7) % chars.length];
    }
    const result = inspectToolArgs({ blob });
    expect(result.signals.some((sig) => sig.type === 'highEntropy')).toBe(true);
  });

  it('does not flag a long low-entropy string (e.g. all "a")', () => {
    const lowEntropy = 'a'.repeat(1000);
    const result = inspectToolArgs({ text: lowEntropy });
    expect(result.signals.some((s) => s.type === 'highEntropy')).toBe(false);
  });

  it('does not flag short strings regardless of entropy', () => {
    // Short strings don't trigger the high-entropy signal because the
    // length floor is 512 chars.
    const result = inspectToolArgs({ q: 'abc123XYZ!@#$%^&*()' });
    expect(result.signals.some((s) => s.type === 'highEntropy')).toBe(false);
  });
});

describe('inspectToolArgs — risk band thresholds', () => {
  it('low risk when there are no signals', () => {
    const result = inspectToolArgs({
      subject: 'Team sync',
      attendees: ['alice@example.com', 'bob@example.com'],
    });
    expect(result.risk).toBe('low');
    expect(result.score).toBe(0);
  });

  it('medium risk on a single long base64 blob alone (weight 3)', () => {
    const result = inspectToolArgs({ payload: 'A'.repeat(300) });
    expect(result.risk).toBe('medium');
    expect(result.score).toBe(3);
  });

  it('high risk on a single secret pattern (weight 5)', () => {
    const result = inspectToolArgs({ auth: 'Bearer abc1234567890xyz' });
    expect(result.risk).toBe('high');
    expect(result.score).toBeGreaterThanOrEqual(5);
  });

  it('high risk when combined signals cross the threshold (longBase64 + highEntropy)', () => {
    // Build a 600-char pseudo-random base64 string. Using every char
    // in the base64 alphabet roughly uniformly gives entropy ~6 —
    // well above the 4.5 threshold. 600 chars > both minimums.
    // Total weight: longBase64 (3) + highEntropy (2) = 5 → high.
    const chars =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let blob = '';
    for (let i = 0; i < 600; i += 1) {
      blob += chars[(i * 37 + 11) % chars.length];
    }
    const result = inspectToolArgs({ data: blob });
    // Deterministic: both signals must fire.
    expect(result.signals.some((sig) => sig.type === 'longBase64')).toBe(true);
    expect(result.signals.some((sig) => sig.type === 'highEntropy')).toBe(true);
    expect(result.risk).toBe('high');
  });
});

describe('inspectToolArgs — nested structure walking', () => {
  it('finds secrets inside nested objects', () => {
    const result = inspectToolArgs({
      outer: {
        inner: {
          creds: {
            token: 'Bearer abc1234567890xyz',
          },
        },
      },
    });
    expect(result.risk).toBe('high');
    const secretSignal = result.signals.find((s) => s.type === 'secretPattern');
    expect(secretSignal?.path).toBe('outer.inner.creds.token');
  });

  it('finds secrets inside arrays of objects', () => {
    const result = inspectToolArgs({
      attendees: [
        { email: 'alice@example.com' },
        { email: 'bob@example.com', notes: 'Bearer abc1234567890xyz' },
      ],
    });
    expect(result.risk).toBe('high');
    const signal = result.signals.find((s) => s.type === 'secretPattern');
    expect(signal?.path).toBe('attendees[1].notes');
  });

  it('ignores non-string leaf values', () => {
    const result = inspectToolArgs({
      count: 42,
      ok: true,
      nothing: null,
      absent: undefined,
    });
    expect(result.risk).toBe('low');
    expect(result.signals).toEqual([]);
  });
});

describe('inspectToolArgs — defensive behaviour', () => {
  it('never throws on unusual input shapes', () => {
    // Circular references would trip a naive walker. We pass a
    // deliberately weird value — the inspector should swallow any
    // runtime errors and fall back to low risk.
    const circular: Record<string, unknown> = { name: 'root' };
    circular.self = circular;

    expect(() => inspectToolArgs(circular)).not.toThrow();
  });

  it('handles null args', () => {
    expect(inspectToolArgs(null)).toEqual({
      risk: 'low',
      score: 0,
      signals: [],
    });
  });

  it('handles undefined args', () => {
    expect(inspectToolArgs(undefined)).toEqual({
      risk: 'low',
      score: 0,
      signals: [],
    });
  });

  it('handles a top-level string', () => {
    const result = inspectToolArgs('Bearer abc1234567890xyz');
    expect(result.risk).toBe('high');
  });
});
