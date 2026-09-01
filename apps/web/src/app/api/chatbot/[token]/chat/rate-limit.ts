import { getRedisInstance } from '@/app/lib/services/redis';
import { logger } from '@/app/lib/utils/logger';

const WINDOW_SECONDS = 60;

const parsePositiveInt = (
  raw: string | undefined,
  fallback: number,
): number => {
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const TOKEN_LIMIT = parsePositiveInt(
  process.env.CHATBOT_RATE_LIMIT_TOKEN_PER_MIN,
  120,
);
const IP_LIMIT = parsePositiveInt(
  process.env.CHATBOT_RATE_LIMIT_IP_PER_MIN,
  20,
);

export type RateLimitResult =
  | { ok: true }
  | { ok: false; scope: 'token' | 'ip'; retryAfterSeconds: number };

/**
 * Rate limit a public chatbot chat request.
 *
 * Two independent buckets per 60-second rolling window:
 * - per widget token (protects the org's LLM budget against runaway widgets)
 * - per widget token × client IP (blocks single-source flooding)
 *
 * Fails open when Redis is unavailable — the widget is a latency-sensitive
 * public surface, so a Redis outage shouldn't take it offline. The Redis
 * error is logged once per request so the drop is observable.
 */
export const checkChatbotRateLimit = async (
  token: string,
  clientIp: string | null,
): Promise<RateLimitResult> => {
  const redis = getRedisInstance();
  if (!redis) {
    return { ok: true };
  }

  const ipKey = clientIp ?? 'unknown';

  try {
    const [tokenCount, ipCount] = await Promise.all([
      redis.incrWithExpire(`cb:rl:t:${token}`, WINDOW_SECONDS),
      redis.incrWithExpire(`cb:rl:ip:${token}:${ipKey}`, WINDOW_SECONDS),
    ]);

    if (tokenCount > TOKEN_LIMIT) {
      return {
        ok: false,
        scope: 'token',
        retryAfterSeconds: WINDOW_SECONDS,
      };
    }
    if (ipCount > IP_LIMIT) {
      return {
        ok: false,
        scope: 'ip',
        retryAfterSeconds: WINDOW_SECONDS,
      };
    }

    return { ok: true };
  } catch (err) {
    logger.warn(
      { err, token: token.slice(0, 8), clientIp },
      'Chatbot rate-limit check failed — allowing request',
    );
    return { ok: true };
  }
};
