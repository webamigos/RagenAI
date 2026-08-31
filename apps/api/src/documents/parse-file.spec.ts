import { parseFile } from './parse-file.js';

function makeFile(
  overrides: Partial<Express.Multer.File>,
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'file.txt',
    encoding: '7bit',
    mimetype: 'text/plain',
    size: 5,
    buffer: Buffer.from('hello'),
    ...overrides,
  } as Express.Multer.File;
}

describe('parseFile', () => {
  it('throws for an empty file', () => {
    expect(() => parseFile(makeFile({ size: 0 }))).toThrow('is empty');
  });

  it('decodes text-typed files (SRT/TEXT/CSV) as utf-8 strings', () => {
    const result = parseFile(
      makeFile({ originalname: 'notes.txt', buffer: Buffer.from('hello') }),
    );
    expect(result.content).toBe('hello');
    expect(result.fileType).toBe('TEXT');
    expect(result.fileExtension).toBe('txt');
  });

  it('passes through binary-typed files (PDF/DOCX/IMAGE) as a Buffer', () => {
    const buf = Buffer.from([0x25, 0x50, 0x44, 0x46]);
    const result = parseFile(
      makeFile({ originalname: 'report.pdf', buffer: buf, size: buf.length }),
    );
    expect(result.content).toBe(buf);
    expect(result.fileType).toBe('PDF');
  });

  it('throws for an unrecognized extension', () => {
    expect(() => parseFile(makeFile({ originalname: 'archive.zip' }))).toThrow(
      'Unknown file type',
    );
  });

  it('returns the original filename', () => {
    const result = parseFile(
      makeFile({ originalname: 'My Report.pdf', buffer: Buffer.from('x') }),
    );
    expect(result.fileName).toBe('My Report.pdf');
  });
});
