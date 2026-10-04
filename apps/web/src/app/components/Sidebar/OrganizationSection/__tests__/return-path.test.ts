import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RETURN_PATH,
  ORGANIZATION_RETURN_KEY,
  isOrganizationPath,
  isSafeReturnPath,
  rememberPage,
  returnPath,
} from '../return-path';

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe('isOrganizationPath', () => {
  it('is the section and everything under it, and nothing that merely starts like it', () => {
    expect(isOrganizationPath('/organization')).toBe(true);
    expect(isOrganizationPath('/organization/profile')).toBe(true);
    expect(isOrganizationPath('/organization-settings')).toBe(false);
    expect(isOrganizationPath('/chats/organization')).toBe(false);
    expect(isOrganizationPath('/new')).toBe(false);
  });
});

describe('isSafeReturnPath', () => {
  it.each([
    '/new',
    '/chats/abc',
    '/chats/abc?tab=sources',
    '/knowledge/documents-list?folderId=f1&page=2',
  ])('accepts %s', (path) => {
    expect(isSafeReturnPath(path)).toBe(true);
  });

  it.each([
    ['a protocol-relative URL', '//evil.example/x'],
    ['an absolute URL', 'https://evil.example/x'],
    ['a relative path', 'new'],
    ['a backslash trick', '/\\evil.example'],
    ['a line break', '/new\nSet-Cookie: x=1'],
    ['a way back into the section', '/organization/profile'],
    ['the section itself with a query', '/organization?x=1'],
    ['something absurdly long', `/${'a'.repeat(3000)}`],
    ['not a string', 42],
    ['null', null],
  ])('rejects %s', (_label, path) => {
    expect(isSafeReturnPath(path)).toBe(false);
  });
});

describe('rememberPage and returnPath', () => {
  it('remembers a page, with its query, and hands it back', () => {
    const storage = memoryStorage();

    rememberPage(storage, '/chats/abc', '?tab=sources');

    expect(returnPath(storage)).toBe('/chats/abc?tab=sources');
  });

  it('keeps the page the section was entered from, however far the reader goes inside it', () => {
    // Five organization pages later, back must still land on the chat, which
    // `history.back()` would not: it would land on the fourth.
    const storage = memoryStorage();

    rememberPage(storage, '/chats/abc');
    for (const page of [
      'profile',
      'members',
      'teams',
      'api-keys',
      'chatbots',
    ]) {
      rememberPage(storage, `/organization/${page}`);
    }

    expect(returnPath(storage)).toBe('/chats/abc');
  });

  it('follows the reader outside the section, to the latest page they were on', () => {
    const storage = memoryStorage();

    rememberPage(storage, '/chats/abc');
    rememberPage(storage, '/projects');

    expect(returnPath(storage)).toBe('/projects');
  });

  it('goes to a new chat when nothing is remembered — a direct visit to an organization URL', () => {
    expect(returnPath(memoryStorage())).toBe(DEFAULT_RETURN_PATH);
    expect(DEFAULT_RETURN_PATH).toBe('/new');
  });

  it('does not trust what it reads back', () => {
    // Storage is writable by anything on the origin, so a value that is not a
    // path this app would send someone to falls back instead of being followed.
    expect(
      returnPath(
        memoryStorage({ [ORGANIZATION_RETURN_KEY]: '//evil.example' }),
      ),
    ).toBe(DEFAULT_RETURN_PATH);
    expect(
      returnPath(
        memoryStorage({ [ORGANIZATION_RETURN_KEY]: '/organization/profile' }),
      ),
    ).toBe(DEFAULT_RETURN_PATH);
  });

  it('does not remember a path it would not follow', () => {
    const storage = memoryStorage();

    rememberPage(storage, '//evil.example');

    expect(storage.getItem(ORGANIZATION_RETURN_KEY)).toBeNull();
  });
});
