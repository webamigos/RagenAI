import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { defaultLocale, locales } from '@/app/config';
import { routing } from '../routing';

/**
 * A locale is three edits apart — `config.ts`, the routing prefixes and a
 * messages file — and next-intl only notices a missing key when a user
 * renders it. These checks make adding a locale fail here instead.
 */

const MESSAGES = join(import.meta.dirname, '..', '..', 'app', 'messages');

function flatten(value: unknown, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  if (value === null || typeof value !== 'object') {
    return out;
  }
  for (const [key, nested] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (nested !== null && typeof nested === 'object') {
      for (const [deeperKey, deeper] of flatten(nested, path)) {
        out.set(deeperKey, deeper);
      }
    } else {
      out.set(path, String(nested));
    }
  }
  return out;
}

function messagesFor(locale: string): Map<string, string> {
  return flatten(
    JSON.parse(readFileSync(join(MESSAGES, `${locale}.json`), 'utf8')),
  );
}

/** Argument names at the top level of an ICU message, e.g. `name`, `count`. */
function topLevelArguments(message: string): string[] {
  const names: string[] = [];
  let depth = 0;
  for (let i = 0; i < message.length; i++) {
    if (message[i] === '{') {
      if (depth === 0) {
        const match = /^\{\s*([A-Za-z_][\w]*)\s*[,}]/.exec(message.slice(i));
        if (match?.[1]) {
          names.push(match[1]);
        }
      }
      depth++;
    } else if (message[i] === '}') {
      depth--;
    }
  }
  return names;
}

const source = messagesFor(defaultLocale);

describe('interface locales', () => {
  it.each(locales)('%s has a routing prefix', (locale) => {
    const localePrefix = routing.localePrefix;
    const prefixes =
      typeof localePrefix === 'object' && 'prefixes' in localePrefix
        ? localePrefix.prefixes
        : undefined;
    expect(prefixes).toMatchObject({ [locale]: `/${locale}` });
  });

  it.each(locales)('%s has a messages file', (locale) => {
    expect(existsSync(join(MESSAGES, `${locale}.json`))).toBe(true);
  });

  it.each(locales)('%s has exactly the keys of the source locale', (locale) => {
    const keys = [...messagesFor(locale).keys()];
    const missing = [...source.keys()].filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !source.has(key));
    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
  });

  it.each(locales)('%s keeps every argument the source passes', (locale) => {
    const translated = messagesFor(locale);
    const dropped: string[] = [];
    for (const [key, message] of source) {
      const target = translated.get(key) ?? '';
      for (const name of topLevelArguments(message)) {
        if (!new RegExp(`\\{\\s*${name}\\s*[,}]`).test(target)) {
          dropped.push(`${key}: {${name}}`);
        }
      }
    }
    expect(dropped).toEqual([]);
  });
});
