import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

import { useSearchShortcut } from '../useSearchShortcut';

const open = vi.fn();
const close = vi.fn();

beforeEach(() => {
  open.mockReset();
  close.mockReset();
});

function press(init: KeyboardEventInit) {
  const event = new KeyboardEvent('keydown', { cancelable: true, ...init });
  window.dispatchEvent(event);
  return event;
}

describe('useSearchShortcut', () => {
  it('opens on the platform chord, either modifier', () => {
    renderHook(() => useSearchShortcut({ isOpen: false, open, close }));

    press({ key: 'k', metaKey: true });
    press({ key: 'k', ctrlKey: true });

    expect(open).toHaveBeenCalledTimes(2);
  });

  it('stops the browser taking the chord for itself', () => {
    // Firefox focuses its search bar on ⌘K and Chrome opens an address-bar
    // search. Without this the dialog opens *and* the browser reacts.
    renderHook(() => useSearchShortcut({ isOpen: false, open, close }));

    const event = press({ key: 'k', metaKey: true });

    expect(event.defaultPrevented).toBe(true);
  });

  it('closes when it is already open, so the chord is a toggle', () => {
    renderHook(() => useSearchShortcut({ isOpen: true, open, close }));

    press({ key: 'k', metaKey: true });

    expect(close).toHaveBeenCalledOnce();
    expect(open).not.toHaveBeenCalled();
  });

  it('matches the letter, not the physical key', () => {
    // `event.code` would be KeyK — which is somewhere else entirely on Dvorak
    // and AZERTY. The user means the letter they see on the cap.
    renderHook(() => useSearchShortcut({ isOpen: false, open, close }));

    press({ key: 'K', metaKey: true });

    expect(open).toHaveBeenCalledOnce();
  });

  it('ignores a bare k, so typing still works', () => {
    renderHook(() => useSearchShortcut({ isOpen: false, open, close }));

    const event = press({ key: 'k' });

    expect(open).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('leaves ⌥⌘K alone — those belong to the browser and the OS', () => {
    renderHook(() => useSearchShortcut({ isOpen: false, open, close }));

    press({ key: 'k', metaKey: true, altKey: true });

    expect(open).not.toHaveBeenCalled();
  });

  it('ignores key repeat, so holding the chord does not flap the dialog', () => {
    // keydown fires continuously while a key is held. On a toggle that means
    // open/close/open for as long as the user leans on it.
    const { rerender } = renderHook(
      ({ isOpen }) => useSearchShortcut({ isOpen, open, close }),
      { initialProps: { isOpen: false } },
    );

    press({ key: 'k', metaKey: true });
    expect(open).toHaveBeenCalledOnce();

    rerender({ isOpen: true });
    const repeated = press({ key: 'k', metaKey: true, repeat: true });

    expect(close).not.toHaveBeenCalled();
    // ...and the browser still does not get the chord.
    expect(repeated.defaultPrevented).toBe(true);
  });

  it('stops listening once unmounted', () => {
    // A global listener that outlives its provider fires against a closed-over
    // `open` from a dead tree.
    const { unmount } = renderHook(() =>
      useSearchShortcut({ isOpen: false, open, close }),
    );

    unmount();
    press({ key: 'k', metaKey: true });

    expect(open).not.toHaveBeenCalled();
  });
});
