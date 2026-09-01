import { type ExecutionContext, type CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { ReplaceIdsInterceptor } from './replace-ids.interceptor.js';
import { SKIP_RESPONSE_TRANSFORM } from '../decorators/skip-response-transform.decorator.js';

describe('ReplaceIdsInterceptor', () => {
  let interceptor: ReplaceIdsInterceptor;
  let reflector: Reflector;

  function mockContext(): ExecutionContext {
    return {
      getHandler: () => () => undefined,
      getClass: () => class {},
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    reflector = new Reflector();
    interceptor = new ReplaceIdsInterceptor(reflector);
  });

  function execute(data: unknown, ctx: ExecutionContext = mockContext()) {
    const callHandler = { handle: () => of(data) } as unknown as CallHandler;
    return new Promise((resolve) => {
      interceptor.intercept(ctx, callHandler).subscribe(resolve);
    });
  }

  it('should rename public_id to id', async () => {
    const result = await execute({ public_id: 'abc-123', name: 'test' });
    expect(result).toEqual({ id: 'abc-123', name: 'test' });
  });

  it('should strip internal id, organization_id, and project_id', async () => {
    const result = await execute({
      id: 1,
      public_id: 'pub-1',
      organization_id: 'org-1',
      project_id: 2,
      title: 'hello',
    });
    expect(result).toEqual({ id: 'pub-1', title: 'hello' });
  });

  it('should handle arrays', async () => {
    const result = await execute([
      { public_id: 'a', id: 1 },
      { public_id: 'b', id: 2 },
    ]);
    expect(result).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  it('should handle nested objects', async () => {
    const result = await execute({
      public_id: 'parent',
      child: { public_id: 'child', id: 99 },
    });
    expect(result).toEqual({ id: 'parent', child: { id: 'child' } });
  });

  it('should convert Date to ISO string', async () => {
    const date = new Date('2025-01-01T00:00:00.000Z');
    const result = await execute({ created_at: date });
    expect(result).toEqual({ created_at: '2025-01-01T00:00:00.000Z' });
  });

  it('should pass through primitives unchanged', async () => {
    expect(await execute('hello')).toBe('hello');
    expect(await execute(42)).toBe(42);
    expect(await execute(null)).toBe(null);
  });

  it('bypasses transformation when @SkipResponseTransform metadata is set on handler', async () => {
    const handler = () => undefined;
    Reflect.defineMetadata(SKIP_RESPONSE_TRANSFORM, true, handler);
    const ctx = {
      getHandler: () => handler,
      getClass: () => class {},
    } as unknown as ExecutionContext;

    const input = {
      id: 'chatcmpl-xyz',
      object: 'chat.completion',
      organization_id: 'org-should-not-be-stripped',
    };
    const result = await execute(input, ctx);
    expect(result).toEqual(input);
  });

  it('bypasses transformation when @SkipResponseTransform metadata is set on controller class', async () => {
    class MyController {}
    Reflect.defineMetadata(SKIP_RESPONSE_TRANSFORM, true, MyController);
    const ctx = {
      getHandler: () => () => undefined,
      getClass: () => MyController,
    } as unknown as ExecutionContext;

    const input = { id: 'file-abc', bytes: 123 };
    const result = await execute(input, ctx);
    expect(result).toEqual(input);
  });

  it('still transforms when no reflector is provided (back-compat)', async () => {
    const interceptorNoReflector = new ReplaceIdsInterceptor();
    const callHandler = {
      handle: () => of({ public_id: 'x', id: 1 }),
    } as unknown as CallHandler;
    const result = await new Promise((resolve) => {
      interceptorNoReflector
        .intercept(mockContext(), callHandler)
        .subscribe(resolve);
    });
    expect(result).toEqual({ id: 'x' });
  });
});
