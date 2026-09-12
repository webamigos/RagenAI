import { isIP, isIPv4, isIPv6 } from 'node:net';

/**
 * The SSRF address policy for user-supplied connector URLs.
 *
 * It runs at two points, and both are needed:
 *
 *  1. Parse time (`normalizeSiteUrl`), so a literal `https://127.0.0.1/` is
 *     rejected with a useful message before anything is stored.
 *  2. Connect time (`guarded-fetch.ts`), because a perfectly public hostname
 *     can resolve to a private address — DNS rebinding. Parse-time checks
 *     cannot see that; only the resolver's answer can.
 *
 * The policy rejects every range that is not globally routable, not just the
 * RFC 1918 ones: documentation, benchmarking and reserved space is never a
 * real customer shop, and networks do squat on it internally.
 *
 * Deliberately *not* applied to the fixed, deployer-controlled MCP URLs read
 * from `MCP_*_SERVER_URL`: apps/api legitimately talks to LiteLLM on 4000,
 * ragen-token-vault on 3100 and apps/web's internal API over loopback.
 */

/** Hostnames that never name a host outside the local network. */
const PRIVATE_HOST_NAMES = new Set(['localhost', 'local']);

/** Suffixes reserved for local/private naming (RFC 6761/8375, cloud internal DNS). */
const PRIVATE_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
];

/** Drop an IPv6 zone index (`fe80::1%eth0`) before parsing. */
function stripZoneId(address: string): string {
  const separator = address.indexOf('%');
  return separator === -1 ? address : address.slice(0, separator);
}

function parseIpv4(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) {
    return null;
  }
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const value = Number(part);
    if (value > 255) {
      return null;
    }
    octets.push(value);
  }
  return octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0) {
    return true; // 0.0.0.0/8 — "this network"
  }
  if (a === 10) {
    return true; // RFC 1918
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true; // 100.64.0.0/10 — CGNAT
  }
  if (a === 127) {
    return true; // loopback
  }
  if (a === 169 && b === 254) {
    return true; // 169.254.0.0/16 — link-local, incl. cloud metadata at 169.254.169.254
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true; // RFC 1918
  }
  if (a === 192 && b === 0 && c === 0) {
    return true; // 192.0.0.0/24 — IETF protocol assignments
  }
  if (a === 192 && b === 0 && c === 2) {
    return true; // 192.0.2.0/24 — TEST-NET-1
  }
  if (a === 192 && b === 88 && c === 99) {
    return true; // 192.88.99.0/24 — deprecated 6to4 relay anycast
  }
  if (a === 192 && b === 168) {
    return true; // RFC 1918
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true; // 198.18.0.0/15 — benchmarking
  }
  if (a === 198 && b === 51 && c === 100) {
    return true; // 198.51.100.0/24 — TEST-NET-2
  }
  if (a === 203 && b === 0 && c === 113) {
    return true; // 203.0.113.0/24 — TEST-NET-3
  }
  if (a >= 224) {
    return true; // multicast (224/4) and reserved (240/4, incl. 255.255.255.255)
  }
  return false;
}

/** Expand any IPv6 spelling into exactly eight 16-bit groups. */
function expandIpv6(address: string): number[] | null {
  if (!isIPv6(address)) {
    return null;
  }

  // A trailing dotted quad (`::ffff:127.0.0.1`) is two groups in disguise.
  let text = address;
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const octets = parseIpv4(tail);
    if (!octets) {
      return null;
    }
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 ? halves[1] : undefined;
  const foot = rest ? rest.split(':') : [];

  const groups: number[] = [];
  if (rest === undefined) {
    if (head.length !== 8) {
      return null;
    }
  } else if (head.length + foot.length > 8) {
    return null;
  }

  for (const group of head) {
    groups.push(parseInt(group, 16));
  }
  if (rest !== undefined) {
    for (let i = head.length + foot.length; i < 8; i++) {
      groups.push(0);
    }
  }
  for (const group of foot) {
    groups.push(parseInt(group, 16));
  }

  return groups.length === 8 && groups.every((g) => Number.isInteger(g))
    ? groups
    : null;
}

/** Read an embedded IPv4 address out of two 16-bit groups. */
function embeddedIpv4(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isPrivateIpv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  // ::/96 covers the unspecified address, ::1, and the deprecated
  // IPv4-compatible form. None of them ever names a public host.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0) {
    return true;
  }
  // ::ffff:0:0/96 — IPv4-mapped. Judge it by the address it carries.
  if (
    g0 === 0 &&
    g1 === 0 &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0xffff
  ) {
    return isPrivateIpv4(embeddedIpv4(g6, g7));
  }
  // 64:ff9b::/96 — NAT64. Same reasoning.
  if (
    g0 === 0x64 &&
    g1 === 0xff9b &&
    g2 === 0 &&
    g3 === 0 &&
    g4 === 0 &&
    g5 === 0
  ) {
    return isPrivateIpv4(embeddedIpv4(g6, g7));
  }
  // 64:ff9b:1::/48 — RFC 8215 local-use NAT64. Unlike the well-known prefix
  // above it carries no fixed IPv4 layout, so there is nothing to inspect:
  // the whole range is local-use and never globally routable.
  if (g0 === 0x64 && g1 === 0xff9b && g2 === 1) {
    return true;
  }
  // 2002::/16 — 6to4 wraps an IPv4 address in the next two groups.
  if (g0 === 0x2002) {
    return isPrivateIpv4(embeddedIpv4(g1, g2));
  }
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) {
    return true; // 100::/64 — discard-only
  }
  if (g0 === 0x2001 && g1 === 0x0db8) {
    return true; // 2001:db8::/32 — documentation
  }
  if (g0 === 0x2001 && g1 === 0) {
    return true; // 2001::/32 — Teredo, which tunnels to an arbitrary IPv4 host
  }
  if ((g0 & 0xfe00) === 0xfc00) {
    return true; // fc00::/7 — unique local
  }
  if ((g0 & 0xffc0) === 0xfe80) {
    return true; // fe80::/10 — link-local
  }
  if ((g0 & 0xffc0) === 0xfec0) {
    return true; // fec0::/10 — site-local; deprecated, still routed internally
  }
  if ((g0 & 0xff00) === 0xff00) {
    return true; // ff00::/8 — multicast
  }
  return false;
}

/**
 * True when `address` is an IP literal that points somewhere inside the
 * local host or a private network. A non-IP string is never "private" here —
 * use `isPrivateOrLoopbackHost` for hostnames.
 */
export function isPrivateOrLoopbackAddress(address: string): boolean {
  const bare = stripZoneId(address.trim());
  if (isIPv4(bare)) {
    const octets = parseIpv4(bare);
    return octets ? isPrivateIpv4(octets) : true;
  }
  const groups = expandIpv6(bare);
  return groups ? isPrivateIpv6(groups) : false;
}

/**
 * True when `host` — a `URL.hostname`, so possibly a bracketed IPv6 literal —
 * is an address or a name that cannot legitimately be a customer's shop.
 *
 * This only catches what is visible in the URL. A public name that *resolves*
 * to a private address gets caught later, by the guarded fetch.
 */
export function isPrivateOrLoopbackHost(host: string): boolean {
  // `URL.hostname` keeps the brackets on an IPv6 literal (`[::1]`), which
  // `net.isIP()` does not recognise. A trailing dot is the DNS root and
  // resolves the same as without it, so `localhost.` reaches the loopback
  // while comparing unequal to `localhost` — `URL` keeps it on a name (it
  // drops it from an IPv4 literal itself) and accepts more than one, so the
  // whole run has to go before classifying.
  const normalized = host
    .trim()
    .toLowerCase()
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .replace(/\.+$/, '');

  if (!normalized) {
    return true;
  }
  if (isIP(stripZoneId(normalized))) {
    return isPrivateOrLoopbackAddress(normalized);
  }
  if (PRIVATE_HOST_NAMES.has(normalized)) {
    return true;
  }
  return PRIVATE_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}
