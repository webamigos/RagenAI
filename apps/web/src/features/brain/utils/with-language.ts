import type { BrainLanguage } from '../contracts/brain-language.types';

/**
 * A Brain link that keeps the language filter: every chip, pager and tab
 * link carries `lang`, or picking a status would quietly drop the language.
 * A `#fragment` stays at the end, where it belongs.
 */
export function withLanguage(
  href: string,
  language: BrainLanguage | null,
): string {
  if (!language) {
    return href;
  }
  const hashAt = href.indexOf('#');
  const hash = hashAt === -1 ? '' : href.slice(hashAt);
  const rest = hashAt === -1 ? href : href.slice(0, hashAt);
  const [path, query = ''] = rest.split('?');
  const params = new URLSearchParams(query);
  params.set('lang', language);
  return `${path}?${params.toString()}${hash}`;
}
