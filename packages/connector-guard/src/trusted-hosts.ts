/**
 * Hosts the *deployer* vouches for, so a catalogue entry pointing at one is
 * connected the way a built-in `MCP_*_SERVER_URL` is: without the address
 * policy.
 *
 * Why this exists. Railway's private network gives each service a name under
 * `.railway.internal` that resolves to an RFC 1918 address *and* an IPv6
 * unique-local one (`fd12:…`), and some services can reach only the second.
 * The address policy refuses unique-local outright — `fd00:ec2::254` is EC2's
 * metadata service — and `allowsPrivateAddress` admits RFC 1918 only, so an
 * MCP server on the same private network could not be added from
 * `/mcp-catalogue` at all. The rejestr.io connector was the case.
 *
 * Why an environment variable and not a flag on the row. The row is typed
 * into a web form; this list is set by whoever runs the deployment, which is
 * exactly the trust a built-in's `MCP_*_SERVER_URL` already carries. The form
 * cannot widen it.
 *
 * Syntax: comma-separated. `host.example` matches that host exactly;
 * `.example` matches any subdomain of it (not `example` itself). No wildcards
 * and no IP ranges — a list this powerful should name what it trusts.
 */
export const TRUSTED_HOSTS_ENV = 'CONNECTOR_TRUSTED_HOSTS';

export function parseTrustedHosts(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 1 && !entry.includes('*'));
}

export function isDeployerTrustedUrl(
  url: string | null | undefined,
  raw: string | undefined = process.env[TRUSTED_HOSTS_ENV],
): boolean {
  if (!url) {
    return false;
  }
  const trusted = parseTrustedHosts(raw);
  if (trusted.length === 0) {
    return false;
  }
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return trusted.some((entry) =>
    entry.startsWith('.') ? host.endsWith(entry) : host === entry,
  );
}
