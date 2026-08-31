import { getFileExtension } from '../utils/get-file-extension';
import { SUPPORTED_MIME_TYPES } from '../utils/supported-mime-types';
import { CHUNK_SETTINGS } from '../utils/splitters';
import { FileType } from '../types/UserFile';

describe('getFileExtension', () => {
  it('extracts extension from simple filename', () => {
    expect(getFileExtension('document.pdf')).toBe('pdf');
  });

  it('extracts extension from filename with multiple dots', () => {
    expect(getFileExtension('my.file.name.epub')).toBe('epub');
  });

  it('returns empty string when no dot is present', () => {
    expect(getFileExtension('README')).toBe('');
  });

  it('returns empty string for dot-only prefix files', () => {
    expect(getFileExtension('.gitignore')).toBe('');
  });
});

describe('SUPPORTED_MIME_TYPES', () => {
  it('maps application/pdf to PDF', () => {
    expect(SUPPORTED_MIME_TYPES['application/pdf']).toBe(FileType.PDF);
  });

  it('maps application/epub+zip to EPUB', () => {
    expect(SUPPORTED_MIME_TYPES['application/epub+zip']).toBe(FileType.EPUB);
  });

  it('maps text/markdown to MARKDOWN', () => {
    expect(SUPPORTED_MIME_TYPES['text/markdown']).toBe(FileType.MARKDOWN);
  });

  it('maps text/plain to TEXT', () => {
    expect(SUPPORTED_MIME_TYPES['text/plain']).toBe(FileType.TEXT);
  });

  it('maps application/x-subrip to SRT', () => {
    expect(SUPPORTED_MIME_TYPES['application/x-subrip']).toBe(FileType.SRT);
  });

  it('maps text/url to URL', () => {
    expect(SUPPORTED_MIME_TYPES['text/url']).toBe(FileType.URL);
  });

  it('maps image types to IMAGE', () => {
    expect(SUPPORTED_MIME_TYPES['image/png']).toBe(FileType.IMAGE);
    expect(SUPPORTED_MIME_TYPES['image/jpeg']).toBe(FileType.IMAGE);
  });

  it('maps spreadsheet types', () => {
    expect(SUPPORTED_MIME_TYPES['text/csv']).toBe(FileType.CSV);
    expect(
      SUPPORTED_MIME_TYPES[
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
    ).toBe(FileType.XLSX);
  });

  it('maps DOCX type', () => {
    expect(
      SUPPORTED_MIME_TYPES[
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
    ).toBe(FileType.DOCX);
  });

  it('does not include unsupported types', () => {
    expect(SUPPORTED_MIME_TYPES['video/mp4']).toBeUndefined();
  });
});

describe('CHUNK_SETTINGS', () => {
  it('has settings for all FileType values', () => {
    const fileTypes = Object.values(FileType).filter(
      (v) => typeof v === 'string',
    );
    for (const ft of fileTypes) {
      expect(CHUNK_SETTINGS[ft as FileType]).toBeDefined();
      expect(CHUNK_SETTINGS[ft as FileType]).toHaveProperty('chunkSize');
      expect(CHUNK_SETTINGS[ft as FileType]).toHaveProperty('chunkOverlap');
    }
  });

  it('UNKNOWN has zero chunk settings', () => {
    expect(CHUNK_SETTINGS[FileType.UNKNOWN].chunkSize).toBe(0);
    expect(CHUNK_SETTINGS[FileType.UNKNOWN].chunkOverlap).toBe(0);
  });

  it('all non-UNKNOWN types have positive chunk sizes', () => {
    const fileTypes = Object.values(FileType).filter(
      (v) => typeof v === 'string' && v !== FileType.UNKNOWN,
    );
    for (const ft of fileTypes) {
      expect(CHUNK_SETTINGS[ft as FileType].chunkSize).toBeGreaterThan(0);
      expect(CHUNK_SETTINGS[ft as FileType].chunkOverlap).toBeGreaterThan(0);
    }
  });

  it('chunk overlap is always less than chunk size', () => {
    const fileTypes = Object.values(FileType).filter(
      (v) => typeof v === 'string' && v !== FileType.UNKNOWN,
    );
    for (const ft of fileTypes) {
      const settings = CHUNK_SETTINGS[ft as FileType];
      expect(settings.chunkOverlap).toBeLessThan(settings.chunkSize);
    }
  });
});
