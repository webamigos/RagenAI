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
    expect(findUndecodableText(`Caf\uFFFD au lait. ${'a'.repeat(50)}`)).toBe(
      null,
    );
  });

  it('accepts a short chunk whose only flaw is one bad character', () => {
    // Over the ratio, under the count: still readable, so still shown.
    expect(findUndecodableText('Caf\uFFFD')).toBeNull();
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
    expect(findUndecodableText('\uFEFF%PDF-1.7\n%âãÏÓ\n1 0 obj')).toBe(
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

describe('findUndecodableText — raw markup', () => {
  /** A chunk of an .xlsx indexed as its worksheet XML, cut mid-tag both ends. */
  const WORKSHEET_CHUNK =
    'min="7" max="7" width="12.83" customWidth="1"/><col min="8" max="8" width="12.83" customWidth="1"/>' +
    '<col min="9" max="9" width="10" customWidth="1"/></cols><sheetData><row r="1" spans="1:5">' +
    '<c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" s="2"><v>2024</v></c></row>' +
    '<row r="2" spans="1:5"><c r="A2" t="s"><v>3</v></c><c r="B2"><v>1200.5</v></c></row>' +
    '</sheetData><pageMargins left="0.7" right="0.7" top="0.75" bott';

  it('refuses a chunk of OOXML worksheet XML', () => {
    // Clean ASCII: no replacement or control character to find. This is what
    // the demo quoted under an answer, for an .xlsx indexed before #1347.
    expect(findUndecodableText(WORKSHEET_CHUNK)).toBe('markup');
  });

  it('refuses a WordprocessingML body with its declaration and namespaces', () => {
    const text =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
      '<w:p w:rsidR="00A1"><w:pPr><w:jc w:val="left"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Umowa</w:t></w:r></w:p>'.repeat(
        6,
      ) +
      '</w:body></w:document>';
    expect(findUndecodableText(text)).toBe('markup');
  });

  it('accepts ordinary prose', () => {
    expect(
      findUndecodableText(
        'Trains must be booked in second class. Receipts go to finance within 14 days. '.repeat(
          20,
        ),
      ),
    ).toBeNull();
  });

  it('accepts Markdown with inline HTML — <br> in table cells, <sup>', () => {
    const text = [
      '| Term | Meaning |',
      '| --- | --- |',
      ...Array.from(
        { length: 12 },
        (_, i) =>
          `| Clause ${i}<sup>${i}</sup> | line one<br>line two<br/>line three |`,
      ),
    ].join('\n');
    expect(findUndecodableText(text)).toBeNull();
  });

  it('accepts a Docling HTML table of figures', () => {
    // Its tags outweigh its digits, and it is still a real table.
    const rows = Array.from(
      { length: 10 },
      (_, i) => `<tr><td>${i}</td><td>${i * 10}</td></tr>`,
    ).join('');
    expect(
      findUndecodableText(`<table><tbody>${rows}</tbody></table>`),
    ).toBeNull();
  });

  it('accepts a document about XML that quotes its elements', () => {
    const text =
      'In OOXML a worksheet begins with <cols>, where each <col min="1" max="1" width="12"/> sets one column. ' +
      'The <sheetData> element holds <row> elements, each with <c> cells and a <v> value. ' +
      'That is all you need to know to read one by hand, and most people never do. ';
    expect(findUndecodableText(text.repeat(3))).toBeNull();
  });

  it('accepts a short unfenced XML sample inside prose', () => {
    const text =
      'Add the dependency to your build file and rebuild the project:\n' +
      '<dependency><groupId>ai.ragen</groupId><artifactId>client</artifactId><version>1.2.0</version></dependency>\n' +
      'The client reads its endpoint from the environment, so nothing else needs to change. ' +
      'If the build fails, check that the repository is reachable from your network and that ' +
      'the version above is one that has been published.';
    expect(findUndecodableText(text)).toBeNull();
  });

  it('accepts a chunk that is mostly a fenced XML code sample', () => {
    // A README quoting a config file is prose about XML, not XML.
    const text =
      'Configure the logger:\n```xml\n' +
      '<configuration><appender name="STDOUT" class="ch.qos.logback.core.ConsoleAppender"><encoder><pattern>%d %msg%n</pattern></encoder></appender><root level="info"><appender-ref ref="STDOUT"/></root></configuration>\n'.repeat(
        4,
      ) +
      '```\n';
    expect(findUndecodableText(text)).toBeNull();
  });

  it('accepts a chunk cut inside a fenced code block', () => {
    const text =
      'Example:\n```xml\n' +
      '<col min="1" max="1" width="12" customWidth="1"/>\n'.repeat(12);
    expect(findUndecodableText(text)).toBeNull();
  });

  it('judges nothing on fewer tags than the floor', () => {
    // All markup, and still a reasonable thing for a tiny chunk to hold.
    expect(findUndecodableText('<a:b/><c:d/><e:f/>')).toBeNull();
  });
});

describe('isUndecodableText', () => {
  it('is the boolean form of the same test', () => {
    expect(isUndecodableText('plain')).toBe(false);
    expect(isUndecodableText('PK\u0003\u0004rest')).toBe(true);
  });
});
