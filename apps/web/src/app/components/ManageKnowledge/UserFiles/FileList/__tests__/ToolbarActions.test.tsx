import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';

import { ToolbarActions } from '../ToolbarActions';
import messages from '@/app/messages/en.json';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

function show(props: Partial<React.ComponentProps<typeof ToolbarActions>>) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ToolbarActions
        fileId="file-1"
        fileName="umowa.pdf"
        toggleModal={vi.fn()}
        isLoading={false}
        {...props}
      />
    </NextIntlClientProvider>,
  );
}

const deleteLabel = messages['files-table'].delete;

describe('ToolbarActions', () => {
  it('names the menu after the file, in the reader’s language', () => {
    // It said "Actions" in every locale, and the same for every row.
    show({});

    expect(
      screen.getByRole('button', { name: 'Actions for umowa.pdf' }),
    ).toBeInTheDocument();
  });

  it('offers delete by default', async () => {
    show({});
    await userEvent.click(screen.getByRole('button', { name: /Actions for/ }));

    expect(
      await screen.findByRole('menuitem', { name: deleteLabel }),
    ).toBeInTheDocument();
  });

  it('offers no delete where documents may not be removed', async () => {
    show({ canDelete: false });
    await userEvent.click(screen.getByRole('button', { name: /Actions for/ }));

    // The menu is open — it still has its other items.
    expect(await screen.findAllByRole('menuitem')).not.toHaveLength(0);
    expect(
      screen.queryByRole('menuitem', { name: deleteLabel }),
    ).not.toBeInTheDocument();
  });

  // Spec D3: a document is scored by "Analyse" in its Optimize tab. The menu
  // offers no "Score for RAG" for any file, whatever the organization's key.
  describe('Score and Optimize', () => {
    // Its copy is gone with it; the pattern covers both languages it had.
    const scoreLabel = /Score for RAG|Oceń dla RAG/i;
    const optimizeLabel = messages['files-table']['optimize-rag'];

    function showFor(fileType: string, metadata?: unknown) {
      render(
        <NextIntlClientProvider locale="en" messages={messages}>
          <OrgFeaturesProvider
            features={{ ...DEFAULT_FEATURES, ragReadinessScore: true }}
          >
            <ToolbarActions
              fileId="file-1"
              documentId="doc-1"
              fileName="cennik"
              fileType={fileType}
              metadata={metadata}
              toggleModal={vi.fn()}
              isLoading={false}
            />
          </OrgFeaturesProvider>
        </NextIntlClientProvider>,
      );
    }

    async function openMenu() {
      await userEvent.click(
        screen.getByRole('button', { name: /Actions for/ }),
      );
      expect(await screen.findAllByRole('menuitem')).not.toHaveLength(0);
    }

    it.each(['PDF', 'DOCX', 'XLSX', 'IMAGE'])(
      'offers no Score for RAG for %s',
      async (fileType) => {
        showFor(fileType);
        await openMenu();
        expect(
          screen.queryByRole('menuitem', { name: scoreLabel }),
        ).not.toBeInTheDocument();
      },
    );

    it('offers Optimize for prose', async () => {
      showFor('PDF');
      await openMenu();
      expect(
        screen.getByRole('menuitem', { name: optimizeLabel }),
      ).toBeInTheDocument();
    });

    // Q4, D2: Optimize is a prose tool.
    it.each(['XLSX', 'CSV', 'IMAGE'])(
      'offers no Optimize for %s',
      async (fileType) => {
        showFor(fileType);
        await openMenu();
        expect(
          screen.queryByRole('menuitem', { name: optimizeLabel }),
        ).not.toBeInTheDocument();
      },
    );

    it('offers no Optimize for a PDF that is mostly table chunks', async () => {
      showFor('PDF', {
        diagnostics: {
          version: 1,
          computedAt: '2026-09-27T12:00:00.000Z',
          findings: [],
          stats: {
            chunkCount: 7,
            tableChunkCount: 6,
            medianChunkChars: 700,
            sectionPathShare: null,
            overlapShare: 0,
          },
        },
      });
      await openMenu();
      expect(
        screen.queryByRole('menuitem', { name: optimizeLabel }),
      ).not.toBeInTheDocument();
    });
  });
});
