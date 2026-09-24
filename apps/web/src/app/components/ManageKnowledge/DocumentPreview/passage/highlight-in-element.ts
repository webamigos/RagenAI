import { findPassage } from './find-passage';

/**
 * The classes on a marked passage, shared by every viewer that marks one.
 *
 * A token pair, not a colour: `--highlight` is the reader's highlighter in
 * both themes, and it carries its own text colour so a marked line reads the
 * same on a white page and a dark card.
 */
export const PASSAGE_MARK_CLASS =
  'rounded-xs bg-highlight text-highlight-foreground';

/** Set on every `<mark>` this module adds, so it can take them away again. */
const PASSAGE_ATTRIBUTE = 'data-cited-passage';

/**
 * Marks the passage a citation quoted inside an already-rendered element, and
 * returns the first `<mark>` — or `null` when the passage is not there.
 *
 * The element's text nodes are read in document order and searched as one
 * string, because a quoted paragraph routinely crosses a `<strong>` or an
 * `<a>`. Each text node the match touches gets its own `<mark>`: wrapping the
 * whole range in one element would have to split block elements to do it.
 *
 * `Range.surroundContents` on a single text node keeps the original node in
 * place as the part before the mark. That matters for the Markdown viewer,
 * whose text nodes React owns: React still holds a node that is in the
 * document, rather than one this function replaced.
 */
export function highlightPassageInElement(
  root: HTMLElement,
  snippet: string,
): HTMLElement | null {
  const walker = root.ownerDocument.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT,
  );
  const nodes: Text[] = [];
  const starts: number[] = [];
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = (node as Text).data;
    if (value.length === 0) {
      continue;
    }
    nodes.push(node as Text);
    starts.push(text.length);
    text += value;
  }

  const match = findPassage(text, snippet);
  if (!match) {
    return null;
  }

  // Offsets are worked out for every node before any of them is split, so a
  // split cannot move the ground under the next node's arithmetic.
  const pieces: Array<{ node: Text; from: number; to: number }> = [];
  nodes.forEach((node, index) => {
    const nodeStart = starts[index];
    const nodeEnd = nodeStart + node.data.length;
    if (nodeEnd <= match.start || nodeStart >= match.end) {
      return;
    }
    const from = Math.max(match.start, nodeStart) - nodeStart;
    const to = Math.min(match.end, nodeEnd) - nodeStart;
    // Whitespace between two table cells or list items is layout, and a
    // yellow sliver of it reads as a rendering fault.
    if (node.data.slice(from, to).trim().length === 0) {
      return;
    }
    pieces.push({ node, from, to });
  });

  let first: HTMLElement | null = null;
  for (const { node, from, to } of pieces) {
    const range = root.ownerDocument.createRange();
    range.setStart(node, from);
    range.setEnd(node, to);
    const mark = root.ownerDocument.createElement('mark');
    mark.className = PASSAGE_MARK_CLASS;
    mark.setAttribute(PASSAGE_ATTRIBUTE, '');
    range.surroundContents(mark);
    first ??= mark;
  }
  return first;
}

/** Removes every mark `highlightPassageInElement` added under `root`. */
export function clearPassageHighlights(root: HTMLElement): void {
  for (const mark of Array.from(
    root.querySelectorAll(`mark[${PASSAGE_ATTRIBUTE}]`),
  )) {
    const parent = mark.parentNode;
    if (!parent) {
      continue;
    }
    while (mark.firstChild) {
      parent.insertBefore(mark.firstChild, mark);
    }
    parent.removeChild(mark);
  }
}

/**
 * Brings a marked passage to the middle of its scroll container.
 *
 * Optional-called because jsdom has no layout and no `scrollIntoView`, and a
 * missing scroll is not a reason for the highlight itself to fail.
 */
export function scrollPassageIntoView(element: Element | null): void {
  element?.scrollIntoView?.({ block: 'center', inline: 'nearest' });
}
