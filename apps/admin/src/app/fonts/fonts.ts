/**
 * Geist and Geist Mono, served from this directory rather than fetched from
 * Google Fonts at build time — see `apps/web/src/app/fonts/fonts.ts` for why
 * (vercel/next.js#99114 failed `main` builds on 2026-10-09). Files from
 * Fontsource, SIL Open Font License 1.1 (`LICENSE-geist.txt`). Latin only,
 * the subset this app asked Google for.
 */
import localFont from 'next/font/local';

export const geistSans = localFont({
  src: './geist-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-geist-sans',
});

export const geistMono = localFont({
  src: './geist-mono-latin-wght-normal.woff2',
  weight: '100 900',
  display: 'swap',
  variable: '--font-geist-mono',
});
