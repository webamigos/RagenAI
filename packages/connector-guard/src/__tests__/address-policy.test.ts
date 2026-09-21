import { describe, expect, it } from 'vitest';

import {
  classifyAddress,
  isBlockedAddress,
  isBlockedHost,
} from '../private-address';

/**
 * The opt-out an operator's own MCP server needs, and the addresses it must
 * still refuse. Its whole justification is that the two sets do not overlap:
 * an internal server lives on RFC 1918 space, and cloud metadata does not.
 */
describe('the address policy', () => {
  it('classifies the ranges the opt-out turns on, and those it does not', () => {
    expect(classifyAddress('10.0.0.5')).toBe('private');
    expect(classifyAddress('172.16.9.9')).toBe('private');
    expect(classifyAddress('192.168.1.10')).toBe('private');

    expect(classifyAddress('127.0.0.1')).toBe('loopback');
    expect(classifyAddress('::1')).toBe('loopback');
    expect(classifyAddress('169.254.169.254')).toBe('link-local');
    expect(classifyAddress('fe80::1')).toBe('link-local');
    expect(classifyAddress('fd00:ec2::254')).toBe('unique-local');
    expect(classifyAddress('100.64.0.1')).toBe('reserved');
    expect(classifyAddress('198.18.0.1')).toBe('reserved');

    expect(classifyAddress('93.184.216.34')).toBe('public');
    expect(classifyAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(
      'public',
    );
  });

  it('refuses everything but public space by default', () => {
    for (const address of [
      '10.0.0.5',
      '127.0.0.1',
      '169.254.169.254',
      'fd00:ec2::254',
      '::1',
    ]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
  });

  it('admits RFC 1918 with the opt-out, and nothing else', () => {
    const policy = { allowPrivate: true };

    expect(isBlockedAddress('10.0.0.5', policy)).toBe(false);
    expect(isBlockedAddress('192.168.1.10', policy)).toBe(false);

    // The address this feature would otherwise reach. Cloud metadata is
    // link-local, and nothing an operator self-hosts is there — a flag that
    // admitted it would be a rename of "off".
    expect(isBlockedAddress('169.254.169.254', policy)).toBe(true);
    expect(isBlockedAddress('fd00:ec2::254', policy)).toBe(true);
    expect(isBlockedAddress('127.0.0.1', policy)).toBe(true);
    expect(isBlockedAddress('::1', policy)).toBe(true);
    expect(isBlockedAddress('::ffff:169.254.169.254', policy)).toBe(true);
  });

  it('sees through an IPv4 address wrapped in IPv6, both ways', () => {
    expect(isBlockedAddress('::ffff:10.0.0.5')).toBe(true);
    expect(isBlockedAddress('::ffff:10.0.0.5', { allowPrivate: true })).toBe(
      false,
    );
    expect(isBlockedAddress('2002:a00:5::', { allowPrivate: true })).toBe(
      false,
    );
    expect(
      isBlockedAddress('2002:a9fe:a9fe::', { allowPrivate: true }),
      '6to4-wrapped metadata address',
    ).toBe(true);
  });

  it('admits an internal *name* with the opt-out, but never a loopback one', () => {
    const policy = { allowPrivate: true };

    // A name says nothing about the address; the resolver's answer is checked
    // at connect time, which is where DNS rebinding is caught.
    expect(isBlockedHost('mcp.corp.internal', policy)).toBe(false);
    expect(isBlockedHost('notion.example.com', policy)).toBe(false);
    expect(isBlockedHost('mcp.home.arpa', policy)).toBe(false);

    expect(isBlockedHost('localhost', policy)).toBe(true);
    expect(isBlockedHost('app.localhost', policy)).toBe(true);
    expect(isBlockedHost('printer.local', policy)).toBe(true);
    expect(isBlockedHost('[::1]', policy)).toBe(true);
    expect(isBlockedHost('10.0.0.5', policy)).toBe(false);
  });

  it('refuses every internal name without the opt-out, as it always did', () => {
    for (const host of [
      'localhost',
      'mcp.corp.internal',
      'printer.local',
      'mcp.home.arpa',
      '[::1]',
      '10.0.0.5',
    ]) {
      expect(isBlockedHost(host), host).toBe(true);
    }
    expect(isBlockedHost('notion.example.com')).toBe(false);
  });
});
