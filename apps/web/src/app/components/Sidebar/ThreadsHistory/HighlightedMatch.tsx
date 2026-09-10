'use client';

import { Fragment } from 'react';

/**
 * Shows which part of a result the query matched.
 *
 * Three things a naive version gets wrong, and all three are visible in a
 * search box on real data:
 *
 * - **Regex metacharacters.** File names contain `(1)`, `[draft]`, `v1.2`,
 *   `100%`. Building a `RegExp` from raw input either throws on an unbalanced
 *   bracket or silently matches the wrong thing, so the search is done with
 *   `indexOf` and no pattern is ever compiled.
 * - **Case.** Matching is case-insensitive, but the *original* casing is what
 *   gets rendered — highlighting must not rewrite `Umowa.pdf` as `umowa.pdf`.
 * - **Every occurrence.** A query appearing twice in one name is highlighted
 *   twice; stopping at the first is the kind of thing nobody reports and
 *   everybody notices.
 */
type Props = {
  text: string;
  query: string;
};

export function HighlightedMatch({ text, query }: Props) {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) {
    return <>{text}</>;
  }

  const haystack = text.toLowerCase();
  const parts: { value: string; match: boolean }[] = [];
  let cursor = 0;

  for (;;) {
    const at = haystack.indexOf(needle, cursor);
    if (at === -1) {
      break;
    }
    if (at > cursor) {
      parts.push({ value: text.slice(cursor, at), match: false });
    }
    // Sliced from `text`, not `haystack`, so the original casing survives.
    parts.push({ value: text.slice(at, at + needle.length), match: true });
    cursor = at + needle.length;
  }

  if (parts.length === 0) {
    return <>{text}</>;
  }
  if (cursor < text.length) {
    parts.push({ value: text.slice(cursor), match: false });
  }

  return (
    <>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part.match ? (
            // `font-medium` as well as the colour: the panel rules say
            // meaning never rests on colour alone, and "this is why the row
            // is here" is meaning.
            <mark className="bg-transparent font-medium text-foreground">
              {part.value}
            </mark>
          ) : (
            part.value
          )}
        </Fragment>
      ))}
    </>
  );
}
