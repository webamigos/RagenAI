import { isIP } from 'node:net';

/**
 * Ported verbatim from apps/web's
 * src/features/connectors/utils/site-url.ts (`normalizeSiteUrl` only —
 * the rest of that file's exports are UI-only). See
 * docs/adrs/21-monorepo-and-api-decoupling.md. apps/web's copy is no longer
 * called anywhere (registration was cut over to this endpoint per ADR-21's
 * Phase C), so the private-address hardening below was added only here.
 *
 * Normalize a user-supplied shop URL for custom-header MCP connectors.
 * Enforces HTTPS, strips trailing slashes, and rejects anything that
 * isn't a parseable URL. Returns the normalized origin + path (no
 * query/hash) so the downstream `${siteUrl}${mcpServerUrlPath}` join
 * is predictable.
 */
export function normalizeSiteUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Site URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Site URL must be a valid URL (including https://)');
  }

  if (parsed.protocol !== 'https:') {
    throw new Error('Site URL must use https://');
  }

  // Reject embedded credentials (`https://user:pass@host`). URL.origin
  // silently drops them, which would otherwise hide a likely paste
  // mistake. The consumer key/secret go in dedicated fields, not the URL.
  if (parsed.username || parsed.password) {
    throw new Error('Site URL must not contain embedded credentials');
  }

  // SSRF guard: this URL is later handed straight to `createMCPClient`,
  // which fetches it from apps/api's own network position. A org member
  // could otherwise point a connector at a loopback/private/link-local
  // address to reach an internal service. Only catches literal
  // addresses (and the `localhost` name) — a public hostname that
  // *resolves* to a private IP (DNS rebinding) is not caught here, since
  // that needs a check at the outbound-request boundary, not at URL
  // parse time.
  if (isPrivateOrLoopbackHost(parsed.hostname)) {
    throw new Error('Site URL must not point to a local or private address');
  }

  // Strip trailing slash from pathname; normalize the full URL to origin + path.
  const pathname = parsed.pathname.replace(/\/+$/, '');
  return `${parsed.origin}${pathname}`;
}

function isPrivateOrLoopbackHost(hostname: string): boolean {
  // `URL.hostname` keeps the brackets for an IPv6 literal (`[::1]`), which
  // `net.isIP()` does not recognize — strip them before checking either the
  // name or the IP itself.
  // A trailing dot is the DNS root and resolves the same as without it, so
  // `localhost.` reaches the loopback while comparing unequal to `localhost`.
  // `URL` keeps it on a name (it drops it from an IPv4 literal on its own),
  // and accepts more than one, so strip the whole run before classifying.
  const host = hostname
    .toLowerCase()
    .replace(/^\[(.*)\]$/, '$1')
    .replace(/\.+$/, '');
  if (host === 'localhost' || host.endsWith('.localhost')) {
    return true;
  }

  const ipVersion = isIP(host);
  if (ipVersion === 4) {
    return isPrivateOrLoopbackIPv4(host);
  }
  if (ipVersion === 6) {
    return isPrivateOrLoopbackIPv6(host);
  }
  return false;
}

function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const octets = ip.split('.').map(Number);
  const [a, b] = octets;
  return (
    a === 127 || // loopback (127.0.0.0/8)
    a === 10 || // RFC1918 (10.0.0.0/8)
    (a === 172 && b >= 16 && b <= 31) || // RFC1918 (172.16.0.0/12)
    (a === 192 && b === 168) || // RFC1918 (192.168.0.0/16)
    (a === 169 && b === 254) || // link-local (169.254.0.0/16)
    (a === 100 && b >= 64 && b <= 127) || // CGNAT (100.64.0.0/10)
    a === 0 // "this network" (0.0.0.0/8)
  );
}

function isPrivateOrLoopbackIPv6(ip: string): boolean {
  const host = ip.toLowerCase();
  if (
    host === '::1' || // loopback
    host === '::' // unspecified
  ) {
    return true;
  }

  // Both reserved blocks are defined by a prefix shorter than a hextet, so
  // classify on the first hextet's value rather than its leading characters:
  // fe80::/10 spans fe80–febf, and matching the literal `fe80:` left fe81–febf
  // reachable. An address that starts with `::` has no first hextet, which
  // `parseInt` reports as NaN and every comparison below then rejects.
  const firstHextet = parseInt(host.split(':')[0], 16);
  if (firstHextet >= 0xfe80 && firstHextet <= 0xfebf) {
    return true; // link-local (fe80::/10)
  }
  if (firstHextet >= 0xfc00 && firstHextet <= 0xfdff) {
    return true; // unique local (fc00::/7)
  }

  // IPv4-mapped (`::ffff:a.b.c.d`) — `URL.hostname` actually normalizes this
  // to the hex-group form (`::ffff:7f00:1` for 127.0.0.1), so both forms
  // need decoding back to IPv4 and re-checking against the IPv4 ranges.
  const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (dotted) {
    return isPrivateOrLoopbackIPv4(dotted[1]);
  }
  const hexMapped = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    const mappedIPv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    return isPrivateOrLoopbackIPv4(mappedIPv4);
  }

  return false;
}
