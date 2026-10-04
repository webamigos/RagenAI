import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieGet = vi.hoisted(() => vi.fn());
const headerGet = vi.hoisted(() => vi.fn());
const cookiesFn = vi.hoisted(() => vi.fn());
const headersFn = vi.hoisted(() => vi.fn());

vi.mock('next/headers', () => ({ cookies: cookiesFn, headers: headersFn }));

import {
  isLocale,
  pickLocaleFromAcceptLanguage,
  resolveEmailLocale,
} from '../email-locale';

describe('pickLocaleFromAcceptLanguage', () => {
  it('takes the first language the app ships', () => {
    expect(pickLocaleFromAcceptLanguage('de-DE,de;q=0.9,en;q=0.8')).toBe('de');
  });

  it('orders by quality, not by position', () => {
    expect(pickLocaleFromAcceptLanguage('en;q=0.4, pl;q=0.9')).toBe('pl');
  });

  it('skips a language the app does not ship and takes the next', () => {
    expect(pickLocaleFromAcceptLanguage('ja,ko;q=0.9,fr;q=0.5')).toBe('fr');
  });

  it('reads a regional variant as its language', () => {
    expect(pickLocaleFromAcceptLanguage('pt-BR')).toBe('pt');
  });

  it('reads the other Norwegians as Bokmål, the one the app ships', () => {
    expect(pickLocaleFromAcceptLanguage('no')).toBe('nb');
    expect(pickLocaleFromAcceptLanguage('nn-NO')).toBe('nb');
  });

  it('ignores a wildcard, a refused language and an empty header', () => {
    expect(pickLocaleFromAcceptLanguage('*')).toBeNull();
    expect(pickLocaleFromAcceptLanguage('de;q=0')).toBeNull();
    expect(pickLocaleFromAcceptLanguage('')).toBeNull();
    expect(pickLocaleFromAcceptLanguage(null)).toBeNull();
  });

  it('finds nothing when nothing matches', () => {
    expect(pickLocaleFromAcceptLanguage('ja,zh;q=0.8')).toBeNull();
  });
});

describe('isLocale', () => {
  it('accepts a shipped locale and nothing else', () => {
    expect(isLocale('nb')).toBe(true);
    expect(isLocale('xx')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(42)).toBe(false);
  });
});

describe('resolveEmailLocale', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cookiesFn.mockResolvedValue({ get: cookieGet });
    headersFn.mockResolvedValue({ get: headerGet });
    cookieGet.mockReturnValue(undefined);
    headerGet.mockReturnValue(null);
  });

  it('prefers a locale the caller names', async () => {
    cookieGet.mockReturnValue({ value: 'de' });

    expect(await resolveEmailLocale('fr')).toBe('fr');
  });

  it('ignores a named locale the app does not ship', async () => {
    cookieGet.mockReturnValue({ value: 'de' });

    expect(await resolveEmailLocale('xx')).toBe('de');
  });

  it('uses the NEXT_LOCALE cookie before the browser language', async () => {
    cookieGet.mockReturnValue({ value: 'sv' });
    headerGet.mockReturnValue('fr');

    expect(await resolveEmailLocale()).toBe('sv');
    expect(cookieGet).toHaveBeenCalledWith('NEXT_LOCALE');
  });

  it('falls back to Accept-Language with no cookie', async () => {
    headerGet.mockReturnValue('it-IT,it;q=0.9');

    expect(await resolveEmailLocale()).toBe('it');
  });

  it('ignores a cookie that is not a shipped locale', async () => {
    cookieGet.mockReturnValue({ value: 'klingon' });
    headerGet.mockReturnValue('es');

    expect(await resolveEmailLocale()).toBe('es');
  });

  it('answers in the default language when there is nothing to go on', async () => {
    expect(await resolveEmailLocale()).toBe('en');
  });

  it('does not throw outside a request, where cookies() itself throws', async () => {
    cookiesFn.mockRejectedValue(new Error('called outside a request scope'));

    expect(await resolveEmailLocale()).toBe('en');
  });
});
