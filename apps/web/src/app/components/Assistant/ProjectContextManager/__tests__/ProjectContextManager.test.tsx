import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NextIntlClientProvider } from 'next-intl';

import en from '@/app/messages/en.json';
import pl from '@/app/messages/pl.json';

const { state } = vi.hoisted(() => ({
  state: {
    current: {
      assistant: {
        threadContext: {
          project: { id: 'p1', title: 'HR' },
          mentionedProject: null,
        } as Record<string, unknown> | null,
      },
    },
  },
}));

vi.mock('react-redux', () => ({
  useDispatch: () => vi.fn(),
  useSelector: (select: (s: unknown) => unknown) => select(state.current),
}));

vi.mock(
  '@/features/threads/services/commands/update-thread-context-command',
  () => ({ updateThreadContextCommand: vi.fn() }),
);

vi.mock('@/app/lib/utils/toast', () => ({
  statusToast: () => ({ successToast: vi.fn(), errorToast: vi.fn() }),
}));

import { ProjectContextManager } from '../ProjectContextManager';

function renderIn(locale: 'en' | 'pl') {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'en' ? en : pl}
    >
      <ProjectContextManager
        threadId="t1"
        availableProjects={[{ id: 'p1', title: 'HR' }]}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  state.current.assistant.threadContext = {
    project: { id: 'p1', title: 'HR' },
    mentionedProject: null,
  };
});

describe('ProjectContextManager', () => {
  // The selector read "Asystent: HR" on English pages: every string in it
  // was Polish, hard-coded.
  it('names the assistant in the reader’s language', () => {
    renderIn('en');
    expect(screen.getByText('Assistant: HR')).toBeInTheDocument();
    expect(screen.queryByText(/Asystent/)).not.toBeInTheDocument();
  });

  it('still says it in Polish on Polish pages', () => {
    renderIn('pl');
    expect(screen.getByText('Asystent: HR')).toBeInTheDocument();
  });

  it('labels the organization fallback when no assistant is set', () => {
    state.current.assistant.threadContext = {
      project: null,
      mentionedProject: null,
    };
    renderIn('en');
    expect(screen.getByText('Organization instructions')).toBeInTheDocument();
  });

  it('translates the open menu too', async () => {
    renderIn('en');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Organization defaults')).toBeInTheDocument();
    expect(
      screen.getByText("Thread's assistant (default)"),
    ).toBeInTheDocument();
  });
});
