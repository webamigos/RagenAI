/**
 * A full page load, on purpose.
 *
 * Client-side navigation (`useRouter().push` from `@/i18n/routing`) keeps the
 * React tree and the server components already rendered. After the session
 * changes — sign-in, sign-up, sign-out, verifying an email, accepting an
 * invitation — that means the new cookie is not reflected until something else
 * forces a re-render, and the user sees a page rendered for the session they
 * just left. Reloading is what guarantees the server renders against the new
 * one.
 *
 * It is slower, and that is the trade: the session being right beats the
 * transition being smooth. Every call site here is an auth-state change.
 *
 * **Ordinary navigation does not belong here.** Use `Link` or `useRouter` from
 * `@/i18n/routing`, which is also what keeps the locale prefix correct.
 *
 * The locale is a separate argument rather than part of the path because
 * forgetting the prefix is the mistake this replaces: eleven call sites each
 * interpolated it by hand.
 */
export function hardNavigate(locale: string, path: string): void {
  const normalised = path.startsWith('/') ? path : `/${path}`;

  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the whole point of this helper; see the comment above
  window.location.href = `/${locale}${normalised}`;
}
