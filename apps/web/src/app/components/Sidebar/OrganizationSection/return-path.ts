/**
 * Where "Main menu" goes back to when you leave the organization section.
 *
 * The section replaces the sidebar's own content, so it needs a way back, and
 * "back" has to mean the page you were on when you went in. `history.back()`
 * cannot say that: clicking through five organization pages and then going back
 * lands on the fourth. So the last page *outside* the section is remembered as
 * it is visited, and the back control reads it. Opening an organization URL
 * directly, in a tab that has seen nothing else, has nothing remembered and goes
 * to a new chat.
 *
 * Per tab (`sessionStorage`), not per browser: two tabs in two places each go
 * back to their own.
 */

export const ORGANIZATION_RETURN_KEY = 'ragen:organization-return-path';

/** Where back goes when no earlier page is known. */
export const DEFAULT_RETURN_PATH = '/new';

const SECTION = '/organization';

/** Whether a locale-less pathname (`usePathname()` from `@/i18n/routing`) is in the section. */
export function isOrganizationPath(pathname: string): boolean {
  return pathname === SECTION || pathname.startsWith(`${SECTION}/`);
}

/**
 * A path the app may navigate to, as opposed to anything that merely begins with
 * a slash. Remembered text is read back out of storage that other code on the
 * origin can write, so it is checked on the way out as well as on the way in: no
 * `//host` (a protocol-relative URL), no backslash tricks, no way back into the
 * section itself, and a sane length.
 */
export function isSafeReturnPath(path: unknown): path is string {
  return (
    typeof path === 'string' &&
    path.startsWith('/') &&
    !path.startsWith('//') &&
    !path.includes('\\') &&
    !path.includes('\n') &&
    !path.includes('\r') &&
    path.length <= 2048 &&
    !isOrganizationPath(path.split(/[?#]/)[0])
  );
}

/** Remember a page the reader is on, unless it is in the section. */
export function rememberPage(
  storage: Pick<Storage, 'setItem'>,
  pathname: string,
  search = '',
): void {
  if (isOrganizationPath(pathname)) {
    return;
  }

  const path = `${pathname}${search}`;
  if (isSafeReturnPath(path)) {
    storage.setItem(ORGANIZATION_RETURN_KEY, path);
  }
}

/** The remembered page, or the default when there is none or it is not safe. */
export function returnPath(storage: Pick<Storage, 'getItem'>): string {
  const remembered = storage.getItem(ORGANIZATION_RETURN_KEY);

  return isSafeReturnPath(remembered) ? remembered : DEFAULT_RETURN_PATH;
}
