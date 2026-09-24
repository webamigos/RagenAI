'use client';

import { useEffect, useState, type RefObject } from 'react';

import {
  clearPassageHighlights,
  highlightPassageInElement,
  scrollPassageIntoView,
} from './highlight-in-element';

/**
 * - `none`: no passage was asked for — the knowledge base opening a file.
 * - `found`: the passage is marked and scrolled to.
 * - `not-found`: it was asked for and is not in this document.
 */
export type PassageStatus = 'none' | 'found' | 'not-found';

/**
 * Marks `passage` inside the element behind `ref` once its content is on the
 * page, and scrolls to it.
 *
 * `contentKey` is whatever identifies the rendered content — the HTML string,
 * the Markdown source. The effect re-runs when it changes, and clears its
 * marks first, so a second citation in the same viewer never leaves the first
 * one's highlight behind. `null` means nothing is rendered yet.
 */
export function usePassageHighlight(
  ref: RefObject<HTMLElement | null>,
  passage: string | undefined,
  contentKey: string | null,
): PassageStatus {
  const [result, setResult] = useState<{
    key: string;
    passage: string;
    found: boolean;
  } | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || !passage || contentKey === null) {
      return;
    }
    const mark = highlightPassageInElement(root, passage);
    scrollPassageIntoView(mark);
    // The DOM is the external system here: whether the passage was found is
    // only knowable after the content rendered, so the answer is state set
    // from the effect that asked.
    setResult({ key: contentKey, passage, found: mark !== null });
    return () => clearPassageHighlights(root);
  }, [ref, passage, contentKey]);

  if (!passage || contentKey === null) {
    return 'none';
  }
  // A result for other content or another passage is stale: say nothing
  // until this one has been looked for, rather than flashing a hint.
  if (!result || result.key !== contentKey || result.passage !== passage) {
    return 'none';
  }
  return result.found ? 'found' : 'not-found';
}
