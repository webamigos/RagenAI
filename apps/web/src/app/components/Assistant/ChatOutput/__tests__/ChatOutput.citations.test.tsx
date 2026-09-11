import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';
import assistantReducer from '@/store/assistant/assistantSlice';
import type { MessageDto } from '@/features/messages/contracts/message.types';

vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({ user: undefined }),
}));

// The logger picks its implementation with a bare `require` that webpack
// rewrites at build time; vitest has no such alias, so the real module
// cannot load here.
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { ChatOutput } from '../ChatOutput';

/**
 * The regression this file exists for: the sources block was written, tested
 * and merged into `MessageItem`, which nothing rendered. Everything below
 * passed while the feature was invisible in the product, so these assertions
 * go through `ChatOutput` — the component the chat screens actually mount.
 */

const answer: MessageDto = {
  id: 'm1',
  role: 'ASSISTANT',
  content: 'The limit is 50 MB [1]. Nothing says otherwise [9].',
  createdAt: new Date('2026-09-10T08:00:00Z').toISOString(),
} as MessageDto;

const storeWithRetrieval = () =>
  configureStore({
    reducer: { assistant: assistantReducer, toolApprovals: () => ({}) },
    preloadedState: {
      assistant: {
        ...assistantReducer(undefined, { type: '@@INIT' }),
        retrievalByMessage: {
          m1: {
            sources: [{ fileId: 'a', fileName: 'umowa.pdf', chunkCount: 1 }],
            chunkCount: 2,
            durationMs: 90,
            citedFileIds: ['a'],
          },
        },
      },
    },
  });

const show = (store = storeWithRetrieval()) =>
  render(
    <Provider store={store}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChatOutput
          messages={[answer]}
          isLoading={false}
          loadingMessage=""
          streamedMessage={null}
        />
      </NextIntlClientProvider>
    </Provider>,
  );

describe('ChatOutput citations', () => {
  it('renders the sources block for an answer that has retrieval', () => {
    show();

    expect(screen.getByRole('region', { name: 'Sources' })).toBeInTheDocument();
    expect(screen.getByText('umowa.pdf')).toBeInTheDocument();
  });

  it('turns a valid marker into a chip pointing at its row', () => {
    const { container } = show();

    const chip = container.querySelector('.citation-chip');
    expect(chip).not.toBeNull();
    expect(chip).toHaveAttribute('href', '#ragen-source-m1-1');
    expect(chip).toHaveAttribute('aria-label', 'Source 1: umowa.pdf');

    const row = screen.getByText('umowa.pdf').closest('li');
    expect(row).toHaveAttribute('id', 'ragen-source-m1-1');
  });

  it('leaves a marker no source could answer for as text', () => {
    const { container } = show();

    expect(container.querySelectorAll('.citation-chip')).toHaveLength(1);
    expect(container.textContent).toContain('[9]');
  });

  it('renders no sources block, and no chips, without retrieval', () => {
    const store = configureStore({
      reducer: { assistant: assistantReducer, toolApprovals: () => ({}) },
    });
    const { container } = show(store);

    expect(screen.queryByRole('region', { name: 'Sources' })).toBeNull();
    expect(container.querySelectorAll('.citation-chip')).toHaveLength(0);
    // The marker stays readable rather than being stripped.
    expect(container.textContent).toContain('[1]');
  });
});
