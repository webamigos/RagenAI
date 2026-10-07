import { resolveApiSources } from './api-sources.js';

const retrieved = [
  { fileId: 'page-file', fileName: 'Leave policy' },
  { fileId: 'doc', fileName: 'handbook.pdf' },
];

describe('resolveApiSources', () => {
  it('ranks sources and leaves non-Brain files plain', async () => {
    const out = await resolveApiSources({
      sources: Promise.resolve(retrieved),
    });
    expect(out).toEqual([
      { fileId: 'page-file', fileName: 'Leave policy', rank: 1 },
      { fileId: 'doc', fileName: 'handbook.pdf', rank: 2 },
    ]);
  });

  it('adds the page title and readable sources to a published Brain page', async () => {
    const out = await resolveApiSources(
      { sources: Promise.resolve(retrieved) },
      () =>
        Promise.resolve({
          'page-file': {
            pageTitle: 'Leave policy',
            sources: [
              { fileName: 'a.pdf', documentId: 'secret-id', span: '§1' },
            ],
          },
        }),
    );
    expect(out[0].brain).toEqual({
      pageTitle: 'Leave policy',
      sources: [{ fileName: 'a.pdf', span: '§1' }],
    });
    // Internal ids stay inside.
    expect(JSON.stringify(out)).not.toContain('secret-id');
    expect(out[1]).not.toHaveProperty('brain');
  });

  it('gives the page and an empty list when no source is readable', async () => {
    const out = await resolveApiSources(
      { sources: Promise.resolve(retrieved) },
      () =>
        Promise.resolve({
          'page-file': { pageTitle: 'Leave policy', sources: [] },
        }),
    );
    expect(out[0].brain).toEqual({ pageTitle: 'Leave policy', sources: [] });
  });

  it('keeps the plain list when the Brain lookup fails, and skips it when there is nothing to look up', async () => {
    const lookup = vi.fn().mockRejectedValue(new Error('db down'));
    const out = await resolveApiSources(
      { sources: Promise.resolve(retrieved) },
      lookup,
    );
    expect(out).toHaveLength(2);
    expect(out[0]).not.toHaveProperty('brain');

    lookup.mockClear();
    await resolveApiSources({ sources: Promise.resolve([]) }, lookup);
    expect(lookup).not.toHaveBeenCalled();
  });

  it('returns an empty list when the sources themselves cannot be read', async () => {
    expect(
      await resolveApiSources({ sources: Promise.reject(new Error('x')) }),
    ).toEqual([]);
  });
});
