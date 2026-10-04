import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { locales, type Locale } from '@/app/config';

/**
 * The email strings are looked up by a computed key (`emails.<template>.<key>`),
 * so the translation-key guard, which reads literal `t('…')` calls, cannot see
 * them: a key missing from a language would reach that language's readers as a
 * raw key in a real email. And a placeholder lost in translation (`{date}`
 * dropped, `<strong>` unbalanced) fails silently or garbles the message. So the
 * messages are held to the English source in every locale: same keys, same
 * placeholders, same rich-text tags.
 */

const MESSAGES = join(process.cwd(), 'src/app/messages');

function emails(locale: Locale): Record<string, unknown> {
  return JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8'))
    .emails;
}

function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();

  for (const [key, nested] of Object.entries(
    value as Record<string, unknown>,
  )) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof nested === 'string') {
      out.set(path, nested);
    } else {
      for (const [k, v] of flatten(nested, path)) {
        out.set(k, v);
      }
    }
  }

  return out;
}

const placeholders = (message: string) =>
  [...message.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

const tags = (message: string) =>
  [...message.matchAll(/<\/?(\w+)>/g)].map((m) => m[0]).sort();

const english = flatten(emails('en'));

describe('email messages', () => {
  it('has the messages the templates ask for', () => {
    // A floor, so a refactor that empties the namespace cannot pass by having
    // nothing left to compare.
    expect(english.size).toBeGreaterThan(70);
    for (const template of [
      'invitation',
      'password-reset',
      'verification',
      'welcome',
      'security-alert',
    ]) {
      expect(
        [...english.keys()].some((key) => key.startsWith(`${template}.`)),
        template,
      ).toBe(true);
    }
  });

  it.each(locales.filter((locale) => locale !== 'en'))(
    '%s has every key, with the same placeholders and tags as English',
    (locale) => {
      const messages = flatten(emails(locale));

      const missing = [...english.keys()].filter((key) => !messages.has(key));
      const extra = [...messages.keys()].filter((key) => !english.has(key));
      expect({ missing, extra }).toEqual({ missing: [], extra: [] });

      const wrongPlaceholders = [...english]
        .filter(
          ([key, en]) =>
            JSON.stringify(placeholders(en)) !==
            JSON.stringify(placeholders(messages.get(key) ?? '')),
        )
        .map(([key]) => key);
      expect(wrongPlaceholders, 'placeholders differ from English').toEqual([]);

      const wrongTags = [...english]
        .filter(
          ([key, en]) =>
            JSON.stringify(tags(en)) !==
            JSON.stringify(tags(messages.get(key) ?? '')),
        )
        .map(([key]) => key);
      expect(wrongTags, 'rich-text tags differ from English').toEqual([]);

      const empty = [...messages]
        .filter(([, value]) => value.trim() === '')
        .map(([key]) => key);
      expect(empty).toEqual([]);
    },
  );
});
