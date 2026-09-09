import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

/**
 * Phase 5 — external link interstitial.
 *
 * When the chat UI renders a link from LLM output whose hostname is
 * NOT on the `NEXT_PUBLIC_TRUSTED_LINK_DOMAINS` allowlist, the link
 * rewriter in `src/libs/security/link-rewriter.ts` points it at
 * `/r?u=<encoded>`. This page:
 *
 *   1. Parses and validates the `u` query parameter.
 *   2. Shows the destination hostname + full URL to the user.
 *   3. Asks them to confirm before opening.
 *
 * The "Continue" button is a plain `<a href>` with
 * `rel="noopener noreferrer"` so the destination cannot access
 * `window.opener`. No JavaScript is required to open the link, which
 * means the interstitial works even with scripts disabled.
 *
 * If the `u` parameter is missing or invalid, we show an error state
 * instead of silently redirecting — the rewriter only produces well-
 * formed URLs, so a malformed value almost always means the user
 * pasted the link in themselves or an attacker crafted it.
 */

type SearchParams = { u?: string };

type ParsedDestination =
  | { ok: true; url: URL; display: string; host: string }
  | { ok: false; reason: 'missing' | 'invalid' | 'unsupported-scheme' };

function parseDestination(raw: string | undefined): ParsedDestination {
  if (!raw || raw.trim() === '') {
    return { ok: false, reason: 'missing' };
  }
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { ok: false, reason: 'unsupported-scheme' };
  }
  // Display a truncated version of the URL — full URLs can be very
  // long and attackers sometimes pad them with junk to push the
  // hostname out of view.
  const display =
    parsed.toString().length > 200
      ? `${parsed.toString().slice(0, 200)}…`
      : parsed.toString();
  return { ok: true, url: parsed, display, host: parsed.hostname };
}

export default async function LinkInterstitialPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const destination = parseDestination(params.u);
  const t = await getTranslations('link-interstitial');

  if (!destination.ok) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
        <h1 className="text-xl font-semibold text-destructive">
          {t('error-title')}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {t(`error-${destination.reason}`)}
        </p>
        <Link
          href="/"
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:opacity-90"
        >
          {t('back-home')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
      <div className="rounded-2xl border border-pending/40 bg-pending-tint/70 p-8 dark:bg-pending/10">
        <h1 className="text-xl font-semibold text-pending">{t('title')}</h1>
        <p className="mt-3 text-sm text-pending">{t('description')}</p>
        <div className="mt-5 rounded-lg bg-white p-4 text-left text-xs dark:bg-card">
          <p className="text-muted-foreground">{t('host-label')}</p>
          <p className="mt-1 break-all font-mono font-medium text-foreground">
            {destination.host}
          </p>
          <p className="mt-3 text-muted-foreground">{t('url-label')}</p>
          <p className="mt-1 break-all font-mono text-foreground">
            {destination.display}
          </p>
        </div>
        <div className="mt-6 flex justify-center gap-3">
          <Link
            href="/"
            className="rounded-md border border-pending/40 bg-white px-4 py-2 text-sm font-medium text-pending hover:bg-pending-tint dark:bg-transparent dark:hover:bg-pending/20"
          >
            {t('cancel')}
          </Link>
          <a
            href={destination.url.toString()}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md bg-pending px-4 py-2 text-sm font-medium text-white hover:bg-pending/90"
          >
            {t('continue')}
          </a>
        </div>
      </div>
    </div>
  );
}
