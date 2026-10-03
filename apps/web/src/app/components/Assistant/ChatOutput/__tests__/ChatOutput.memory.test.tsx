import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { NextIntlClientProvider } from 'next-intl';

import messages from '@/app/messages/en.json';
import assistantReducer from '@/store/assistant/assistantSlice';
import toolApprovalsReducer from '@/store/tool-approvals/toolApprovalsSlice';
import toolCallsReducer from '@/store/tool-calls/toolCallsSlice';
import type { MessageDto } from '@/features/messages/contracts/message.types';

vi.mock('@/app/hooks/use-auth', () => ({
  useUser: () => ({ user: undefined }),
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
const read = vi.hoisted(() => vi.fn());
vi.mock('../MemoryChanges/actions', () => ({
  getThreadMemoryChangesAction: read,
  undoMemoryChangeAction: vi.fn(),
}));

import { ChatOutput } from '../ChatOutput';

/**
 * Through `ChatOutput`, the component the chat screens mount, for the reason
 * `ChatOutput.citations.test.tsx` gives: a line tested only on its own can
 * pass while nothing renders it.
 */

const at = new Date('2026-10-01T08:00:00Z').toISOString();
const answers: MessageDto[] = [
  { id: 'm1', role: 'ASSISTANT', content: 'First answer.', createdAt: at },
  { id: 'm2', role: 'ASSISTANT', content: 'Second answer.', createdAt: at },
] as MessageDto[];

const show = (props: { isPublicAccess?: boolean; threadId?: string }) =>
  render(
    <Provider
      store={configureStore({
        reducer: {
          assistant: assistantReducer,
          toolApprovals: toolApprovalsReducer,
          toolCalls: toolCallsReducer,
        },
      })}
    >
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChatOutput
          messages={answers}
          isLoading={false}
          loadingMessage=""
          streamedMessage={null}
          {...props}
        />
      </NextIntlClientProvider>
    </Provider>,
  );

beforeEach(() => {
  read.mockReset();
  read.mockResolvedValue({
    m2: [
      {
        publicId: 'c1',
        operation: 'ADD',
        content: 'Prefers bullet points.',
        state: 'undoable',
      },
    ],
  });
});

describe('ChatOutput memory line', () => {
  it('shows a turn’s memory change under that answer, and only that one', async () => {
    show({ threadId: 't1' });

    const line = await screen.findByText('Remembered: Prefers bullet points.');
    expect(read).toHaveBeenCalledWith('t1');
    expect(line.closest('.group')?.textContent).toContain('Second answer.');
    expect(line.closest('.group')?.textContent).not.toContain('First answer.');
  });

  it('never reads or shows memory on a public or read-only surface', async () => {
    show({ threadId: 't1', isPublicAccess: true });

    await waitFor(() =>
      expect(screen.getByText('Second answer.')).toBeTruthy(),
    );
    expect(read).not.toHaveBeenCalled();
    expect(screen.queryByText(/Remembered:/)).toBeNull();
  });
});
