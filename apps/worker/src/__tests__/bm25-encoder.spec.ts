import { encode, tokenize, fnv1a32 } from '../services/bm25-encoder';

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

  it('returns empty array for empty or punctuation-only input', () => {
    expect(tokenize('')).toEqual([]);
    expect(tokenize('   ')).toEqual([]);
    expect(tokenize('...!?')).toEqual([]);
  });
});

describe('fnv1a32', () => {
  it('is deterministic', () => {
    expect(fnv1a32('hello')).toBe(fnv1a32('hello'));
  });

  it('matches known FNV-1a reference values', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
  });

  it('returns unsigned 32-bit integers', () => {
    const hash = fnv1a32('some token');
    expect(Number.isInteger(hash)).toBe(true);
    expect(hash).toBeGreaterThanOrEqual(0);
    expect(hash).toBeLessThan(2 ** 32);
  });
});

describe('encode', () => {
  it('returns an empty sparse vector for empty input', () => {
    expect(encode('')).toEqual({ indices: [], values: [] });
    expect(encode('   ')).toEqual({ indices: [], values: [] });
  });

  it('produces one (index, value) pair per unique token', () => {
    const result = encode('the cat sat on the mat');
    expect(result.indices).toHaveLength(5);
    expect(result.values).toHaveLength(5);
  });

  it('counts repeated tokens as term frequencies', () => {
    const result = encode('the the the cat');
    const theIdx = result.indices.indexOf(fnv1a32('the'));
    const catIdx = result.indices.indexOf(fnv1a32('cat'));
    expect(result.values[theIdx]).toBe(3);
    expect(result.values[catIdx]).toBe(1);
  });

  it('treats different case as the same term', () => {
    const result = encode('Faktura FAKTURA faktura');
    expect(result.indices).toHaveLength(1);
    expect(result.values).toEqual([3]);
  });

  it('produces stable indices across calls', () => {
    const a = encode('faktura vat');
    const b = encode('faktura vat');
    expect(a.indices.sort()).toEqual(b.indices.sort());
  });
});
