import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { locales } from '@/app/config';

import {
  ORG_PROFILE_ERROR_CODES,
  actionErrorMessage,
  failure,
} from '../errors';

const MESSAGES = join(process.cwd(), 'src/app/messages');

function errorsOf(locale: string): Record<string, string> {
  const json = JSON.parse(
    readFileSync(join(MESSAGES, `${locale}.json`), 'utf8'),
  );

  return json.organization?.errors ?? {};
}

describe('every error code has a message in every locale', () => {
  // The component looks the message up by the code it is given, which a static
  // check cannot see (`tests/architecture/i18n-keys-exist-in-*` reads literal
  // `t('…')` calls only). So a code added without its strings would render as a
  // raw key for the languages that lack it.
  it.each(locales)('%s', (locale) => {
    const messages = errorsOf(locale);

    const missing = ORG_PROFILE_ERROR_CODES.filter(
      (code) => typeof messages[code] !== 'string' || messages[code] === '',
    );

    expect(missing).toEqual([]);
  });

  it('has no message for a code that does not exist', () => {
    const known = new Set<string>(ORG_PROFILE_ERROR_CODES);

    for (const locale of locales) {
      const extra = Object.keys(errorsOf(locale)).filter(
        (key) => !known.has(key),
      );

      expect(extra, `${locale} has messages for no code`).toEqual([]);
    }
  });

  it('does not repeat the Polish text in any other language', () => {
    // The point of #1092: the other languages are translations of the Polish
    // sentences the actions used to return, and must differ from them.
    const polish = errorsOf('pl');

    for (const locale of locales.filter((l) => l !== 'pl')) {
      const messages = errorsOf(locale);
      const copied = ORG_PROFILE_ERROR_CODES.filter(
        (code) => messages[code] === polish[code],
      );

      expect(copied, `${locale} repeats Polish text`).toEqual([]);
    }
  });
});

describe('actionErrorMessage', () => {
  const tErrors = (code: string) => `translated:${code}`;

  it('translates a code', () => {
    expect(
      actionErrorMessage(
        tErrors,
        { success: false, code: 'member-not-found' },
        'fallback',
      ),
    ).toBe('translated:member-not-found');
  });

  it('shows prose from a shared check as it is', () => {
    expect(
      actionErrorMessage(
        tErrors,
        { success: false, error: 'From the add-member gate' },
        'fallback',
      ),
    ).toBe('From the add-member gate');
  });

  it('prefers the code when both are present', () => {
    expect(
      actionErrorMessage(
        tErrors,
        { success: false, code: 'invalid-data', error: 'prose' },
        'fallback',
      ),
    ).toBe('translated:invalid-data');
  });

  it('falls back to the component’s own message when there is neither', () => {
    expect(actionErrorMessage(tErrors, { success: false }, 'fallback')).toBe(
      'fallback',
    );
  });
});

describe('failure', () => {
  it('is a refusal that carries a code and no prose', () => {
    expect(failure('invalid-data')).toEqual({
      success: false,
      code: 'invalid-data',
    });
  });
});
