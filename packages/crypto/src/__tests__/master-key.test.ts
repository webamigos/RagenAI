import { describe, expect, it } from 'vitest';

import { parseMasterKey } from '../master-key';

const RAW = Buffer.from(Array.from({ length: 32 }, (_, i) => i));

describe('parseMasterKey', () => {
  it('reads the 64-character hex form .env.example documents', () => {
    expect(parseMasterKey(RAW.toString('hex')).equals(RAW)).toBe(true);
  });

  it('reads a 32-byte base64 key', () => {
    expect(parseMasterKey(RAW.toString('base64')).equals(RAW)).toBe(true);
  });

  it('reads hex as hex, not as 48 bytes of base64', () => {
    // The bug this function exists for: a 64-character hex string is valid
    // base64 input and decodes to 48 bytes, so trying base64 first turned the
    // documented key into a length error.
    const hex = RAW.toString('hex');

    expect(Buffer.from(hex, 'base64').length).toBe(48);
    expect(parseMasterKey(hex).length).toBe(32);
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseMasterKey(`  ${RAW.toString('hex')}\n`).equals(RAW)).toBe(true);
  });

  it('rejects anything else, naming both accepted forms', () => {
    expect(() => parseMasterKey('too-short')).toThrow(/hex/);
    expect(() => parseMasterKey('too-short')).toThrow(/base64/);
  });

  it('rejects a hex string of the wrong length', () => {
    expect(() => parseMasterKey('ab'.repeat(16))).toThrow();
  });
});
