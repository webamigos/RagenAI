import { getFileType, getFileExtension } from './file-type.js';

describe('getFileType', () => {
  it.each([
    ['transcript.srt', 'SRT'],
    ['book.epub', 'EPUB'],
    ['report.pdf', 'PDF'],
    ['notes.md', 'TEXT'],
    ['notes.txt', 'TEXT'],
    ['photo.jpg', 'IMAGE'],
    ['photo.jpeg', 'IMAGE'],
    ['photo.png', 'IMAGE'],
    ['photo.webp', 'IMAGE'],
    ['photo.gif', 'IMAGE'],
    ['data.csv', 'CSV'],
    ['doc.docx', 'DOCX'],
    ['sheet.xlsx', 'XLSX'],
    ['sheet.xls', 'XLSX'],
    ['deck.pptx', 'PPTX'],
    ['deck.ppt', 'PPTX'],
  ])('maps %s to %s', (fileName, expected) => {
    expect(getFileType(fileName)).toBe(expected);
  });

  it('is case-insensitive', () => {
    expect(getFileType('REPORT.PDF')).toBe('PDF');
  });

  it('throws for an unrecognized extension', () => {
    expect(() => getFileType('archive.zip')).toThrow('Unknown file type');
  });
});

describe('getFileExtension', () => {
  it('returns the extension without the dot', () => {
    expect(getFileExtension('report.pdf')).toBe('pdf');
  });

  it('returns the last segment for a multi-dot filename', () => {
    expect(getFileExtension('my.report.final.pdf')).toBe('pdf');
  });

  it('returns the filename itself when there is no dot', () => {
    expect(getFileExtension('README')).toBe('README');
  });
});
