/**
 * The sections whose menu replaces the sidebar's own content, and where their
 * "Main menu" goes back to.
 *
 * Inside `/organization` (#1399) and `/settings` the sidebar lists that
 * section's pages instead of the main menu and the thread history, so it needs
 * a way back, and "back" has to mean the page you were on when you went in.
 * `history.back()` cannot say that: clicking through five settings pages and
 * then going back lands on the fourth. So the last page *outside every
 * section* is remembered as it is visited, and the back control reads it.
 * Going from settings into the organization and back out lands where the
 * reader was before either. Opening a section URL directly, in a tab that has
 * seen nothing else, has nothing remembered and goes to a new chat.
 *
 * Per tab (`sessionStorage`), not per browser: two tabs in two places each go
 * back to their own.
 */

export type MenuSection = 'organization' | 'settings';

const SECTION_PATHS: Readonly<Record<MenuSection, string>> = {
  organization: '/organization',
  settings: '/settings',
};

/**
 * The key predates the settings section; it is kept so a tab that was already
 * inside the organization when this shipped still knows its way back.
 */
export const RETURN_PATH_KEY = 'ragen:organization-return-path';

/** Where back goes when no earlier page is known. */
export const DEFAULT_RETURN_PATH = '/new';

const isUnder = (pathname: string, prefix: string) =>
  pathname === prefix || pathname.startsWith(`${prefix}/`);

/**
 * Which section a locale-less pathname (`usePathname()` from `@/i18n/routing`)
 * is in, or `null` outside all of them.
 */
export function sectionOf(pathname: string): MenuSection | null {
  for (const [section, prefix] of Object.entries(SECTION_PATHS)) {
    if (isUnder(pathname, prefix)) {
      return section as MenuSection;
    }
  }
  return null;
}

/** Whether a locale-less pathname is inside one of the sections. */
export function isMenuSectionPath(pathname: string): boolean {
  return sectionOf(pathname) !== null;
}

/**
 * A path the app may navigate to, as opposed to anything that merely begins with
 * a slash. Remembered text is read back out of storage that other code on the
 * origin can write, so it is checked on the way out as well as on the way in: no
 * `//host` (a protocol-relative URL), no backslash tricks, no way back into a
 * section, and a sane length.
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
    !isMenuSectionPath(path.split(/[?#]/)[0])
  );
}

/** Remember a page the reader is on, unless it is in a section. */
export function rememberPage(
  storage: Pick<Storage, 'setItem'>,
  pathname: string,
  search = '',
): void {
  if (isMenuSectionPath(pathname)) {
    return;
  }

  const path = `${pathname}${search}`;
  if (isSafeReturnPath(path)) {
    storage.setItem(RETURN_PATH_KEY, path);
  }
}

/** The remembered page, or the default when there is none or it is not safe. */
export function returnPath(storage: Pick<Storage, 'getItem'>): string {
  const remembered = storage.getItem(RETURN_PATH_KEY);

  return isSafeReturnPath(remembered) ? remembered : DEFAULT_RETURN_PATH;
}
