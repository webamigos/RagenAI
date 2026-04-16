import { describe, expect, it, vi } from 'vitest';
import { createEventBus } from '../bus';

type TestEvents = {
  'thing.happened': { id: string };
  'other.thing': { count: number };
};

function makeBus(
  onFailure?: (info: { event: string; error: unknown }) => void,
) {
  return createEventBus<TestEvents>({ onFailure });
}

describe('createEventBus', () => {
  it('is a no-op when an event has no subscribers', async () => {
    const bus = makeBus();
    await expect(
      bus.emit('thing.happened', { id: 'x' }),
    ).resolves.toBeUndefined();
  });

  it('invokes a registered handler with the typed payload', async () => {
    const bus = makeBus();
    const handler = vi.fn();
    bus.on('thing.happened', handler);

    await bus.emit('thing.happened', { id: 'abc' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: 'abc' });
  });

  it('awaits async handlers before emit resolves', async () => {
    const bus = makeBus();
    let completed = false;
    bus.on('thing.happened', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      completed = true;
    });

    await bus.emit('thing.happened', { id: 'x' });
    expect(completed).toBe(true);
  });

  it('fans out to multiple handlers for the same event', async () => {
    const bus = makeBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('thing.happened', a);
    bus.on('thing.happened', b);

    await bus.emit('thing.happened', { id: 'xyz' });

    expect(a).toHaveBeenCalledWith({ id: 'xyz' });
    expect(b).toHaveBeenCalledWith({ id: 'xyz' });
  });

  it('routes each emit only to its own event handlers', async () => {
    const bus = makeBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('thing.happened', a);
    bus.on('other.thing', b);

    await bus.emit('thing.happened', { id: 'x' });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
  });

  it('continues calling other handlers when one throws', async () => {
    const reporter = vi.fn();
    const bus = makeBus(reporter);
    const boom = vi.fn(() => {
      throw new Error('boom');
    });
    const survivor = vi.fn();
    bus.on('thing.happened', boom);
    bus.on('thing.happened', survivor);

    await bus.emit('thing.happened', { id: 'x' });

    expect(boom).toHaveBeenCalledOnce();
    expect(survivor).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'thing.happened',
        error: expect.any(Error),
      }),
    );
  });

  it('continues calling other handlers when an async handler rejects', async () => {
    const reporter = vi.fn();
    const bus = makeBus(reporter);
    bus.on('thing.happened', async () => {
      throw new Error('async boom');
    });
    const survivor = vi.fn();
    bus.on('thing.happened', survivor);

    await bus.emit('thing.happened', { id: 'x' });

    expect(survivor).toHaveBeenCalledOnce();
    expect(reporter).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'thing.happened' }),
    );
  });

  it('stops notifying a handler after unsubscribe', async () => {
    const bus = makeBus();
    const handler = vi.fn();
    const off = bus.on('thing.happened', handler);

    await bus.emit('thing.happened', { id: '1' });
    off();
    await bus.emit('thing.happened', { id: '2' });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ id: '1' });
  });

  it('allows a handler to unsubscribe itself during emit', async () => {
    const bus = makeBus();
    const survivor = vi.fn();
    let off: () => void = () => {};
    off = bus.on('thing.happened', () => {
      off();
    });
    bus.on('thing.happened', survivor);

    await bus.emit('thing.happened', { id: 'x' });
    await bus.emit('thing.happened', { id: 'y' });

    expect(survivor).toHaveBeenCalledTimes(2);
    expect(bus.listenerCount('thing.happened')).toBe(1);
  });

  it('listenerCount and reset behave as expected', () => {
    const bus = makeBus();
    bus.on('thing.happened', () => {});
    bus.on('thing.happened', () => {});
    bus.on('other.thing', () => {});

    expect(bus.listenerCount('thing.happened')).toBe(2);
    expect(bus.listenerCount('other.thing')).toBe(1);

    bus.reset();

    expect(bus.listenerCount('thing.happened')).toBe(0);
    expect(bus.listenerCount('other.thing')).toBe(0);
  });
});
