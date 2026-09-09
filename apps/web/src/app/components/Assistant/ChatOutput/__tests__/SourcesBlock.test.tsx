import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';

import { SourcesBlock } from '../SourcesBlock';
import messages from '@/app/messages/en.json';
import type { MessageRetrieval } from '@/store/assistant/assistantSlice';

const show = (retrieval: Partial<MessageRetrieval> = {}) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SourcesBlock
        retrieval={{
          sources: [{ fileId: 'a', fileName: 'umowa.pdf' }],
          chunkCount: 3,
          durationMs: 120,
          citedFileIds: [],
          ...retrieval,
        }}
      />
    </NextIntlClientProvider>,
  );

const row = (name: string) =>
  screen.getByText(name).closest('li') as HTMLElement;

describe('SourcesBlock', () => {
  it('reports documents, chunks and time, because none implies the others', () => {
    show({
      sources: [
        { fileId: 'a', fileName: 'umowa.pdf' },
        { fileId: 'b', fileName: 'regulamin.pdf' },
      ],
      chunkCount: 5,
      durationMs: 120,
    });

    const region = screen.getByRole('region', { name: 'Sources' });
    expect(region).toHaveTextContent('Searched 2 documents');
    expect(region).toHaveTextContent('5 chunks');
    expect(region).toHaveTextContent('120 ms');
  });

  it('says "1 document", not "1 documents"', () => {
    // The counts are ICU plurals. English only needs two forms and would have
    // survived a naive string; Polish needs four, and "Przeszukano 1
    // dokumentów" was what shipped in the first draft.
    show({ sources: [{ fileId: 'a', fileName: 'umowa.pdf' }], chunkCount: 1 });

    const region = screen.getByRole('region', { name: 'Sources' });
    expect(region).toHaveTextContent('Searched 1 document');
    expect(region).not.toHaveTextContent('1 documents');
    expect(region).toHaveTextContent('1 chunk');
    expect(region).not.toHaveTextContent('1 chunks');
  });

  it('lists what was retrieved, not only what was cited', () => {
    // A question that searched five documents and used none of them is a fact
    // about the knowledge base; showing only the cited ones would hide it.
    show({
      sources: [
        { fileId: 'a', fileName: 'umowa.pdf' },
        { fileId: 'b', fileName: 'regulamin.pdf' },
      ],
      citedFileIds: ['a'],
    });

    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(row('umowa.pdf')).toHaveAttribute('data-cited', 'true');
    expect(row('regulamin.pdf')).toHaveAttribute('data-cited', 'false');
  });

  it('marks a cited source with a word, not just a colour', () => {
    show({ citedFileIds: ['a'] });

    expect(within(row('umowa.pdf')).getByText('cited')).toBeInTheDocument();
  });

  it('marks neither of two identically named files', () => {
    // The decision in `attributable-citations.ts`, reaching the screen: a
    // missing mark is a smaller lie than one pointing at a document the answer
    // may never have drawn on.
    show({
      sources: [
        { fileId: 'a', fileName: 'umowa.pdf' },
        { fileId: 'b', fileName: 'umowa.pdf' },
      ],
      citedFileIds: ['a', 'b'],
    });

    expect(screen.queryByText('cited')).not.toBeInTheDocument();
    for (const item of screen.getAllByRole('listitem')) {
      expect(item).toHaveAttribute('data-cited', 'false');
    }
  });

  it('says so when retrieval ran and matched nothing', () => {
    // Only reachable when the knowledge base *was* searched — the event is
    // never sent otherwise — so this cannot stand in for "did not look".
    show({ sources: [], chunkCount: 0 });

    expect(
      screen.getByText('Nothing matched in your documents'),
    ).toBeInTheDocument();
  });

  it('still lists a chunk whose file name was never stored', () => {
    // Dropping it would make the document count disagree with the list.
    show({ sources: [{ fileId: 'legacy-id', fileName: null }] });

    expect(screen.getByText('legacy-id')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Sources' })).toHaveTextContent(
      'Searched 1 document',
    );
  });
});
