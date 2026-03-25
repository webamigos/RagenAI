import { describe, it, expect } from 'vitest';
import {
  extractDriveFileId,
  isGoogleDriveUrl,
  extractDriveLinksFromText,
  getDriveFileTypeFromUrl,
} from '../google-drive-url';

describe('extractDriveFileId', () => {
  it('extracts ID from Google Docs document URL', () => {
    expect(
      extractDriveFileId(
        'https://docs.google.com/document/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit',
      ),
    ).toBe('1aBcDeFgHiJkLmNoPqRsTuVwXyZ');
  });

  it('extracts ID from Google Sheets URL', () => {
    expect(
      extractDriveFileId(
        'https://docs.google.com/spreadsheets/d/abc123_-def/edit#gid=0',
      ),
    ).toBe('abc123_-def');
  });

  it('extracts ID from Google Slides URL', () => {
    expect(
      extractDriveFileId(
        'https://docs.google.com/presentation/d/slideId123/edit',
      ),
    ).toBe('slideId123');
  });

  it('extracts ID from Drive file URL', () => {
    expect(
      extractDriveFileId('https://drive.google.com/file/d/fileId456/view'),
    ).toBe('fileId456');
  });

  it('extracts ID from Drive open URL', () => {
    expect(
      extractDriveFileId('https://drive.google.com/open?id=openId789'),
    ).toBe('openId789');
  });

  it('extracts ID from URL with account selector (/u/0/)', () => {
    expect(
      extractDriveFileId(
        'https://docs.google.com/document/u/0/d/acctFileId/edit',
      ),
    ).toBe('acctFileId');
  });

  it('extracts ID from Drive open URL with account selector', () => {
    expect(
      extractDriveFileId('https://drive.google.com/u/0/open?id=acctOpenId'),
    ).toBe('acctOpenId');
  });

  it('returns null for non-Google URLs', () => {
    expect(extractDriveFileId('https://example.com/file/d/123')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractDriveFileId('')).toBeNull();
  });

  it('returns null for malformed Google URL', () => {
    expect(
      extractDriveFileId('https://docs.google.com/unknown/d/123'),
    ).toBeNull();
  });
});

describe('isGoogleDriveUrl', () => {
  it('returns true for valid Google Drive URLs', () => {
    expect(
      isGoogleDriveUrl('https://docs.google.com/document/d/abc123/edit'),
    ).toBe(true);
    expect(isGoogleDriveUrl('https://drive.google.com/file/d/xyz/view')).toBe(
      true,
    );
  });

  it('returns false for non-Google URLs', () => {
    expect(isGoogleDriveUrl('https://example.com')).toBe(false);
    expect(isGoogleDriveUrl('not a url')).toBe(false);
  });
});

describe('extractDriveLinksFromText', () => {
  it('extracts single link from text', () => {
    const text =
      'Check this doc: https://docs.google.com/document/d/fileA/edit';
    const result = extractDriveLinksFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('fileA');
    expect(result[0].url).toContain('docs.google.com');
  });

  it('extracts multiple links from text', () => {
    const text = `
      Doc: https://docs.google.com/document/d/doc1/edit
      Sheet: https://docs.google.com/spreadsheets/d/sheet1/edit
      File: https://drive.google.com/file/d/file1/view
    `;
    const result = extractDriveLinksFromText(text);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.fileId)).toEqual(['doc1', 'sheet1', 'file1']);
  });

  it('returns empty array when no Google links are present', () => {
    expect(extractDriveLinksFromText('Hello world')).toEqual([]);
    expect(extractDriveLinksFromText('Visit https://example.com')).toEqual([]);
  });

  it('returns empty array for empty string', () => {
    expect(extractDriveLinksFromText('')).toEqual([]);
  });

  it('ignores non-Google URLs mixed with Google ones', () => {
    const text =
      'See https://example.com and https://docs.google.com/document/d/abc/edit';
    const result = extractDriveLinksFromText(text);
    expect(result).toHaveLength(1);
    expect(result[0].fileId).toBe('abc');
  });
});

describe('getDriveFileTypeFromUrl', () => {
  it('returns DOC for Google Docs URLs', () => {
    expect(
      getDriveFileTypeFromUrl('https://docs.google.com/document/d/abc/edit'),
    ).toBe('DOC');
  });

  it('returns SHEET for Google Sheets URLs', () => {
    expect(
      getDriveFileTypeFromUrl(
        'https://docs.google.com/spreadsheets/d/abc/edit',
      ),
    ).toBe('SHEET');
  });

  it('returns SLIDES for Google Slides URLs', () => {
    expect(
      getDriveFileTypeFromUrl(
        'https://docs.google.com/presentation/d/abc/edit',
      ),
    ).toBe('SLIDES');
  });

  it('returns FILE for Drive file URLs', () => {
    expect(
      getDriveFileTypeFromUrl('https://drive.google.com/file/d/abc/view'),
    ).toBe('FILE');
  });

  it('returns FILE for unrecognized URLs', () => {
    expect(getDriveFileTypeFromUrl('https://example.com')).toBe('FILE');
  });
});
