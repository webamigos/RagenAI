import { describe, expect, it } from 'vitest';

import { appUrlRenameRule, resolveAppUrl } from '../app-url';
import { appOrigin } from '../fragments';

describe('resolveAppUrl', () => {
  it('reads APP_URL', () => {
    expect(resolveAppUrl({ APP_URL: 'https://ragen.example' })).toBe(
      'https://ragen.example',
    );
  });

  it('no longer reads BETTER_AUTH_URL', () => {
    expect(
      resolveAppUrl({ BETTER_AUTH_URL: 'https://legacy.example' }),
    ).toBeUndefined();
  });

  it('treats a blank APP_URL as unset', () => {
    expect(resolveAppUrl({ APP_URL: '   ' })).toBeUndefined();
    expect(resolveAppUrl({})).toBeUndefined();
  });

  it('strips trailing slashes, because callers append absolute paths', () => {
    expect(resolveAppUrl({ APP_URL: 'https://ragen.example///' })).toBe(
      'https://ragen.example',
    );
  });
});

describe('appUrlRenameRule', () => {
  const schema = appOrigin.superRefine(appUrlRenameRule);

  it('reports an install that still sets only BETTER_AUTH_URL, naming both', () => {
    const result = schema.safeParse({
      BETTER_AUTH_URL: 'https://legacy.example',
    });

    expect(result.success).toBe(false);
    const message = result.error?.issues[0]?.message ?? '';
    expect(message).toContain('BETTER_AUTH_URL');
    expect(message).toContain('APP_URL');
    expect(result.error?.issues[0]?.path).toEqual(['APP_URL']);
  });

  it('reports the old name even when its value is not a url', () => {
    expect(
      schema.safeParse({ BETTER_AUTH_URL: 'localhost:3000' }).success,
    ).toBe(false);
  });

  it('accepts APP_URL alone, both names together, and neither', () => {
    expect(schema.safeParse({ APP_URL: 'https://ragen.example' }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({
        APP_URL: 'https://ragen.example',
        BETTER_AUTH_URL: 'https://legacy.example',
      }).success,
    ).toBe(true);
    expect(schema.safeParse({}).success).toBe(true);
  });

  it('ignores a blank BETTER_AUTH_URL left in an env file', () => {
    expect(schema.safeParse({ BETTER_AUTH_URL: '' }).success).toBe(true);
  });
});

describe('appOrigin', () => {
  it('rejects an APP_URL that is not an http(s) url', () => {
    expect(appOrigin.safeParse({ APP_URL: 'localhost:3000' }).success).toBe(
      false,
    );
  });
});
