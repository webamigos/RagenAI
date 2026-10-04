import { describe, expect, it } from 'vitest';

import {
  configPath,
  maskKey,
  parseStoredConnection,
  withStoredConnection,
} from '../config';

describe('configPath', () => {
  it('uses XDG_CONFIG_HOME when set, ~/.config otherwise', () => {
    expect(configPath({ XDG_CONFIG_HOME: '/xdg' }, '/home/a', 'linux')).toBe(
      '/xdg/ragen/config.json',
    );
    expect(configPath({}, '/home/a', 'darwin')).toBe(
      '/home/a/.config/ragen/config.json',
    );
  });

  it('uses APPDATA on Windows', () => {
    expect(
      configPath(
        { APPDATA: 'C:/Users/a/AppData/Roaming' },
        'C:/Users/a',
        'win32',
      ),
    ).toContain('ragen');
  });
});

describe('parseStoredConnection', () => {
  it('reads what login writes', () => {
    expect(parseStoredConnection('{"url":"https://x","key":"sk-a.b"}')).toEqual(
      {
        url: 'https://x',
        key: 'sk-a.b',
      },
    );
  });

  it.each([undefined, '', 'not json', '{"url":"https://x"}', '[]'])(
    'treats %j as no saved connection rather than throwing',
    (text) => {
      expect(parseStoredConnection(text)).toBeUndefined();
    },
  );
});

describe('withStoredConnection', () => {
  const stored = { url: 'https://saved', key: 'sk-saved' };

  it('fills only what the environment leaves empty', () => {
    expect(
      withStoredConnection({ RAGEN_API_KEY: 'sk-env' }, stored),
    ).toMatchObject({
      RAGEN_API_URL: 'https://saved',
      RAGEN_API_KEY: 'sk-env',
    });
  });

  it('is the environment unchanged when nothing is saved', () => {
    const env = { RAGEN_API_URL: 'https://env' };
    expect(withStoredConnection(env, undefined)).toBe(env);
  });
});

describe('maskKey', () => {
  it('keeps enough to tell keys apart and not enough to use one', () => {
    expect(maskKey('sk-d7231079-1c9f.lcgyckDiu9u_ptqQ')).toBe('sk-d72…ptqQ');
    expect(maskKey('short')).toBe('…');
  });
});
