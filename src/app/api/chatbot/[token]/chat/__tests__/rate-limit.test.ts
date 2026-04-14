import { describe, it, expect, vi, beforeEach } from 'vitest';

const incrWithExpire = vi.fn<(key: string, ttl: number) => Promise<number>>();
const getRedisInstance = vi.fn();

vi.mock('@/app/lib/services/redis', () => ({
  getRedisInstance: () => getRedisInstance(),
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { checkChatbotRateLimit } from '../rate-limit';

describe('checkChatbotRateLimit', () => {
  beforeEach(() => {
    incrWithExpire.mockReset();
    getRedisInstance.mockReset();
    getRedisInstance.mockReturnValue({ incrWithExpire });
  });

  it('returns ok when Redis is not configured', async () => {
    getRedisInstance.mockReturnValue(null);
    const result = await checkChatbotRateLimit('tok', '1.2.3.4');
    expect(result).toEqual({ ok: true });
  });

  it('returns ok when both counts are below limits', async () => {
    incrWithExpire.mockResolvedValue(1);
    const result = await checkChatbotRateLimit('tok', '1.2.3.4');
    expect(result).toEqual({ ok: true });
  });

  it('returns token-scoped limit when per-token count exceeds TOKEN_LIMIT', async () => {
    // Default TOKEN_LIMIT = 120; returning 121 for the token key triggers it
    incrWithExpire.mockImplementation(async (key: string) => {
      if (key.startsWith('cb:rl:t:')) {
        return 121;
      }
      return 1;
    });
    const result = await checkChatbotRateLimit('tok', '1.2.3.4');
    expect(result).toEqual({
      ok: false,
      scope: 'token',
      retryAfterSeconds: 60,
    });
  });

  it('returns ip-scoped limit when per-IP count exceeds IP_LIMIT', async () => {
    // Default IP_LIMIT = 20; token under limit, ip over
    incrWithExpire.mockImplementation(async (key: string) => {
      if (key.startsWith('cb:rl:ip:')) {
        return 21;
      }
      return 1;
    });
    const result = await checkChatbotRateLimit('tok', '1.2.3.4');
    expect(result).toEqual({
      ok: false,
      scope: 'ip',
      retryAfterSeconds: 60,
    });
  });

  it('namespaces per-IP bucket by token so rotating tokens does not share quota', async () => {
    incrWithExpire.mockResolvedValue(1);
    await checkChatbotRateLimit('token-A', '1.2.3.4');
    await checkChatbotRateLimit('token-B', '1.2.3.4');

    const ipKeys = incrWithExpire.mock.calls
      .map((args) => args[0])
      .filter((k) => k.startsWith('cb:rl:ip:'));

    expect(ipKeys).toContain('cb:rl:ip:token-A:1.2.3.4');
    expect(ipKeys).toContain('cb:rl:ip:token-B:1.2.3.4');
  });

  it('uses "unknown" placeholder when client IP is null', async () => {
    incrWithExpire.mockResolvedValue(1);
    await checkChatbotRateLimit('tok', null);

    const ipKey = incrWithExpire.mock.calls
      .map((args) => args[0])
      .find((k) => k.startsWith('cb:rl:ip:'));
    expect(ipKey).toBe('cb:rl:ip:tok:unknown');
  });

  it('fails open (returns ok) if Redis throws', async () => {
    incrWithExpire.mockRejectedValue(new Error('Redis down'));
    const result = await checkChatbotRateLimit('tok', '1.2.3.4');
    expect(result).toEqual({ ok: true });
  });

  it('enforces token limit even when IP count is low', async () => {
    incrWithExpire.mockImplementation(async (key: string) => {
      if (key.startsWith('cb:rl:t:')) {
        return 500;
      }
      return 1;
    });
    const result = await checkChatbotRateLimit('tok', '1.2.3.4');
    expect(result).toMatchObject({ ok: false, scope: 'token' });
  });
});
