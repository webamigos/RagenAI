import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { describe, expect, it } from 'vitest';

import { DiagnosticsBadge } from '../DiagnosticsBadge';
import { DiagnosticsPanel } from '../DiagnosticsPanel';
import en from '@/app/messages/en.json';
import pl from '@/app/messages/pl.json';
import { OrgFeaturesProvider } from '@/context/OrgFeaturesContext';
import { DEFAULT_FEATURES } from '@/features/subscriptions/contracts/features.types';

type Options = { enabled?: boolean; locale?: 'en' | 'pl' };

function renderWith(
  node: ReactNode,
  { enabled = true, locale = 'en' }: Options,
) {
  render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : pl}
      timeZone="Europe/Warsaw"
    >
      <OrgFeaturesProvider
        features={{ ...DEFAULT_FEATURES, documentDiagnostics: enabled }}
      >
        {node}
      </OrgFeaturesProvider>
    </NextIntlClientProvider>,
  );
}

const report = (findings: unknown[]) => ({
  diagnostics: {
    version: 1,
    computedAt: '2026-09-27T12:00:00.000Z',
    findings,
    stats: {
      chunkCount: 40,
      tableChunkCount: 6,
      medianChunkChars: 700,
      sectionPathShare: null,
      overlapShare: 0.2,
    },
  },
});

const MARKUP = { check: 'markup', severity: 'warn', detail: { chunks: 3 } };
const HEADERLESS = {
  check: 'table-without-header',
  severity: 'warn',
  detail: { chunks: 6, source: 'docling' },
};
const OVERLAP = {
  check: 'overlap-duplication',
  severity: 'info',
  detail: { share: 0.45 },
};

describe('DiagnosticsBadge', () => {
  it('names the first warning, and counts the rest', () => {
    renderWith(
      <DiagnosticsBadge metadata={report([HEADERLESS, MARKUP])} />,
      {},
    );
    const badge = screen.getByTestId('diagnostics-badge');
    // Ordered by the panel's check order, not by storage order.
    expect(badge).toHaveTextContent('Parsed as markup');
    expect(badge).toHaveTextContent('+1 more');
    expect(badge).toHaveAttribute(
      'title',
      'Parsed as markup · Table without headers',
    );
  });

  it('says nothing about information-only findings', () => {
    renderWith(<DiagnosticsBadge metadata={report([OVERLAP])} />, {});
    expect(screen.queryByTestId('diagnostics-badge')).not.toBeInTheDocument();
  });

  it.each([
    ['a file never checked', { summary: 'x' }],
    ['a run whose checks threw', { diagnostics: null }],
    ['no metadata', undefined],
  ])('shows nothing for %s — not a clean bill of health', (_, metadata) => {
    renderWith(<DiagnosticsBadge metadata={metadata} />, {});
    expect(screen.queryByTestId('diagnostics-badge')).not.toBeInTheDocument();
  });

  it('shows nothing with the key off, even with warnings stored', () => {
    renderWith(<DiagnosticsBadge metadata={report([MARKUP])} />, {
      enabled: false,
    });
    expect(screen.queryByTestId('diagnostics-badge')).not.toBeInTheDocument();
  });

  it('is worded in Polish too', () => {
    renderWith(<DiagnosticsBadge metadata={report([HEADERLESS])} />, {
      locale: 'pl',
    });
    expect(screen.getByTestId('diagnostics-badge')).toHaveTextContent(
      'Tabela bez nagłówków',
    );
  });
});

describe('DiagnosticsPanel', () => {
  it('lists every finding, warnings first, each with what to do', () => {
    renderWith(
      <DiagnosticsPanel metadata={report([OVERLAP, HEADERLESS, MARKUP])} />,
      {},
    );

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.dataset.testid)).toEqual([
      'diagnostic-markup',
      'diagnostic-table-without-header',
      'diagnostic-overlap-duplication',
    ]);
    expect(items[0]).toHaveTextContent('Needs attention');
    expect(items[0]).toHaveTextContent('Save it as PDF, DOCX or plain text');
    expect(items[0]).toHaveTextContent('Passages affected: 3 of 40');
    expect(items[2]).toHaveTextContent('For information');
    // A share, not a count of passages: no "affected" line.
    expect(items[2]).not.toHaveTextContent('Passages affected');
  });

  it('says when the checks ran', () => {
    renderWith(<DiagnosticsPanel metadata={report([MARKUP])} />, {});
    expect(screen.getByTestId('diagnostics-panel')).toHaveTextContent(
      /Checked .*2026/,
    );
  });

  it.each([
    ['the key is off', report([MARKUP]), false],
    ['the file was never checked', { summary: 'x' }, true],
    ['the checks threw', { diagnostics: null }, true],
    ['the checks found nothing', report([]), true],
  ])('renders nothing when %s', (_, metadata, enabled) => {
    renderWith(<DiagnosticsPanel metadata={metadata} />, { enabled });
    expect(screen.queryByTestId('diagnostics-panel')).not.toBeInTheDocument();
  });

  it('drops a finding from a newer worker instead of rendering its raw key', () => {
    renderWith(
      <DiagnosticsPanel
        metadata={report([
          { check: 'from-the-future', severity: 'warn' },
          MARKUP,
        ])}
      />,
      {},
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.queryByText(/from-the-future/)).not.toBeInTheDocument();
  });
});
