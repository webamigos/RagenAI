import { describe, it, expect } from 'vitest';
import { encode, tokenize, fnv1a32 } from '../bm25-encoder';

describe('tokenize', () => {
  it('splits ASCII words and lowercases', () => {
    expect(tokenize('The Quick Brown Fox')).toEqual([
      'the',
      'quick',
      'brown',
      'fox',
    ]);
  });

  it('handles Polish diacritics without losing characters', () => {
    expect(tokenize('Łódź Kraków Żywiec')).toEqual([
      'łódź',
      'kraków',
      'żywiec',
    ]);
  });

  it('mixes Polish and English tokens', () => {
    expect(tokenize('Faktura VAT dla klienta')).toEqual([
      'faktura',
      'vat',
      'dla',
      'klienta',
    ]);
  });

  it('keeps alphanumeric tokens that start with a letter', () => {
    expect(tokenize('GPT4 Python3 abc123')).toEqual([
      'gpt4',
      'python3',
      'abc123',
    ]);
  });

  it('drops pure-numeric tokens and punctuation', () => {
    expect(tokenize('order 42, total: 199.99 PLN')).toEqual([
      'order',
      'total',
      'pln',
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('...!?')).toEqual([]);
  });

  it('normalizes visually-identical unicode forms (NFKC)', () => {
    // Full-width "A" (U+FF21) should normalize to ASCII "a"
    expect(tokenize('\uFF21BC')).toEqual(['abc']);
  });
});

describe('fnv1a32', () => {
  it('is deterministic for the same input', () => {
    expect(fnv1a32('hello')).toBe(fnv1a32('hello'));
    expect(fnv1a32('faktura')).toBe(fnv1a32('faktura'));
  });

  it('produces different hashes for different inputs', () => {
    expect(fnv1a32('hello')).not.toBe(fnv1a32('world'));
    expect(fnv1a32('faktura')).not.toBe(fnv1a32('faktury'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const hash = fnv1a32('some token');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });

  it('matches the known FNV-1a 32-bit hash for empty string', () => {
    // FNV-1a offset basis for empty input is 0x811c9dc5
    expect(fnv1a32('')).toBe(0x811c9dc5);
  });

  it('matches the known FNV-1a 32-bit hash for "a"', () => {
    // Reference value from the FNV spec
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });
});

describe('encode', () => {
  it('returns an empty sparse vector for empty input', () => {
    expect(encode('')).toEqual({ indices: [], values: [] });
    expect(encode('   ')).toEqual({ indices: [], values: [] });
  });

  it('produces one (index, value) pair per unique token', () => {
    const result = encode('the cat sat on the mat');
    // 5 unique tokens: the, cat, sat, on, mat
    expect(result.indices).toHaveLength(5);
    expect(result.values).toHaveLength(5);
  });

  it('counts repeated tokens as term frequencies', () => {
    const result = encode('the the the cat');
    const theIndex = result.indices.indexOf(fnv1a32('the'));
    const catIndex = result.indices.indexOf(fnv1a32('cat'));
    expect(theIndex).not.toBe(-1);
    expect(catIndex).not.toBe(-1);
    expect(result.values[theIndex]).toBe(3);
    expect(result.values[catIndex]).toBe(1);
  });

  it('uses stable hashes for indices across calls', () => {
    const a = encode('faktura VAT');
    const b = encode('faktura VAT');
    expect(a.indices.sort()).toEqual(b.indices.sort());
  });

  it('treats different case as the same term', () => {
    const a = encode('Faktura FAKTURA faktura');
    // Single unique term, frequency 3
    expect(a.indices).toHaveLength(1);
    expect(a.values).toEqual([3]);
  });

  it('handles long multilingual text without crashing', () => {
    const longText =
      'Lorem ipsum dolor sit amet '.repeat(1000) +
      'Faktura VAT dla klienta łódzkiego '.repeat(1000);
    const result = encode(longText);
    expect(result.indices.length).toBeGreaterThan(0);
    expect(result.indices.length).toBe(result.values.length);
  });

  it('indices and values arrays stay aligned', () => {
    const result = encode('one two three four five');
    expect(result.indices).toHaveLength(result.values.length);
  });
});
