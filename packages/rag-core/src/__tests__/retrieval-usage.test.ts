import { describe, expect, it, vi } from 'vitest';
import {
  recordRetrievalUsage,
  selectCitedSources,
  type CitableSource,
  type RetrievalUsage,
} from '../retrieval-usage';

const source = (
  fileId: string,
  fileName: string,
  extra: Partial<CitableSource> = {},
): CitableSource => ({ fileId, fileName, ...extra });

function deps(
  overrides: Partial<Parameters<typeof recordRetrievalUsage>[2]> = {},
) {
  const written: RetrievalUsage[] = [];
  return {
    written,
    deps: {
      encryptSnippet: async (s: string) => `enc(${s})`,
      writeUsage: async (u: RetrievalUsage) => {
        written.push(u);
      },
      ...overrides,
    },
  };
}

describe('recordRetrievalUsage', () => {
  it('writes nothing when nothing was retrieved', async () => {
    const { written, deps: d } = deps();
    await recordRetrievalUsage([], 'answer', d);
    expect(written).toEqual([]);
  });

  it('ranks by position and records only the cited subset as cited', async () => {
    const { written, deps: d } = deps();
    await recordRetrievalUsage(
      [source('a', 'alpha-policy.pdf'), source('b', 'beta-policy.pdf')],
      'According to [2], the rule holds.',
      d,
    );
    expect(written[0].retrievals.map((r) => [r.fileId, r.rank])).toEqual([
      ['a', 1],
      ['b', 2],
    ]);
    expect(written[0].citedFileIds).toEqual(['b']);
  });

  it('encrypts snippets and leaves a missing one null', async () => {
    const { written, deps: d } = deps();
    await recordRetrievalUsage(
      [source('a', 'a.pdf', { snippet: 'quote' }), source('b', 'b.pdf')],
      '',
      d,
    );
    expect(written[0].retrievals.map((r) => r.snippet)).toEqual([
      'enc(quote)',
      null,
    ]);
  });

  it('stores null, never plaintext, when encryption fails, and says so', async () => {
    const onFail = vi.fn();
    const { written, deps: d } = deps({
      encryptSnippet: async () => {
        throw new Error('kms down');
      },
      onSnippetEncryptionFailed: onFail,
    });
    await recordRetrievalUsage(
      [source('a', 'a.pdf', { snippet: 'secret quote' })],
      '',
      d,
    );
    expect(written[0].retrievals[0].snippet).toBeNull();
    expect(onFail).toHaveBeenCalledTimes(1);
  });

  it('omits page and regions the parser did not give, rather than zeroing them', async () => {
    const { written, deps: d } = deps();
    await recordRetrievalUsage(
      [
        source('a', 'a.pdf'),
        source('b', 'b.pdf', {
          sourcePage: 3,
          sourceRegions: [{ page: 3, x: 0.1, y: 0.2, w: 0.3, h: 0.4 }],
        }),
      ],
      '',
      d,
    );
    expect('sourcePage' in written[0].retrievals[0]).toBe(false);
    expect('sourceRegions' in written[0].retrievals[0]).toBe(false);
    expect(written[0].retrievals[1].sourcePage).toBe(3);
    expect(written[0].retrievals[1].sourceRegions).toHaveLength(1);
  });
});

describe('selectCitedSources', () => {
  it('prefers markers over file names', () => {
    const retrieved = [
      source('a', 'alpha-policy.pdf'),
      source('b', 'beta.pdf'),
    ];
    expect(
      selectCitedSources(retrieved, 'See alpha-policy.pdf and [2].').map(
        (s) => s.fileId,
      ),
    ).toEqual(['b']);
  });

  it('falls back to a file name when no marker is present', () => {
    const retrieved = [source('a', 'alpha-policy.pdf')];
    expect(
      selectCitedSources(retrieved, "According to 'alpha-policy.pdf', yes."),
    ).toHaveLength(1);
  });
});
