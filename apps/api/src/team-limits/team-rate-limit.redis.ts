import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

const logger = new Logger('TeamRateLimitRedis');

/**
 * The counters behind the per-team rate limits.
 *
 * Deliberately the **same keys and the same Lua scripts** as apps/web's
 * `RedisService`. A team's `rpm` is one allowance, not one per surface: the
 * panel and the public API both spend it, which is what LiteLLM's virtual key
 * did when it was still in the path. Two independent windows would silently
 * double every limit an operator set.
 *
 * Redis is optional in this deployment — rate limiting is the only thing it is
 * used for — so `create` returns null rather than throwing, and every caller
 * treats that as "no per-team rate limiting" rather than "no chat".
 */
export class TeamRateLimitRedis {
  private constructor(private readonly client: Redis) {}

  static create(url: string | undefined): TeamRateLimitRedis | null {
    if (!url) {
      return null;
    }
    const client = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    // Without a listener, ioredis treats a connection error as an unhandled
    // 'error' event and takes the process down — for an optional dependency.
    client.on('error', (err: unknown) => {
      logger.warn({ err }, 'Team rate-limit Redis is unavailable');
    });
    return new TeamRateLimitRedis(client);
  }

  /** The window's current value, or 0 when nothing has been counted. */
  async read(key: string): Promise<number> {
    const value = await this.client.get(key);
    return Number(value ?? 0);
  }

  /**
   * Increment and, on the first increment only, set the expiry — in one round
   * trip. A crash between INCR and EXPIRE would leave a key that never expires
   * and a team rate-limited forever, which is why this is a script and not two
   * calls.
   */
  async incrementWithExpiry(key: string, ttlSeconds: number): Promise<number> {
    const script = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], ARGV[1])
      end
      return current
    `;
    return (await this.client.eval(script, 1, key, ttlSeconds)) as number;
  }

  /** `incrementWithExpiry`, by an arbitrary amount — a token bucket counts
   * tokens, not requests, so it cannot use INCR. */
  async incrementByWithExpiry(
    key: string,
    amount: number,
    ttlSeconds: number,
  ): Promise<number> {
    const script = `
      local current = redis.call('INCRBY', KEYS[1], ARGV[1])
      if current == tonumber(ARGV[1]) then
        redis.call('EXPIRE', KEYS[1], ARGV[2])
      end
      return current
    `;
    return (await this.client.eval(
      script,
      1,
      key,
      amount,
      ttlSeconds,
    )) as number;
  }

  async disconnect(): Promise<void> {
    await this.client.quit().catch(() => undefined);
  }
}
