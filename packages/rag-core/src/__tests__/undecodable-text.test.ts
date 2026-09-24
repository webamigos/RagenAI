import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { findUndecodableText, isUndecodableText } from '../index';

/** Bytes read the way `readFile(path, 'utf-8')` reads them. */
const asUtf8 = (bytes: Uint8Array) => Buffer.from(bytes).toString('utf-8');

/**
 * Deterministic pseudo-random bytes (xorshift32), standing in for compressed
 * data — which is what the body of a ZIP entry is.
 */
function noise(length: number, seed = 0x9e3779b9): Uint8Array {
  const out = new Uint8Array(length);
  let x = seed;
  for (let i = 0; i < length; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

describe('findUndecodableText', () => {
  it('accepts ordinary prose, in more than one script', () => {
    const text =
      'Zażółć gęślą jaźń. The quick brown fox — ∑ x² — jumps. 日本語のテキスト。\n\tIndented line.\r\n';
    expect(findUndecodableText(text.repeat(20))).toBeNull();
  });

  it('accepts an empty string', () => {
    expect(findUndecodableText('')).toBeNull();
  });

  it('accepts a long text with a single mis-encoded character', () => {
    expect(findUndecodableText(`Caf� au lait. ${'a'.repeat(50)}`)).toBe(
      null,
    );
  });

  it('accepts a short chunk whose only flaw is one bad character', () => {
    // Over the ratio, under the count: still readable, so still shown.
    expect(findUndecodableText('Caf�')).toBeNull();
  });

  it('refuses the bytes of a real ZIP read as UTF-8', () => {
    // A stored-then-deflated entry, the shape of every DOCX/XLSX/PPTX part.
    const body = deflateRawSync(
      Buffer.from('<w:document>'.repeat(200) + asUtf8(noise(2000))),
    );
    const header = Buffer.from([
      0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00, 0x08, 0x00,
    ]);
    const zipText = asUtf8(Buffer.concat([header, body]));

    expect(findUndecodableText(zipText)).toBe('container-signature');
  });

  it('refuses a PDF read as text, even behind a BOM', () => {
    expect(findUndecodableText('﻿%PDF-1.7\n%âãÏÓ\n1 0 obj')).toBe(
      'container-signature',
    );
  });

  it('refuses binary read as UTF-8 without a signature — a chunk from the middle', () => {
    // What a chunk after the first one looks like: no header, all body.
    const text = asUtf8(noise(4000));
    expect(text.startsWith('PK')).toBe(false);
    expect(findUndecodableText(text)).toBe('replacement-characters');
  });

  it('refuses text that is mostly control characters', () => {
    // UTF-16LE read as UTF-8: every other byte is NUL, none is invalid.
    const text = Buffer.from('Hello world, plain text.', 'utf16le').toString(
      'utf-8',
    );
    expect(findUndecodableText(text)).toBe('control-characters');
  });

  it('does not count tab, line feed and carriage return as control characters', () => {
    expect(findUndecodableText('a\tb\nc\r\n'.repeat(100))).toBeNull();
  });

  it('does not mistake prose that mentions a signature for one', () => {
    expect(findUndecodableText('The file began with %PDF-1.4.')).toBeNull();
  });
});

describe('isUndecodableText', () => {
  it('is the boolean form of the same test', () => {
    expect(isUndecodableText('plain')).toBe(false);
    expect(isUndecodableText('PK\u0003\u0004rest')).toBe(true);
  });
});
