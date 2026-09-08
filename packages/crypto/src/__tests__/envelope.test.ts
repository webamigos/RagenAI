import { describe, expect, it } from 'vitest';

import { decryptContent, encryptContent } from '../envelope';

/**
 * The format is the compatibility contract with every row already encrypted
 * in production, so it is pinned against a **fixed vector** and not only a
 * round trip.
 *
 * A round trip cannot catch the mistake that matters. Change the IV length,
 * the tag length or the concatenation order and encrypt-then-decrypt still
 * passes — both sides moved together — while every stored payload becomes
 * unreadable. The vector below was produced by the code as it stood when the
 * three copies were merged into this package. If it ever fails, the format
 * changed, and the question is not "fix the test" but "what happens to the
 * data already encrypted".
 */
const DEK = Buffer.from(
  '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
  'hex',
);
const PLAINTEXT = 'Ragen envelope format v1 — do not change';
const VECTOR =
  'oKGio6SlpqeoqaqrtHkbSCvrZ9EUAOu8dx/guB/eNHHmlzRdvOymEl/PGiG8GTPfzEoyUzj5THvQALzBbO3cYXZHI5zGTg==';

describe('the envelope format', () => {
  it('decrypts a payload encrypted before this package existed', () => {
    expect(decryptContent(VECTOR, DEK)).toBe(PLAINTEXT);
  });

  it('lays the payload out as IV(12) ‖ ciphertext ‖ tag(16)', () => {
    // Stated structurally as well, so a failure says which part moved.
    const packed = Buffer.from(VECTOR, 'base64');
    const utf8Length = Buffer.byteLength(PLAINTEXT, 'utf8');

    expect(packed.length).toBe(12 + utf8Length + 16);
    expect(packed.subarray(0, 12).toString('hex')).toBe(
      'a0a1a2a3a4a5a6a7a8a9aaab',
    );
  });

  it('round-trips new content', () => {
    const encrypted = encryptContent('hello', DEK);

    expect(encrypted).not.toContain('hello');
    expect(decryptContent(encrypted, DEK)).toBe('hello');
  });

  it('uses a fresh IV every time, so identical input differs', () => {
    expect(encryptContent('same', DEK)).not.toBe(encryptContent('same', DEK));
  });

  it('rejects a payload too short to hold an IV and a tag', () => {
    expect(() =>
      decryptContent(Buffer.alloc(20).toString('base64'), DEK),
    ).toThrow(/expected at least 28 bytes/);
  });

  it('rejects a tampered payload rather than returning wrong plaintext', () => {
    // GCM authenticates; this is the property that makes the tag worth its
    // sixteen bytes.
    const packed = Buffer.from(encryptContent('hello', DEK), 'base64');
    packed[15] ^= 0xff;

    expect(() => decryptContent(packed.toString('base64'), DEK)).toThrow();
  });

  it('rejects the wrong key', () => {
    const otherDek = Buffer.alloc(32, 7);

    expect(() => decryptContent(VECTOR, otherDek)).toThrow();
  });
});
