/**
 * The page count Docling actually reports, rather than one guessed from
 * character count.
 *
 * `pageCount` feeds usage limits, so the difference between "12 pages" and
 * "ceil(chars / 3000)" is the difference between charging for a document and
 * charging for its text density.
 */
const mockFetch = jest.fn();
global.fetch = mockFetch as unknown as typeof fetch;

jest.mock('fs/promises', () => ({
  readFile: jest.fn().mockResolvedValue(Buffer.from('pdf-bytes')),
}));
jest.mock('../logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { convertWithDocling } from '../docling-client';

const respond = (document: Record<string, unknown>) => {
  mockFetch.mockResolvedValue({
    ok: true,
    json: async () => ({ status: 'success', document, errors: [] }),
  });
};

const convert = () => convertWithDocling('/tmp/f.pdf', 'f.pdf');

beforeEach(() => {
  mockFetch.mockReset();
});

describe('convertWithDocling', () => {
  it('asks for the structured document as well as the markdown', async () => {
    // The page count lives only in the JSON; the markdown is one flat string
    // with no pagination in it.
    respond({ md_content: '# Hi', json_content: { pages: { '1': {} } } });

    await convert();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.options.to_formats).toEqual(['md', 'json']);
  });

  it('counts the pages the parser reported', async () => {
    respond({
      md_content: '# Hi',
      json_content: { pages: { '1': {}, '2': {}, '3': {} } },
    });

    await expect(convert()).resolves.toMatchObject({ pageCount: 3 });
  });

  it('reads json_content when it arrives as a string', async () => {
    // docling-serve sends an object in some versions and a JSON string in
    // others, and the difference is invisible until a page count is silently
    // null in production.
    respond({
      md_content: '# Hi',
      json_content: JSON.stringify({ pages: { '1': {}, '2': {} } }),
    });

    await expect(convert()).resolves.toMatchObject({ pageCount: 2 });
  });

  it('reports null for a format with no pages, not 1', async () => {
    // "This format has no pages" and "this document has one page" are
    // different answers. Only the first may fall back to an estimate.
    respond({ md_content: '# Hi', json_content: { pages: {} } });

    await expect(convert()).resolves.toMatchObject({ pageCount: null });
  });

  it('reports null when there is no structured document at all', async () => {
    respond({ md_content: '# Hi', json_content: null });

    await expect(convert()).resolves.toMatchObject({ pageCount: null });
  });

  it('does not fail a good conversion over malformed json', async () => {
    // The markdown is the part ingest cannot do without; a broken page count
    // costs an estimate, a thrown error costs the whole document.
    respond({ md_content: '# Hi', json_content: '{not json' });

    await expect(convert()).resolves.toEqual({
      markdown: '# Hi',
      pageCount: null,
    });
  });

  it('still refuses an empty conversion', async () => {
    respond({ md_content: '', json_content: { pages: { '1': {} } } });

    await expect(convert()).rejects.toThrow(/empty markdown/);
  });
});
