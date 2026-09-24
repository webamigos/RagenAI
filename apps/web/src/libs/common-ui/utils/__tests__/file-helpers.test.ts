import { describe, expect, it } from 'vitest';

import { getFileLabel } from '../file-helpers';

describe('getFileLabel', () => {
  it.each([
    ['Polityka_urlopowa_2026.pdf', 'PDF'],
    ['notes.md', 'MD'],
    ['archive.tar.gz', 'GZ'],
    ['Raport.XLSX', 'XLSX'],
  ])('tags %s by its extension', (name, label) => {
    expect(getFileLabel(name)).toBe(label);
  });

  it('tags a web page URL, not the tail of its domain', () => {
    expect(getFileLabel('https://example.pl/zwroty-i-reklamacje')).toBe('URL');
    expect(getFileLabel('http://docs.example.com/guide.html')).toBe('URL');
  });

  it('falls back to DOC when there is no extension', () => {
    expect(getFileLabel('README')).toBe('DOC');
    expect(getFileLabel('trailing.')).toBe('DOC');
  });

  it('falls back to DOC when the text after the dot is not an extension', () => {
    expect(getFileLabel('v1.2 draft/final notes')).toBe('DOC');
  });
});
