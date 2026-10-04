import { type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

/**
 * The three rate-limit tiers, and the rule that a route is held to exactly
 * one of them.
 *
 * @nestjs/throttler applies **every** named throttler to every route: a
 * `@Throttle({ expensive })` overrides the `expensive` numbers for that
 * route, but it does not stop `cheap` and `default` from counting too, and a
 * route with no decorator at all is still held to `expensive`. So every
 * routine read — `GET /v1/files`, `GET /v1/assistants`, the internal thread
 * list — was limited to the expensive tier's 10 a minute, not the 20 its
 * tier promised; `ragen kb upload --wait` was refused within its first
 * polling round. The `Retry-After-expensive` header on a plain list request
 * is how that showed.
 *
 * The rule now: a route that names a tier with `@Throttle({ <tier>: … })`
 * on its handler or class is counted by that tier alone; every other route
 * by `default` alone. Each throttler skips the routes that are not its own,
 * through the library's per-throttler `skipIf`.
 */
export const THROTTLE_TIERS = ['cheap', 'default', 'expensive'] as const;
export type ThrottleTier = (typeof THROTTLE_TIERS)[number];

/**
 * The metadata keys `@Throttle({ name: { limit, ttl } })` writes, per
 * throttler — `THROTTLER_LIMIT + name` and `THROTTLER_TTL + name` in
 * @nestjs/throttler. The library does not export the constants from its entry
 * point, so they are spelled here; the tests pin them against the decorator,
 * so a library change that renames them fails there.
 */
const LIMIT_KEY = 'THROTTLER:LIMIT';
const TTL_KEY = 'THROTTLER:TTL';

const reflector = new Reflector();

function namesTier(target: object, tier: ThrottleTier): boolean {
  return (
    reflector.get(LIMIT_KEY + tier, target as never) !== undefined ||
    reflector.get(TTL_KEY + tier, target as never) !== undefined
  );
}

/**
 * The tier a route opted into, or `default` when it named none. The handler
 * is read before its class, so a handler's tier wins over the class's, as
 * the library's own overrides do. A tier named with only a `ttl` counts.
 *
 * One consequence to keep in mind: `@SkipThrottle({ expensive: true })` on a
 * route that is in the `expensive` tier leaves it unthrottled, because no
 * other tier counts it any more.
 */
export function routeTier(context: ExecutionContext): ThrottleTier {
  for (const target of [context.getHandler(), context.getClass()]) {
    for (const tier of THROTTLE_TIERS) {
      if (tier !== 'default' && namesTier(target, tier)) {
        return tier;
      }
    }
  }
  return 'default';
}

/** A throttler's `skipIf`: skip every route that is not in its tier. */
export function skipUnlessTier(
  tier: ThrottleTier,
): (context: ExecutionContext) => boolean {
  return (context) => routeTier(context) !== tier;
}

/**
 * Requests per minute for each tier, before the environment's multiplier.
 * The published API reference states these numbers per endpoint
 * (ragen-docs, api-reference/*.mdx "Rate limits").
 */
export const TIER_LIMITS: Record<ThrottleTier, number> = {
  cheap: 60,
  default: 20,
  expensive: 10,
};

/** The throttlers for ThrottlerModule, each confined to its own tier. */
export function tieredThrottlers(multiplier: number) {
  return THROTTLE_TIERS.map((tier) => ({
    name: tier,
    ttl: 60_000,
    limit: Math.round(TIER_LIMITS[tier] * multiplier),
    skipIf: skipUnlessTier(tier),
  }));
}
