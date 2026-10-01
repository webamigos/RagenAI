import type { JobContext } from '@ragenai/jobs';
import { describe, expect, it, vi } from 'vitest';

import {
  createMockActivities,
  makeUserFile,
} from '../../__tests__/fixtures/mock-activities.js';
import { withFreeContextPrefix } from '../../services/context-prefix.js';
import type { Document } from '../../types/Document.js';
import { runFileEmbeddings } from '../parse-and-embed.js';

/**
 * `contextualChunks` (spec 2026-09-29-contextual-chunks, A2): with the key on,
 * body chunks reach `prepareMetadata` carrying the free prefix; the text of
 * every chunk is unchanged either way.
 */
const CHUNKS: Document[] = [
  {
    pageContent: 'Opłata wynosi 4%.',
    metadata: { sectionPath: '4. Wynagrodzenie' },
  },
  { pageContent: 'Bez sekcji.', metadata: {} },
];

function run(keyOn: boolean | 'throws') {
  const activities = createMockActivities();
  activities.loadText.mockResolvedValue([
    { pageContent: 'Opłata wynosi 4%. Bez sekcji.', metadata: {} },
  ]);
  activities.splitText.mockResolvedValue(CHUNKS);
  activities.generateDocumentSummary.mockResolvedValue(
    'Umowa serwisowa. Szczegóły.',
  );
  activities.checkMimeType.mockResolvedValue({
    mime: 'text/plain',
    ext: 'txt',
  });
  activities.getFileRecord.mockResolvedValue(
    makeUserFile({ fileName: 'umowa-serwisowa.txt' }),
  );
  // The activity reads the key; here it stands for each of its answers.
  if (keyOn === 'throws') {
    activities.applyContextPrefix.mockRejectedValue(new Error('step failed'));
  } else {
    activities.applyContextPrefix.mockImplementation(
      async ({
        docs,
        fileName,
        summary,
      }: {
        docs: Document[];
        fileName: string;
        summary?: string;
      }) => (keyOn ? withFreeContextPrefix(docs, { fileName, summary }) : docs),
    );
  }
  const ctx: JobContext = {
    runId: 'run-1',
    steps: <A>() => activities as unknown as A,
    log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    progress: vi.fn(),
    checkCancelled: vi.fn().mockResolvedValue(false),
  };
  return {
    activities,
    done: runFileEmbeddings({ fileId: 'f', orgId: 'o' }, ctx),
  };
}

const prepared = (activities: ReturnType<typeof createMockActivities>) =>
  (activities.prepareMetadata.mock.calls[0]![0] as { docs: Document[] }).docs;

describe('runFileEmbeddings — context prefix', () => {
  it('gives body chunks the free prefix when the key is on, and not the summary', async () => {
    const { activities, done } = run(true);
    await done;

    const docs = prepared(activities);
    expect(docs[0]!.metadata?.chunk_type).toBe('summary');
    expect(docs[0]!.metadata).not.toHaveProperty('contextPrefix');
    expect(docs[1]!.metadata).toMatchObject({
      contextPrefix: 'umowa serwisowa — 4. Wynagrodzenie. Umowa serwisowa.',
      contextVersion: 1,
    });
    expect(docs[2]!.metadata).toMatchObject({
      contextPrefix: 'umowa serwisowa. Umowa serwisowa.',
    });
    expect(docs.slice(1).map((d) => d.pageContent)).toEqual(
      CHUNKS.map((c) => c.pageContent),
    );
  });

  it('adds nothing when the key is off, which is the default', async () => {
    const { activities, done } = run(false);
    await done;

    expect(
      prepared(activities).some(
        (d) => d.metadata && 'contextPrefix' in d.metadata,
      ),
    ).toBe(false);
  });

  it('asks with the masked chunks, the file name and the summary', async () => {
    const { activities, done } = run(true);
    await done;

    expect(activities.applyContextPrefix).toHaveBeenCalledWith({
      orgId: 'o',
      docs: CHUNKS,
      fileName: 'umowa-serwisowa.txt',
      summary: 'Umowa serwisowa. Szczegóły.',
    });
  });

  it('indexes without a prefix when the step fails', async () => {
    const { activities, done } = run('throws');
    await done;

    expect(
      prepared(activities).some(
        (d) => d.metadata && 'contextPrefix' in d.metadata,
      ),
    ).toBe(false);
    expect(activities.addDocumentsToVectorStore).toHaveBeenCalled();
  });
});
