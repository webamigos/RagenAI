import { describe, it, expect } from 'vitest';
import {
  isSupportedFile,
  isTextFile,
  isValidFileSize,
  validateTextFile,
  processFileType,
} from '../fileValidation';

const createFile = (name: string, type: string, size: number = 100): File => {
  const blob = new Blob(['x'.repeat(size)], { type });
  return new File([blob], name, { type });
};

describe('isSupportedFile', () => {
  it.each([
    ['doc.md', 'text/markdown'],
    ['doc.md', 'application/octet-stream'],
    ['book.epub', 'application/epub+zip'],
    ['file.pdf', 'application/pdf'],
    ['subs.srt', 'application/x-subrip'],
  ])('returns true for supported file %s (%s)', (name, type) => {
    expect(isSupportedFile(createFile(name, type))).toBe(true);
  });

  it.each([
    ['photo.jpg', 'image/jpeg'],
    ['image.png', 'image/png'],
    ['pic.webp', 'image/webp'],
  ])('returns true for supported image file %s (%s)', (name, type) => {
    expect(isSupportedFile(createFile(name, type))).toBe(true);
  });

  it.each([
    ['data.json', 'application/json'],
    ['style.css', 'text/css'],
    ['script.js', 'application/javascript'],
  ])('returns false for unsupported file %s (%s)', (name, type) => {
    expect(isSupportedFile(createFile(name, type))).toBe(false);
  });
});

describe('isTextFile', () => {
  it.each([
    ['readme.md', 'text/markdown'],
    ['notes.txt', 'text/plain'],
    ['subs.srt', 'application/x-subrip'],
    ['readme.md', 'application/octet-stream'],
  ])('returns true for text file %s (%s)', (name, type) => {
    expect(isTextFile(createFile(name, type))).toBe(true);
  });

  it.each([
    ['file.pdf', 'application/pdf'],
    ['book.epub', 'application/epub+zip'],
    ['image.png', 'image/png'],
  ])('returns false for non-text file %s (%s)', (name, type) => {
    expect(isTextFile(createFile(name, type))).toBe(false);
  });
});

describe('isValidFileSize', () => {
  it('accepts file under 1MB by default', () => {
    expect(isValidFileSize(createFile('f.txt', 'text/plain', 500_000))).toBe(
      true,
    );
  });

  it('accepts file exactly at 1MB', () => {
    const oneMB = 1024 * 1024;
    expect(isValidFileSize(createFile('f.txt', 'text/plain', oneMB))).toBe(
      true,
    );
  });

  it('rejects file over 1MB', () => {
    const overOneMB = 1024 * 1024 + 1;
    expect(isValidFileSize(createFile('f.txt', 'text/plain', overOneMB))).toBe(
      false,
    );
  });

  it('respects custom maxSizeMB', () => {
    const twoMB = 2 * 1024 * 1024;
    expect(isValidFileSize(createFile('f.txt', 'text/plain', twoMB), 2)).toBe(
      true,
    );
    expect(
      isValidFileSize(createFile('f.txt', 'text/plain', twoMB + 1), 2),
    ).toBe(false);
  });
});

describe('validateTextFile', () => {
  it('returns valid for a small .txt file', () => {
    const result = validateTextFile(createFile('notes.txt', 'text/plain', 100));
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for a .md file', () => {
    const result = validateTextFile(
      createFile('readme.md', 'text/markdown', 100),
    );
    expect(result).toEqual({ valid: true });
  });

  it('returns valid for a .srt file', () => {
    const result = validateTextFile(
      createFile('subs.srt', 'application/x-subrip', 100),
    );
    expect(result).toEqual({ valid: true });
  });

  it('rejects unsupported file type with error message', () => {
    const result = validateTextFile(createFile('image.png', 'image/png', 100));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });

  it('rejects file over 1MB with error message', () => {
    const overOneMB = 1024 * 1024 + 1;
    const result = validateTextFile(
      createFile('big.txt', 'text/plain', overOneMB),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('too large');
  });

  it('rejects unsupported type before checking size', () => {
    const overOneMB = 1024 * 1024 + 1;
    const result = validateTextFile(
      createFile('big.png', 'image/png', overOneMB),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toContain('not supported');
  });
});

describe('processFileType', () => {
  it('converts .md file to text/markdown', () => {
    const file = createFile('readme.md', 'application/octet-stream');
    const processed = processFileType(file);
    expect(processed.type).toBe('text/markdown');
    expect(processed.name).toBe('readme.md');
  });

  it('converts .srt file to application/x-subrip', () => {
    const file = createFile('subs.srt', '');
    const processed = processFileType(file);
    expect(processed.type).toBe('application/x-subrip');
  });

  it('converts .txt file to text/plain', () => {
    const file = createFile('notes.txt', '');
    const processed = processFileType(file);
    expect(processed.type).toBe('text/plain');
  });

  it('returns file unchanged for other types', () => {
    const file = createFile('data.json', 'application/json');
    const processed = processFileType(file);
    expect(processed.type).toBe('application/json');
  });
});
