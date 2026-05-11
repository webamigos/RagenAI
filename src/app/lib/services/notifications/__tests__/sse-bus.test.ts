import { describe, it, expect, vi, beforeEach } from 'vitest';

// We import the module after resetting it per test
let publish: typeof import('../sse-bus').publish;
let registerClient: typeof import('../sse-bus').registerClient;
let unregisterClient: typeof import('../sse-bus').unregisterClient;

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../sse-bus');
  publish = mod.publish;
  registerClient = mod.registerClient;
  unregisterClient = mod.unregisterClient;
});

describe('sse-bus per-user routing', () => {
  it('delivers event only to the target userId client', () => {
    const encoder = new TextEncoder();
    const enqueueA = vi.fn();
    const enqueueB = vi.fn();

    const controllerA = {
      enqueue: enqueueA,
    } as unknown as ReadableStreamDefaultController;
    const controllerB = {
      enqueue: enqueueB,
    } as unknown as ReadableStreamDefaultController;

    registerClient({
      userId: 'user-1',
      organizationId: 'org-1',
      controller: controllerA,
      encoder,
    });
    registerClient({
      userId: 'user-2',
      organizationId: 'org-1',
      controller: controllerB,
      encoder,
    });

    publish({ userId: 'user-1', organizationId: 'org-1' }, 'test-event', {
      hello: 'world',
    });

    expect(enqueueA).toHaveBeenCalledOnce();
    expect(enqueueB).not.toHaveBeenCalled();
  });

  it('delivers event to all clients in the target org', () => {
    const encoder = new TextEncoder();
    const enqueueA = vi.fn();
    const enqueueB = vi.fn();
    const enqueueC = vi.fn();

    const controllerA = {
      enqueue: enqueueA,
    } as unknown as ReadableStreamDefaultController;
    const controllerB = {
      enqueue: enqueueB,
    } as unknown as ReadableStreamDefaultController;
    const controllerC = {
      enqueue: enqueueC,
    } as unknown as ReadableStreamDefaultController;

    registerClient({
      userId: 'user-1',
      organizationId: 'org-1',
      controller: controllerA,
      encoder,
    });
    registerClient({
      userId: 'user-2',
      organizationId: 'org-1',
      controller: controllerB,
      encoder,
    });
    registerClient({
      userId: 'user-3',
      organizationId: 'org-2',
      controller: controllerC,
      encoder,
    });

    publish({ organizationId: 'org-1' }, 'test-event', { msg: 'hello org' });

    expect(enqueueA).toHaveBeenCalledOnce();
    expect(enqueueB).toHaveBeenCalledOnce();
    expect(enqueueC).not.toHaveBeenCalled();
  });

  it('broadcasts to all clients when no target specified', () => {
    const encoder = new TextEncoder();
    const enqueueA = vi.fn();
    const enqueueB = vi.fn();

    const controllerA = {
      enqueue: enqueueA,
    } as unknown as ReadableStreamDefaultController;
    const controllerB = {
      enqueue: enqueueB,
    } as unknown as ReadableStreamDefaultController;

    registerClient({
      userId: 'user-1',
      organizationId: 'org-1',
      controller: controllerA,
      encoder,
    });
    registerClient({
      userId: 'user-2',
      organizationId: 'org-2',
      controller: controllerB,
      encoder,
    });

    publish({}, 'global-event', { broadcast: true });

    expect(enqueueA).toHaveBeenCalledOnce();
    expect(enqueueB).toHaveBeenCalledOnce();
  });

  it('removes client from both maps on unregister', () => {
    const encoder = new TextEncoder();
    const enqueue = vi.fn();
    const controller = {
      enqueue,
    } as unknown as ReadableStreamDefaultController;

    const handle = registerClient({
      userId: 'user-1',
      organizationId: 'org-1',
      controller,
      encoder,
    });
    unregisterClient(handle);

    publish({ userId: 'user-1', organizationId: 'org-1' }, 'test-event', {});
    publish({ organizationId: 'org-1' }, 'test-event', {});

    expect(enqueue).not.toHaveBeenCalled();
  });
});
