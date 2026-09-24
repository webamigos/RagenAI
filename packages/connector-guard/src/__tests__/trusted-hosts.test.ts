import { describe, expect, it } from 'vitest';

import { isDeployerTrustedUrl, parseTrustedHosts } from '../trusted-hosts';

describe('deployer-trusted connector hosts', () => {
  const env = 'ragen-mcp-rejestrio.railway.internal, .corp.example';

  it('trusts an exactly named host', () => {
    expect(
      isDeployerTrustedUrl(
        'http://ragen-mcp-rejestrio.railway.internal:9080/mcp',
        env,
      ),
    ).toBe(true);
  });

  it('trusts subdomains of a dotted suffix, not the bare domain', () => {
    expect(isDeployerTrustedUrl('https://mcp.corp.example/mcp', env)).toBe(
      true,
    );
    expect(isDeployerTrustedUrl('https://corp.example/mcp', env)).toBe(false);
  });

  it('does not trust a host that merely ends in the same letters', () => {
    // `evilcorp.example` must not ride on `.corp.example`.
    expect(isDeployerTrustedUrl('https://evilcorp.example/mcp', env)).toBe(
      false,
    );
    expect(
      isDeployerTrustedUrl('http://other.railway.internal:9080/mcp', env),
    ).toBe(false);
  });

  it('trusts nothing when the variable is unset or empty', () => {
    expect(
      isDeployerTrustedUrl(
        'http://ragen-mcp-rejestrio.railway.internal/mcp',
        undefined,
      ),
    ).toBe(false);
    expect(
      isDeployerTrustedUrl(
        'http://ragen-mcp-rejestrio.railway.internal/mcp',
        ' , ',
      ),
    ).toBe(false);
  });

  it('ignores wildcards rather than reading them as "trust everything"', () => {
    expect(parseTrustedHosts('*, *.example, host.example')).toEqual([
      'host.example',
    ]);
    expect(isDeployerTrustedUrl('https://anything.example/', '*')).toBe(false);
  });

  it('is case-insensitive and refuses what is not a URL', () => {
    expect(isDeployerTrustedUrl('HTTP://MCP.CORP.EXAMPLE/', env)).toBe(true);
    expect(isDeployerTrustedUrl('not a url', env)).toBe(false);
    expect(isDeployerTrustedUrl(null, env)).toBe(false);
  });
});
