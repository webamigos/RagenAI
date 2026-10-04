import { join } from 'node:path';

/**
 * The connection `ragen login` saves, so a terminal does not need
 * RAGEN_API_URL and RAGEN_API_KEY exported in every shell.
 *
 * Precedence is flags, then the environment, then this file: a script that
 * sets the variables, or a one-off `--url`, always wins over whatever someone
 * logged in to last. That ordering is applied once, in `withStoredConnection`,
 * so no command has to know the file exists.
 *
 * The key is stored as plain text, readable only by the user (0600). That is
 * the same trade `gh`, `npm` and `docker` make without a keychain; the README
 * says so, and `ragen logout` removes it.
 */
export interface StoredConnection {
  url: string;
  key: string;
}

export function configPath(
  env: Record<string, string | undefined>,
  home: string,
  platform: NodeJS.Platform,
): string {
  if (platform === 'win32' && env.APPDATA) {
    return join(env.APPDATA, 'ragen', 'config.json');
  }
  const base = env.XDG_CONFIG_HOME || join(home, '.config');
  return join(base, 'ragen', 'config.json');
}

/**
 * The stored connection, or `undefined` when there is none. A file that is
 * not what `login` writes is treated as absent rather than thrown on: every
 * command reads it, and a corrupt file must not stop `ragen login` from
 * replacing it.
 */
export function parseStoredConnection(
  text: string | undefined,
): StoredConnection | undefined {
  if (!text) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as Partial<StoredConnection>;
    if (typeof parsed.url === 'string' && typeof parsed.key === 'string') {
      return { url: parsed.url, key: parsed.key };
    }
  } catch {
    // Falls through: unreadable is the same as absent.
  }
  return undefined;
}

/**
 * The environment the commands see: the stored connection fills only what
 * the real environment leaves empty.
 */
export function withStoredConnection(
  env: Record<string, string | undefined>,
  stored: StoredConnection | undefined,
): Record<string, string | undefined> {
  if (!stored) {
    return env;
  }
  return {
    ...env,
    RAGEN_API_URL: env.RAGEN_API_URL || stored.url,
    RAGEN_API_KEY: env.RAGEN_API_KEY || stored.key,
  };
}

/** `sk-d723…ptqQ` — enough to tell two keys apart, not enough to use one. */
export function maskKey(key: string): string {
  if (key.length <= 12) {
    return '…';
  }
  return `${key.slice(0, 6)}…${key.slice(-4)}`;
}
