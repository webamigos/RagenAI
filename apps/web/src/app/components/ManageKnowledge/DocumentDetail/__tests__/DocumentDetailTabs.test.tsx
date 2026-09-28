import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/app/messages/en.json';

const searchParams = vi.hoisted(() => ({ tab: null as string | null }));

vi.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: () => searchParams.tab }),
}));
// Both fetch on mount; what is under test is which tabs exist.
vi.mock('../VersionHistoryTab', () => ({
  VersionHistoryTab: () => <div data-testid="history-tab" />,
}));
vi.mock('../OptimizeTab', () => ({
  OptimizeTab: () => <div data-testid="optimize-tab" />,
}));

import { DocumentDetailTabs } from '../DocumentDetailTabs';

const t = messages['document-versions'];

function show(fileType: string | null, diagnostics?: unknown) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <DocumentDetailTabs
        doc={{
          id: 'doc-1',
          title: 'Cennik',
          content: '| A | 4.20 |',
          file: fileType ? { fileType } : null,
          diagnostics,
        }}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  searchParams.tab = null;
});

describe('DocumentDetailTabs — Optimize (spec Q4, D2)', () => {
  it.each(['XLSX', 'CSV', 'IMAGE'])('has no Optimize tab for %s', (type) => {
    show(type);
    expect(screen.getByRole('tab', { name: t['tab-content'] })).toBeVisible();
    expect(
      screen.queryByRole('tab', { name: t['tab-optimize'] }),
    ).not.toBeInTheDocument();
  });

  it('opens the content, not a missing tab, from an old ?tab=optimize link', () => {
    searchParams.tab = 'optimize';
    show('XLSX');
    expect(screen.queryByTestId('optimize-tab')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: t['tab-content'] })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it.each(['PDF', null])('keeps the Optimize tab for prose (%s)', (type) => {
    searchParams.tab = 'optimize';
    show(type);
    expect(screen.getByTestId('optimize-tab')).toBeInTheDocument();
  });

  it('has no Optimize tab for a PDF that is mostly table chunks', () => {
    searchParams.tab = 'optimize';
    show(
      'PDF',
      {
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
      }.diagnostics,
    );
    expect(screen.queryByTestId('optimize-tab')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('tab', { name: t['tab-optimize'] }),
    ).not.toBeInTheDocument();
  });
});
