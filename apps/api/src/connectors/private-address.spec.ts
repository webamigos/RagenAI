import {
  isPrivateOrLoopbackAddress,
  isPrivateOrLoopbackHost,
} from './private-address.js';

describe('isPrivateOrLoopbackAddress', () => {
  it.each([
    ['0.0.0.0', 'this-network'],
    ['10.1.2.3', 'RFC 1918 /8'],
    ['100.64.0.1', 'CGNAT lower bound'],
    ['100.127.255.255', 'CGNAT upper bound'],
    ['127.0.0.1', 'loopback'],
    ['127.1.2.3', 'loopback /8'],
    ['169.254.169.254', 'cloud metadata'],
    ['172.16.0.1', 'RFC 1918 /12 lower bound'],
    ['172.31.255.255', 'RFC 1918 /12 upper bound'],
    ['192.0.0.1', 'IETF protocol assignments'],
    ['192.168.1.10', 'RFC 1918 /16'],
    ['198.18.0.1', 'benchmarking'],
    ['192.0.2.5', 'TEST-NET-1'],
    ['192.88.99.1', 'deprecated 6to4 relay anycast'],
    ['198.51.100.5', 'TEST-NET-2'],
    ['203.0.113.10', 'TEST-NET-3'],
    ['224.0.0.1', 'multicast'],
    ['255.255.255.255', 'broadcast'],
  ])('blocks %s (%s)', (address) => {
    expect(isPrivateOrLoopbackAddress(address)).toBe(true);
  });

  it.each([
    ['8.8.8.8'],
    ['1.1.1.1'],
    ['99.255.255.255'],
    ['100.63.255.255'], // just below CGNAT
    ['100.128.0.0'], // just above CGNAT
    ['172.15.255.255'], // just below RFC 1918 /12
    ['172.32.0.0'], // just above RFC 1918 /12
    ['192.0.1.1'], // outside 192.0.0.0/24 and TEST-NET-1
    ['192.88.98.1'], // just below the 6to4 relay block
    ['198.51.101.1'], // just above TEST-NET-2
    ['203.0.114.1'], // just above TEST-NET-3
    ['198.20.0.1'], // just above benchmarking
    ['223.255.255.255'], // just below multicast
  ])('allows public IPv4 %s', (address) => {
    expect(isPrivateOrLoopbackAddress(address)).toBe(false);
  });

  it.each([
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
    ['::ffff:169.254.169.254', 'IPv4-mapped metadata'],
    ['::ffff:10.0.0.1', 'IPv4-mapped RFC 1918'],
    ['::127.0.0.1', 'deprecated IPv4-compatible'],
    ['64:ff9b::127.0.0.1', 'NAT64 wrapping loopback'],
    ['2002:7f00:0001::', '6to4 wrapping loopback'],
    ['fc00::1', 'unique local lower bound'],
    ['fdff:ffff::1', 'unique local upper bound'],
    ['fe80::1', 'link-local'],
    ['fe80::1%eth0', 'link-local with zone id'],
    ['febf::1', 'link-local upper bound'],
    ['ff02::1', 'multicast'],
    ['100::1', 'discard-only'],
    ['2001:db8::1', 'documentation'],
    ['2001:0:1234::1', 'Teredo'],
    ['0:0:0:0:0:0:0:1', 'fully expanded loopback'],
  ])('blocks %s (%s)', (address) => {
    expect(isPrivateOrLoopbackAddress(address)).toBe(true);
  });

  it.each([
    ['2001:4860:4860::8888'],
    ['2606:4700:4700::1111'],
    ['::ffff:8.8.8.8'], // IPv4-mapped public address
    ['64:ff9b::8.8.8.8'], // NAT64 wrapping a public address
    ['2002:0808:0808::'], // 6to4 wrapping 8.8.8.8
    ['fe00::1'], // below fc00::/7
    ['fec0::1'], // above fe80::/10 (site-local, deprecated but routable)
    ['2001:db9::1'], // just outside the documentation prefix
    ['2001:1:2::1'], // just outside Teredo
  ])('allows public IPv6 %s', (address) => {
    expect(isPrivateOrLoopbackAddress(address)).toBe(false);
  });

  it('treats a non-IP string as not an address', () => {
    expect(isPrivateOrLoopbackAddress('shop.example.com')).toBe(false);
  });
});

describe('isPrivateOrLoopbackHost', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'localhost..',
    'foo.localhost.',
    '[::1]',
    'api.localhost',
    'printer.local',
    'metadata.google.internal',
    'db.home.arpa',
    '127.0.0.1',
    '[::1]',
    '[fe80::1]',
    '192.168.0.1',
    '',
    '   ',
  ])('blocks host %p', (host) => {
    expect(isPrivateOrLoopbackHost(host)).toBe(true);
  });

  it.each([
    'shop.example.com',
    'shop.example.com.',
    'example.com',
    'localhost.example.com',
    'my-local.example.com',
    '8.8.8.8',
    '[2001:4860:4860::8888]',
  ])('allows host %p', (host) => {
    expect(isPrivateOrLoopbackHost(host)).toBe(false);
  });
});
