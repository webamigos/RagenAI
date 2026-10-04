import { Controller, Get, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { routeTier, tieredThrottlers } from './throttle-tiers.js';

@Controller('t')
class TierController {
  @Get('plain')
  plain() {
    return 'ok';
  }

  @Get('expensive')
  @Throttle({ expensive: { limit: 10, ttl: 60_000 } })
  expensive() {
    return 'ok';
  }

  @Get('cheap')
  @Throttle({ cheap: { limit: 60, ttl: 60_000 } })
  cheap() {
    return 'ok';
  }
}

@Controller('c')
@Throttle({ expensive: { limit: 10, ttl: 60_000 } })
class ExpensiveClassController {
  @Get()
  any() {
    return 'ok';
  }
}

/** What Nest hands a guard for `classRef.prototype[method]`. */
function contextFor(classRef: { prototype: object }, method: string) {
  const handler = (classRef.prototype as Record<string, unknown>)[method];
  return {
    getClass: () => classRef,
    getHandler: () => handler,
  } as never;
}

describe('routeTier', () => {
  // Reads the metadata the real `@Throttle` writes, so a library release that
  // renames its key fails here rather than silently putting every route back
  // under every throttler.
  it('is the tier a handler names, else default', () => {
    expect(routeTier(contextFor(TierController, 'plain'))).toBe('default');
    expect(routeTier(contextFor(TierController, 'expensive'))).toBe(
      'expensive',
    );
    expect(routeTier(contextFor(TierController, 'cheap'))).toBe('cheap');
  });

  it('honours a tier named on the class', () => {
    expect(routeTier(contextFor(ExpensiveClassController, 'any'))).toBe(
      'expensive',
    );
  });
});

/**
 * The real guard and the real throttler list, over HTTP. Before the fix a
 * plain route was refused after 10 requests with `Retry-After-expensive`,
 * and a `cheap` route after 10 as well — every throttler counted every route.
 */
describe('tieredThrottlers under ThrottlerGuard', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot({ throttlers: tieredThrottlers(1) })],
      controllers: [TierController, ExpensiveClassController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const server = () => app.getHttpServer() as Parameters<typeof request>[0];

  async function admitted(path: string, attempts: number) {
    let ok = 0;
    let refused: request.Response | undefined;
    for (let i = 0; i < attempts; i++) {
      const res = await request(server()).get(path);
      if (res.status === 200) {
        ok++;
      } else {
        refused ??= res;
      }
    }
    return { ok, refused };
  }

  it('holds a route with no tier to default alone: 20, not 10', async () => {
    const { ok, refused } = await admitted('/t/plain', 25);
    expect(ok).toBe(20);
    expect(refused?.status).toBe(429);
    expect(refused?.headers['retry-after-expensive']).toBeUndefined();
    expect(refused?.headers['retry-after-cheap']).toBeUndefined();
  });

  it('holds an expensive route to expensive alone', async () => {
    const { ok, refused } = await admitted('/t/expensive', 15);
    expect(ok).toBe(10);
    expect(refused?.headers['retry-after-expensive']).toBeDefined();
  });

  it('lets a cheap route use its whole allowance, uncapped by default', async () => {
    const { ok } = await admitted('/t/cheap', 65);
    expect(ok).toBe(60);
  });

  it('counts each route separately', async () => {
    // /t/plain is exhausted above; a class-level expensive route is not.
    const { ok } = await admitted('/c', 1);
    expect(ok).toBe(1);
  });
});
