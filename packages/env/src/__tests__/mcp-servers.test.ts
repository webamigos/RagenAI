import { describe, expect, it } from 'vitest';

import {
  BUILT_IN_MCP_SERVERS,
  isBuiltInMcpSlug,
  resolveBuiltInMcpAuthUrl,
  resolveBuiltInMcpServerUrl,
} from '../mcp-servers';

describe('a built-in connector’s server address', () => {
  it('prefers the environment and falls back to the compiled default', () => {
    expect(
      resolveBuiltInMcpServerUrl('SLACK', {
        MCP_SLACK_SERVER_URL: 'https://slack.internal/mcp',
      }),
    ).toBe('https://slack.internal/mcp');
    expect(resolveBuiltInMcpServerUrl('SLACK', {})).toBe(
      'https://mcp.slack.com/mcp',
    );
  });

  it('treats a blank variable as unset', () => {
    // A Railway variable someone cleared and a `FOO=` line in a compose file
    // are both real deploy shapes, and neither means "the empty string".
    expect(
      resolveBuiltInMcpServerUrl('SLACK', { MCP_SLACK_SERVER_URL: '  ' }),
    ).toBe('https://mcp.slack.com/mcp');
  });

  it('sends all five Google connectors to one container', () => {
    const urls = [
      'GOOGLE_CALENDAR',
      'GOOGLE_ANALYTICS',
      'GOOGLE_ADS',
      'GOOGLE_DRIVE',
      'GMAIL',
    ].map((slug) =>
      resolveBuiltInMcpServerUrl(slug, {
        MCP_GOOGLE_SERVER_URL: 'http://google-mcp:8000',
      }),
    );
    expect(new Set(urls)).toEqual(new Set(['http://google-mcp:8000']));
  });

  it('answers nothing for a slug with no deployment-wide address', () => {
    // WooCommerce and Open Mercato assemble their URL per connector, from the
    // shop URL the user types at connect time.
    expect(resolveBuiltInMcpServerUrl('WOOCOMMERCE', {})).toBeUndefined();
    expect(resolveBuiltInMcpServerUrl('OPEN_MERCATO', {})).toBeUndefined();
    expect(resolveBuiltInMcpServerUrl('notion', {})).toBeUndefined();
    expect(isBuiltInMcpSlug('notion')).toBe(false);
  });

  it('gives Google its own auth host only when one is configured', () => {
    expect(
      resolveBuiltInMcpAuthUrl('GMAIL', {
        MCP_GOOGLE_SERVER_URL: 'http://google-mcp:8000',
      }),
    ).toBe('http://google-mcp:8000');
    expect(
      resolveBuiltInMcpAuthUrl('GMAIL', {
        MCP_GOOGLE_SERVER_URL: 'http://google-mcp:8000',
        MCP_GOOGLE_AUTH_URL: 'https://auth.example',
      }),
    ).toBe('https://auth.example');
    expect(resolveBuiltInMcpAuthUrl('SLACK', {})).toBeUndefined();
  });

  it('names a variable for every slug it carries', () => {
    for (const [slug, seam] of Object.entries(BUILT_IN_MCP_SERVERS)) {
      expect(seam.variable).toMatch(/^MCP_[A-Z_]+_SERVER_URL$/);
      expect(seam.fallback).toMatch(/^https?:\/\//);
      expect(resolveBuiltInMcpServerUrl(slug, {})).toBe(seam.fallback);
    }
  });
});
