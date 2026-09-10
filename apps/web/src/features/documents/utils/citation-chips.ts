import { findMarkerRuns } from './citation-markers';

/**
 * Turns the `[n]` an answer wrote into something a reader can click.
 *
 * This runs on **sanitized HTML**, after the markdown renderer and DOMPurify,
 * the same position and for the same reason as `rewriteLinksInHtml`: by then
 * the model's markdown has become a document, so a fenced code block is a
 * `<pre>` and an inline link is an `<a>`, and the places a marker must *not*
 * be touched can be recognised as elements instead of guessed at with a
 * pattern. `items[1]` in a code sample is the case that matters; before
 * parsing it is indistinguishable from a citation.
 *
 * Which numbers count is not decided here. `sourceCount` comes from the
 * retrieval the answer was given, and a number outside `1..sourceCount` is
 * left as plain text, because a chip is a promise that clicking it leads
 * somewhere. Finding the markers is `findMarkerRuns`, shared with the
 * validator so the chips and the citation count can never disagree about
 * what a marker is.
 */

export type CitationChipOptions = {
  /** How many documents the answer was shown, so how high a marker may go. */
  sourceCount: number;
  /** Chips link to `#${anchorPrefix}-${n}`, which the sources block owns. */
  anchorPrefix: string;
  /** Accessible name for one chip, e.g. `Source 3: contract.pdf`. */
  label: (n: number) => string;
};

const SKIP_INSIDE = new Set(['CODE', 'PRE', 'A', 'SCRIPT', 'STYLE']);

function isSkipped(node: Text): boolean {
  let parent = node.parentElement;
  while (parent) {
    if (SKIP_INSIDE.has(parent.tagName)) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

function chipFor(
  doc: Document,
  n: number,
  options: CitationChipOptions,
): HTMLAnchorElement {
  const chip = doc.createElement('a');
  chip.className = 'citation-chip';
  chip.setAttribute('href', `#${options.anchorPrefix}-${n}`);
  chip.setAttribute('data-citation', String(n));
  chip.setAttribute('aria-label', options.label(n));
  chip.textContent = String(n);
  return chip;
}

/**
 * Replace one text node with the chips it contains, plus the text around
 * them. Returns nothing when the node holds no valid marker, so a node that
 * does not need rewriting is left exactly as it was.
 */
function rewriteTextNode(
  doc: Document,
  node: Text,
  options: CitationChipOptions,
): void {
  const text = node.data;
  const runs = findMarkerRuns(text).filter((run) =>
    run.numbers.some((n) => n >= 1 && n <= options.sourceCount),
  );
  if (runs.length === 0) {
    return;
  }

  const fragment = doc.createDocumentFragment();
  let cursor = 0;

  for (const run of runs) {
    if (run.start > cursor) {
      fragment.append(doc.createTextNode(text.slice(cursor, run.start)));
    }

    for (const n of run.numbers) {
      if (n >= 1 && n <= options.sourceCount) {
        fragment.append(chipFor(doc, n, options));
      } else {
        // A run can mix a real marker with one that names nothing, as
        // `[1][9]` does when only three documents were retrieved. The valid
        // half still becomes a chip; the other half stays as the model wrote
        // it rather than disappearing, because a reader who sees `[9]` and a
        // list of three sources has learned something true.
        fragment.append(doc.createTextNode(`[${n}]`));
      }
    }

    cursor = run.end;
  }

  if (cursor < text.length) {
    fragment.append(doc.createTextNode(text.slice(cursor)));
  }

  node.replaceWith(fragment);
}

export function markCitationsInHtml(
  html: string,
  options: CitationChipOptions,
): string {
  // Server-side rendering has no DOMParser. Returning the input unchanged
  // means the answer still reads correctly with `[1]` in it, which is the
  // same fallback `rewriteLinksInHtml` takes.
  if (typeof DOMParser === 'undefined') {
    return html;
  }
  if (!html || options.sourceCount < 1) {
    return html;
  }

  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body><div id="__ragen_citations__">${html}</div></body></html>`,
    'text/html',
  );
  const root = doc.getElementById('__ragen_citations__');
  if (!root) {
    return html;
  }

  // Collected before rewriting: replacing a node while the walker is on it
  // invalidates the traversal.
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    texts.push(node as Text);
  }

  for (const node of texts) {
    if (!isSkipped(node)) {
      rewriteTextNode(doc, node, options);
    }
  }

  return root.innerHTML;
}
