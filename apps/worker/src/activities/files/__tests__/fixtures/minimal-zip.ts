import { crc32 } from 'node:zlib';

/**
 * A real ZIP archive, built byte by byte with stored (uncompressed) entries.
 *
 * Enough of the format for `file-type` and `istextorbinary` to see what they
 * see in a Word or Excel file — local file headers, a central directory and
 * the end record — without a ZIP library in the worker's dependencies. The
 * fixtures are minimal on purpose: a test about *detection* should not depend
 * on a document a parser can open.
 *
 * Deliberately not named `*.test.ts`: vitest collects nothing here.
 */
export type ZipEntry = { name: string; content: string | Buffer };

export function buildZip(entries: ZipEntry[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8');
    const data =
      typeof entry.content === 'string'
        ? Buffer.from(entry.content, 'utf-8')
        : entry.content;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(0, 8); // method: stored
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0x21, 12); // mod date (1980-01-01)
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE(0, 38); // external attrs
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralSize = centrals.reduce((sum, b) => sum + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, end]);
}

const CONTENT_TYPES = (main: string) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/${main}"/></Types>`;

/** The smallest archives that are recognisably each format. */
export const MINIMAL_FILES: Record<'docx' | 'xlsx' | 'pptx' | 'epub', Buffer> =
  {
    docx: buildZip([
      { name: '[Content_Types].xml', content: CONTENT_TYPES('word/document.xml') },
      { name: 'word/document.xml', content: '<w:document>Hello</w:document>' },
    ]),
    xlsx: buildZip([
      { name: '[Content_Types].xml', content: CONTENT_TYPES('xl/workbook.xml') },
      { name: 'xl/workbook.xml', content: '<workbook/>' },
    ]),
    pptx: buildZip([
      {
        name: '[Content_Types].xml',
        content: CONTENT_TYPES('ppt/presentation.xml'),
      },
      { name: 'ppt/presentation.xml', content: '<p:presentation/>' },
    ]),
    epub: buildZip([
      { name: 'mimetype', content: 'application/epub+zip' },
      { name: 'META-INF/container.xml', content: '<container/>' },
    ]),
  };
