'use client';

import { useEffect, useState } from 'react';

/**
 * The right-aligned `⌘K` on the search row.
 *
 * Renders nothing until mounted, on purpose. The chord differs by platform and
 * the server cannot know which one the reader is on, so emitting either would
 * be a hydration mismatch — and the one thing worse than a missing hint is a
 * hint that says ⌘ to a Windows user.
 *
 * It is decoration for the shortcut in `useSearchShortcut`, not a control:
 * `aria-hidden`, because the row it sits in is already a button with a name,
 * and a screen reader announcing "Search, Command K" as one label reads as two
 * things to press.
 */
export function ShortcutHint() {
  const [chord, setChord] = useState<[string, string] | null>(null);

  useEffect(() => {
    const platform =
      // `userAgentData` where it exists; `platform` is deprecated but is still
      // the only thing Safari and Firefox give us.
      (navigator as { userAgentData?: { platform?: string } }).userAgentData
        ?.platform ??
      navigator.platform ??
      '';
    setChord(
      /mac|iphone|ipad|ipod/i.test(platform) ? ['⌘', 'K'] : ['Ctrl', 'K'],
    );
  }, []);

  if (chord === null) {
    return null;
  }

  const [modifier, key] = chord;

  return (
    // The modifier and the key are separate boxes with a gap between them,
    // rather than one string. `⌘K` set as text puts the glyph hard against the
    // K — the two read as one mark — while `Ctrl K` carries a full word space,
    // so the two platforms were spaced differently for no reason. The gap is
    // in `em`, so it stays proportional if the hint is ever resized.
    <span
      aria-hidden="true"
      className="ml-auto inline-flex shrink-0 items-baseline gap-[0.25em] font-mono text-[11px] text-muted-foreground"
    >
      <span>{modifier}</span>
      <span>{key}</span>
    </span>
  );
}
