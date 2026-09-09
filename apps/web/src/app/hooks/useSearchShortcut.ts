'use client';

import { useEffect } from 'react';

/**
 * Binds ⌘K / Ctrl+K to the thread search.
 *
 * Lives beside the provider that owns open/close rather than on the sidebar
 * button, because the shortcut is global: it has to work from the composer,
 * from a settings page, and while the sidebar is collapsed — none of which
 * render that button.
 *
 * `preventDefault` is not optional. ⌘K is taken by the browser on every
 * platform we support (Firefox focuses its search bar, Chrome opens a search
 * from the address bar), so without it the dialog opens *and* the browser does
 * its own thing.
 *
 * It toggles rather than only opening. Escape already closes the dialog, but a
 * chord that opens and never closes is a chord people press twice and then
 * reach for the mouse.
 */
export function useSearchShortcut({
  isOpen,
  open,
  close,
}: {
  isOpen: boolean;
  open: () => void;
  close: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `event.key` rather than `code`: on a Dvorak or AZERTY layout the
      // physical KeyK is not where K is, and the user means the letter.
      if (event.key.toLowerCase() !== 'k') {
        return;
      }
      // Either modifier, not both — ⌘ on macOS, Ctrl elsewhere, and a Mac
      // user pressing Ctrl+K in a terminal-ish habit gets it too. Alt is
      // excluded: ⌥⌘K and friends belong to the browser and the OS.
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }

      // Still swallow the chord — the browser must not act on a held key
      // either — but a toggle driven by key repeat flaps the dialog open and
      // shut for as long as the key is down.
      if (event.repeat) {
        event.preventDefault();
        return;
      }

      event.preventDefault();
      if (isOpen) {
        close();
      } else {
        open();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, open, close]);
}
