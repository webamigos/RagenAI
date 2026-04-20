import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';
import { ScoreDetailPanel } from '../ScoreDetailPanel';
import type { RagScore } from '@/features/documents/contracts/rag-score.types';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

// Headless UI Dialog requires ResizeObserver
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const messages = {
  'document-optimizer': {
    'score-detail-title': 'RAG Readiness Report',
    'score-chunk-structure': 'Chunk Structure',
    'score-avg-chunk-size': 'Avg Chunk Size',
    'score-entity-density': 'Entity Density',
    'score-self-containedness': 'Self-containedness',
    'score-qa-adherence': 'Q&A Adherence',
    'score-suggestions': 'Improvement Suggestions',
    'score-at': 'Scored at',
    rescore: 'Re-score',
    ok: 'OK',
  },
};

const mockScore: RagScore = {
  chunkStructure: 8,
  avgChunkSize: 7,
  entityDensity: 9,
  selfContainedness: 6,
  qaAdherence: 8,
  total: 77,
  suggestions: ['Add more contact info', 'Use numbered headings'],
};

function renderPanel(props: Partial<Parameters<typeof ScoreDetailPanel>[0]>) {
  const defaultProps = {
    open: true,
    onClose: vi.fn(),
    score: mockScore,
  };
  return render(
    <NextIntlClientProvider messages={messages} locale="en">
      <ScoreDetailPanel {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('ScoreDetailPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = renderPanel({ open: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('displays the overall score', () => {
    renderPanel({});
    expect(screen.getByText('77')).toBeTruthy();
    expect(screen.getByText('/100')).toBeTruthy();
  });

  it('displays all dimension labels and values', () => {
    renderPanel({});
    expect(screen.getByText('Chunk Structure')).toBeTruthy();
    expect(screen.getByText('Avg Chunk Size')).toBeTruthy();
    expect(screen.getByText('7/10')).toBeTruthy();
    expect(screen.getByText('Entity Density')).toBeTruthy();
    expect(screen.getByText('9/10')).toBeTruthy();
    expect(screen.getByText('Self-containedness')).toBeTruthy();
    expect(screen.getByText('6/10')).toBeTruthy();
    expect(screen.getByText('Q&A Adherence')).toBeTruthy();
    // 8/10 appears twice (chunkStructure and qaAdherence)
    expect(screen.getAllByText('8/10')).toHaveLength(2);
  });

  it('displays suggestions', () => {
    renderPanel({});
    expect(screen.getByText('Add more contact info')).toBeTruthy();
    expect(screen.getByText('Use numbered headings')).toBeTruthy();
  });

  it('calls onClose when OK button is clicked', async () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    await userEvent.click(screen.getByText('OK'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not render rescore button when onRescore is not provided', () => {
    renderPanel({});
    expect(screen.queryByText('Re-score')).toBeNull();
  });

  it('renders rescore button when onRescore is provided', () => {
    renderPanel({ onRescore: vi.fn() });
    expect(screen.getByText('Re-score')).toBeTruthy();
  });

  it('calls onRescore when rescore button is clicked', async () => {
    const onRescore = vi.fn();
    renderPanel({ onRescore });
    await userEvent.click(screen.getByText('Re-score'));
    expect(onRescore).toHaveBeenCalledOnce();
  });

  it('displays scored-at timestamp when provided', () => {
    renderPanel({ scoredAt: '2026-04-20T06:00:00.000Z' });
    expect(screen.getByText(/Scored at/)).toBeTruthy();
  });
});
