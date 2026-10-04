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
 * The metadata key `@Throttle({ name: { limit } })` writes, per throttler —
 * `THROTTLER_LIMIT + name` in @nestjs/throttler. The library does not export
 * the constant from its entry point, so it is spelled here; the tests pin it
 * against the decorator, so a library change that renames it fails there.
 */
const LIMIT_KEY = 'THROTTLER:LIMIT';

const reflector = new Reflector();

/** The tier a route opted into, or `default` when it named none. */
export function routeTier(context: ExecutionContext): ThrottleTier {
  const targets = [context.getHandler(), context.getClass()];
  for (const tier of THROTTLE_TIERS) {
    if (
      tier !== 'default' &&
      reflector.getAllAndOverride(LIMIT_KEY + tier, targets) !== undefined
    ) {
      return tier;
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
