import { describe, it, expect, vi } from 'vitest';
import { parseArgs, waitForIngest } from '../lib/runner';

const DEFAULT_DIR = '/repo/evals/rag-benchmark/corpora/kolej-bilingual-v1';

describe('parseArgs', () => {
  it('falls back to the bundled corpus and both arms', () => {
    expect(parseArgs([], DEFAULT_DIR)).toEqual({
      corpus: DEFAULT_DIR,
      arms: ['rag', 'no-rag'],
    });
  });

  it('takes a custom corpus directory', () => {
    expect(parseArgs(['--corpus', '/tmp/mine'], DEFAULT_DIR).corpus).toBe(
      '/tmp/mine',
    );
  });

  // `--corpus` with nothing after it is a typo, not a request for an empty
  // path: falling back beats loading `undefined` as a directory name.
  it('falls back when --corpus has no value', () => {
    expect(parseArgs(['--corpus'], DEFAULT_DIR).corpus).toBe(DEFAULT_DIR);
  });

  it('takes a single arm', () => {
    expect(parseArgs(['--arms', 'rag'], DEFAULT_DIR).arms).toEqual(['rag']);
  });

  it('tolerates spaces around the comma', () => {
    expect(parseArgs(['--arms', 'rag, no-rag'], DEFAULT_DIR).arms).toEqual([
      'rag',
      'no-rag',
    ]);
  });

  // Before this check a typo ran one arm and reported the other as an empty
  // column, which reads as a control that scored nothing rather than one that
  // never ran.
  it('rejects an unknown arm instead of casting it', () => {
    expect(() => parseArgs(['--arms', 'rag,norag'], DEFAULT_DIR)).toThrow(
      /unknown arm\(s\) norag/,
    );
  });

  it('rejects an arms list that is only separators', () => {
    expect(() => parseArgs(['--arms', ',,'], DEFAULT_DIR)).toThrow(
      /no arms given/,
    );
  });
});

/** Just enough of the client for `waitForIngest`, with a scripted poll queue. */
function prismaReturning(
  pages: {
    fileName: string;
    parsingStatus: string;
    embeddingStatus: string;
  }[][],
) {
  const findMany = vi.fn();
  for (const page of pages) {
    findMany.mockResolvedValueOnce(page);
  }
  // Anything past the script repeats the last page, so a timeout test does not
  // depend on how many times the loop happens to poll.
  findMany.mockResolvedValue(pages.at(-1) ?? []);
  return {
    prisma: { userFile: { findMany } } as never,
    findMany,
  };
}

const indexed = (fileName: string) => ({
  fileName,
  parsingStatus: 'COMPLETED',
  embeddingStatus: 'COMPLETED',
});
const pending = (fileName: string) => ({
  fileName,
  parsingStatus: 'COMPLETED',
  embeddingStatus: 'PENDING',
});

describe('waitForIngest', () => {
  it('returns once every uploaded id has finished embedding', async () => {
    const { prisma, findMany } = prismaReturning([
      [pending('a.md'), pending('b.md')],
      [indexed('a.md'), indexed('b.md')],
    ]);

    await expect(
      waitForIngest(prisma, ['id-a', 'id-b'], {
        timeoutMs: 1_000,
        pollMs: 1,
        log: () => {},
      }),
    ).resolves.toBeUndefined();

    // The query keys on the uploaded ids, never on the file names — a name
    // match would also see an earlier run's rows and declare them indexed.
    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['id-a', 'id-b'] } },
      select: { fileName: true, parsingStatus: true, embeddingStatus: true },
    });
  });

  it('throws naming the files whose ingestion failed', async () => {
    const { prisma } = prismaReturning([
      [
        indexed('a.md'),
        {
          fileName: 'b.md',
          parsingStatus: 'FAILED',
          embeddingStatus: 'QUEUED',
        },
      ],
    ]);

    await expect(
      waitForIngest(prisma, ['id-a', 'id-b'], {
        timeoutMs: 1_000,
        pollMs: 1,
        log: () => {},
      }),
    ).rejects.toThrow('Ingestion failed for: b.md');
  });

  it('times out with the last progress line it printed', async () => {
    const { prisma } = prismaReturning([[indexed('a.md'), pending('b.md')]]);

    await expect(
      waitForIngest(prisma, ['id-a', 'id-b'], {
        timeoutMs: 20,
        pollMs: 1,
        log: () => {},
      }),
    ).rejects.toThrow(
      'Ingestion did not finish in 0.02s (1/2 indexed, 0 failed)',
    );
  });

  it('logs each distinct progress line once', async () => {
    const { prisma } = prismaReturning([
      [pending('a.md'), pending('b.md')],
      [pending('a.md'), pending('b.md')],
      [indexed('a.md'), indexed('b.md')],
    ]);
    const log = vi.fn();

    await waitForIngest(prisma, ['id-a', 'id-b'], {
      timeoutMs: 1_000,
      pollMs: 1,
      log,
    });

    expect(log.mock.calls.map(([line]) => line)).toEqual([
      '  0/2 indexed, 0 failed',
      '  2/2 indexed, 0 failed',
    ]);
  });
});
