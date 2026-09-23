import { createHash } from 'node:crypto';

import { normalizeForQuoteMatch } from './extraction/verify-quotes';

/** `sha256:<hex>`, the shape `contentHashSchema` accepts. */
export function sha256(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

/**
 * The hash of a quote, over its normalised form — so the same words with a
 * different line break hash the same, which is what the equality check is for.
 */
export function quoteHash(quote: string): string {
  return sha256(normalizeForQuoteMatch(quote));
}

/**
 * A slug in the shape the frontmatter requires. Transliterates rather than
 * drops: `Zasady urlopów` must not become `zasady-urlw`. `ł` and `ß` need
 * their own rules because NFKD has nothing to strip from them.
 *
 * A title in a script with no transliteration here — Cyrillic, Greek, CJK —
 * loses letters to the `[a-z0-9]` rule, and two such titles would collapse
 * to one slug (`Зарплата` and `Отпуск` both to `page`). Assembly merges
 * entities on the slug, so that would put two subjects on one page. When a
 * letter was dropped, a short hash of the title is appended: the same title
 * still gives the same slug, which the merging across windows relies on,
 * and different titles no longer meet.
 */
export function slugify(text: string): string {
  const folded = text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const slug = folded
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  const droppedLetters = /[^\P{L}a-zA-Z]/u.test(folded);
  if (!droppedLetters) {
    return slug.length > 0 ? slug : 'page';
  }
  const suffix = createHash('sha256')
    .update(text.normalize('NFKC').trim().toLocaleLowerCase(), 'utf8')
    .digest('hex')
    .slice(0, 8);
  const base = (slug.length > 0 ? slug : 'page')
    .slice(0, 71)
    .replace(/-+$/g, '');
  return `${base}-${suffix}`;
}
