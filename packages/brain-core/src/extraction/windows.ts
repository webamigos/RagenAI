/**
 * Split a document into windows small enough for one extraction call.
 *
 * Boundaries prefer a markdown heading, then a blank line, then a line break,
 * and only then a hard cut — Docling's output is markdown, and a window that
 * starts mid-section loses the heading that gives its claims their meaning.
 * Windows do not overlap: a quote is verified against the *whole* document,
 * so a claim near a boundary still verifies, and overlap would only extract
 * the same claims twice.
 */
export function splitIntoWindows(text: string, maxChars: number): string[] {
  if (maxChars < 1) {
    throw new RangeError('maxChars must be positive');
  }
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [];
  }

  const windows: string[] = [];
  let rest = trimmed;
  while (rest.length > maxChars) {
    const cut = bestCut(rest, maxChars);
    windows.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest.length > 0) {
    windows.push(rest);
  }
  return windows.filter((w) => w.length > 0);
}

function bestCut(text: string, maxChars: number): number {
  const head = text.slice(0, maxChars + 1);
  // Do not cut so early that the window is mostly empty: below half, a hard
  // cut is the better window.
  const floor = Math.floor(maxChars / 2);
  for (const pattern of [/\n#{1,6} /g, /\n\s*\n/g, /\n/g]) {
    let last = -1;
    for (const match of head.matchAll(pattern)) {
      if (match.index !== undefined && match.index <= maxChars) {
        last = match.index;
      }
    }
    if (last >= floor) {
      return last;
    }
  }
  return maxChars;
}
