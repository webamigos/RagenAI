import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import { SourcesRail } from '../SourcesRail';
import messages from '@/app/messages/en.json';
import type { MessageRetrieval } from '@/store/assistant/assistantSlice';

const show = (
  retrieval: Partial<MessageRetrieval> = {},
  onClose: () => void = vi.fn(),
) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SourcesRail
        onClose={onClose}
        retrieval={{
          sources: [{ fileId: 'a', fileName: 'umowa.pdf', chunkCount: 1 }],
          chunkCount: 1,
          durationMs: 120,
          citedFileIds: [],
          ...retrieval,
        }}
      />
    </NextIntlClientProvider>,
  );

const card = (name: string) =>
  screen.getByText(name).closest('li') as HTMLElement;

describe('SourcesRail', () => {
  it('numbers the cards in rank order, the same numbers the answer cites', () => {
    show({
      sources: [
        { fileId: 'a', fileName: 'first.pdf', chunkCount: 1 },
        { fileId: 'b', fileName: 'second.pdf', chunkCount: 1 },
        { fileId: 'c', fileName: 'third.pdf', chunkCount: 1 },
      ],
    });

    expect(within(card('first.pdf')).getByText('1')).toBeInTheDocument();
    expect(within(card('second.pdf')).getByText('2')).toBeInTheDocument();
    expect(within(card('third.pdf')).getByText('3')).toBeInTheDocument();
  });

  /**
   * The rail's reason to exist. Every other field describes the file's best
   * chunk; these two say how deeply the file itself was read, and a document
   * that supplied six chunks was not consulted like one that supplied one.
   */
  it('says how many chunks the file contributed and which pages they came from', () => {
    show({
      sources: [
        {
          fileId: 'a',
          fileName: 'umowa.pdf',
          chunkCount: 3,
          pages: [2, 4, 9],
        },
      ],
    });

    expect(
      within(card('umowa.pdf')).getByText('3 chunks · pages 2, 4, 9'),
    ).toBeInTheDocument();
  });

  it('says the chunks and nothing about pages when the parser knew none', () => {
    show({
      sources: [{ fileId: 'a', fileName: 'notes.md', chunkCount: 6 }],
    });

    const text = card('notes.md').textContent ?? '';
    expect(text).toContain('6 chunks');
    expect(text).not.toContain('page');
  });

  /**
   * A page value that is not a page never reaches the reader. The chain
   * already filters these, and this is the second gate: the value arrives over
   * the network, and a component should not print a number it cannot justify
   * because something upstream promised not to send one.
   */
  it('drops a page that is not a whole page', () => {
    show({
      sources: [
        { fileId: 'a', fileName: 'umowa.pdf', chunkCount: 2, pages: [0, 7] },
      ],
    });

    // Singular, because the plural follows the list that survived the filter
    // rather than the one that arrived. "pages 7" would be a second small lie
    // told by the same value.
    expect(
      within(card('umowa.pdf')).getByText('2 chunks · page 7'),
    ).toBeInTheDocument();
  });

  describe('the relevance bar', () => {
    /**
     * The distinction a later change is most likely to erase. Reranking is
     * opt-in, so a default installation measures nothing — and an empty bar
     * reads as "this document scored zero", which is a claim about the
     * document where the truth is a fact about the deployment.
     */
    it('draws no bar when the score was never taken', () => {
      show({
        sources: [{ fileId: 'a', fileName: 'umowa.pdf', chunkCount: 1 }],
      });

      expect(
        within(card('umowa.pdf')).queryByText(/%/),
      ).not.toBeInTheDocument();
    });

    it('draws a bar for a zero score, because zero is a measurement', () => {
      show({
        sources: [
          {
            fileId: 'a',
            fileName: 'umowa.pdf',
            chunkCount: 1,
            relevanceScore: 0,
          },
        ],
      });

      expect(within(card('umowa.pdf')).getByText('0%')).toBeInTheDocument();
    });

    it('renders the score as a percentage', () => {
      show({
        sources: [
          {
            fileId: 'a',
            fileName: 'umowa.pdf',
            chunkCount: 1,
            relevanceScore: 0.86,
          },
        ],
      });

      expect(within(card('umowa.pdf')).getByText('86%')).toBeInTheDocument();
    });
  });

  it('marks the documents the answer cited', () => {
    show({
      sources: [
        { fileId: 'a', fileName: 'used.pdf', chunkCount: 1 },
        { fileId: 'b', fileName: 'unused.pdf', chunkCount: 1 },
      ],
      citedFileIds: ['a'],
    });

    expect(within(card('used.pdf')).getByText('cited')).toBeInTheDocument();
    expect(
      within(card('unused.pdf')).queryByText('cited'),
    ).not.toBeInTheDocument();
  });

  /**
   * Two retrieved files with one name: the model cited by name, and showing
   * both would tell the reader an answer came from a document it may never
   * have drawn on. The rule lives in `attributableCitations`; this asserts the
   * rail actually asks it rather than reading `citedFileIds` directly.
   */
  it('marks neither when the cited name matches two retrieved files', () => {
    show({
      sources: [
        { fileId: 'a', fileName: 'umowa.pdf', chunkCount: 1 },
        { fileId: 'b', fileName: 'umowa.pdf', chunkCount: 1 },
      ],
      citedFileIds: ['a', 'b'],
    });

    expect(screen.queryByText('cited')).not.toBeInTheDocument();
  });

  it('says so when retrieval ran and matched nothing', () => {
    show({ sources: [], chunkCount: 0 });

    expect(
      screen.getByText('Nothing matched in your documents'),
    ).toBeInTheDocument();
  });

  it('counts the documents in its header', () => {
    show({
      sources: [
        { fileId: 'a', fileName: 'one.pdf', chunkCount: 1 },
        { fileId: 'b', fileName: 'two.pdf', chunkCount: 1 },
      ],
    });

    expect(screen.getByText('2 documents')).toBeInTheDocument();
  });

  it('closes on the close button', async () => {
    const onClose = vi.fn();
    show({}, onClose);

    await userEvent.click(
      screen.getByRole('button', { name: 'Close sources' }),
    );

    expect(onClose).toHaveBeenCalledOnce();
  });

  /**
   * A chunk ingested before file names were stored has none. It is still
   * listed: it was retrieved, and dropping it would make the header's count
   * disagree with the cards below it.
   */
  it('falls back to the id for a source with no name', () => {
    show({
      sources: [{ fileId: 'file-legacy', fileName: null, chunkCount: 1 }],
    });

    expect(screen.getByText('file-legacy')).toBeInTheDocument();
  });
});
