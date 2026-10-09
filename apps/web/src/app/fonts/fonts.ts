/**
 * The panel's two typefaces, served from this directory rather than fetched
 * from Google Fonts at build time.
 *
 * `next/font/google` downloads the CSS and the font files while `next build`
 * runs. Google sometimes answers with an extensionless
 * `fonts.gstatic.com/l/font?kit=…&skey=…` URL, which Turbopack cannot parse
 * (vercel/next.js#99114), and the build fails with "next/font/google queries
 * have exactly one entry". On 2026-10-09 that failed two of three `main`
 * builds in a row with no code change. A self-hosted install also should not
 * need Google to be reachable to build its own image. So the files are here,
 * from Fontsource (SIL Open Font License 1.1, see the LICENSE files), and
 * `tests/architecture/fonts-are-not-fetched-at-build.test.ts` keeps it so.
 *
 * Each subset is its own `@font-face` with Google's `unicode-range`, so a
 * browser downloads `latin-ext` (ą ć ę ł ń ś ź ż) only on a page that uses it
 * — the same split `next/font/google` produced. Two subsets of one family are
 * two loader calls, because `next/font/local` gives every call its own family
 * name; `global.css` lists both in the stack, latin first, and only the second
 * carries Next's metric-adjusted fallback (see `displayLatin`).
 *
 * Options are literals, not shared constants: Next rejects a font loader
 * argument it cannot read statically.
 */
import localFont from 'next/font/local';

export const interLatin = localFont({
  src: './inter-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter-latin',
  // See the note on `displayLatin`: a fallback here would take the Polish
  // glyphs before `interLatinExt` is reached.
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const interLatinExt = localFont({
  src: './inter-latin-ext-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter-latin-ext',
  preload: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

/**
 * Page titles, section headers, eyebrows and table column headers — nothing
 * else. Exposed as CSS variables because `--font-display` in `global.css` is
 * what components reach for.
 */
export const displayLatin = localFont({
  src: [
    { path: './barlow-condensed-latin-500-normal.woff2', weight: '500' },
    { path: './barlow-condensed-latin-600-normal.woff2', weight: '600' },
    { path: './barlow-condensed-latin-700-normal.woff2', weight: '700' },
  ],
  display: 'swap',
  variable: '--font-display-loaded',
  // Off on the latin half of each pair, on for the latin-ext half. Next puts
  // a metric-adjusted local Arial right after each family, and Arial has
  // ą ć ę: placed between the two subsets it would answer for every Polish
  // character, so the latin-ext file would never be used. Last in the stack
  // it still does its job, keeping layout steady while the files load.
  adjustFontFallback: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD',
    },
  ],
});

export const displayLatinExt = localFont({
  src: [
    { path: './barlow-condensed-latin-ext-500-normal.woff2', weight: '500' },
    { path: './barlow-condensed-latin-ext-600-normal.woff2', weight: '600' },
    { path: './barlow-condensed-latin-ext-700-normal.woff2', weight: '700' },
  ],
  display: 'swap',
  variable: '--font-display-loaded-ext',
  preload: false,
  declarations: [
    {
      prop: 'unicode-range',
      value:
        'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF',
    },
  ],
});

/** Every variable above, for the `<html>` element. */
export const fontVariables = [
  interLatin.variable,
  interLatinExt.variable,
  displayLatin.variable,
  displayLatinExt.variable,
].join(' ');
