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
 * drops: `Zasady urlopów` must not become `zasady-urlw`. `ł` needs its own
 * rule because it has no decomposition for NFKD to strip.
 */
export function slugify(text: string): string {
  const slug = text
    .replace(/ł/g, 'l')
    .replace(/Ł/g, 'L')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return slug.length > 0 ? slug : 'page';
}
