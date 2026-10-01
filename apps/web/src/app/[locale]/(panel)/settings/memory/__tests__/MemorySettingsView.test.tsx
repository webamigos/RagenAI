import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/app/messages/en.json';

const a = vi.hoisted(() => ({
  update: vi.fn(),
  remove: vi.fn(),
  forget: vi.fn(),
  setExtraction: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('../actions', () => ({
  updateMemoryAction: (...x: unknown[]) => a.update(...x),
  deleteMemoryAction: (...x: unknown[]) => a.remove(...x),
  forgetAllMemoriesAction: () => a.forget(),
  setMemoryExtractionAction: (...x: unknown[]) => a.setExtraction(...x),
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: a.refresh }),
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('sonner', () => ({ toast: { success: a.success, error: a.error } }));

import { MemorySettingsView } from '../MemorySettingsView';
import type { MemoryPageData } from '../actions';

const ID = '2c1f4e5a-7b8c-4d9e-a0b1-c2d3e4f5a6b7';
const memory = {
  publicId: ID,
  content: 'Prefers answers as bullet points.',
  sourceThread: { id: 't-1', title: 'Quarterly plan' },
  expiresAt: null,
  createdAt: new Date('2026-10-01'),
  updatedAt: new Date('2026-10-01'),
};
const base: MemoryPageData = {
  enabled: true,
  memories: [memory],
  listUnavailable: false,
  storedCount: 1,
  maxEntries: 50,
  extractionEnabled: true,
};

function renderView(data: MemoryPageData) {
  return render(
    <NextIntlClientProvider messages={en} locale="en">
      <MemorySettingsView data={data} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [a.update, a.remove, a.forget, a.setExtraction]) {
    fn.mockResolvedValue({ success: true });
  }
});

describe('MemorySettingsView', () => {
  it('lists each memory with the thread it came from', () => {
    renderView(base);
    expect(
      screen.getByText('Prefers answers as bullet points.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'From Quarterly plan' }),
    ).toHaveAttribute('href', '/chats/t-1');
    expect(screen.getByText('1 memory of 50')).toBeInTheDocument();
  });

  it('shows the empty state when nothing is remembered', () => {
    renderView({ ...base, memories: [], storedCount: 0 });
    expect(screen.getByText(/Nothing remembered yet/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Forget everything' }),
    ).toBeNull();
  });

  it('edits a memory and saves the trimmed text', async () => {
    renderView(base);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Edit memory' }), {
      target: { value: '  Is the CFO.  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(a.update).toHaveBeenCalledWith(ID, 'Is the CFO.'),
    );
    await waitFor(() =>
      expect(a.success).toHaveBeenCalledWith('Memory updated.'),
    );
    expect(a.refresh).toHaveBeenCalled();
  });

  it('deletes only after confirming', async () => {
    renderView(base);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(a.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(a.remove).toHaveBeenCalledWith(ID));
  });

  it('turns extraction off from the switch', async () => {
    renderView(base);
    fireEvent.click(
      screen.getByRole('switch', {
        name: 'Remember what I tell chat about myself',
      }),
    );
    await waitFor(() => expect(a.setExtraction).toHaveBeenCalledWith(false));
  });

  it('says a memory that is gone is gone', async () => {
    a.remove.mockResolvedValue({ success: false, error: 'not_found' });
    renderView(base);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() =>
      expect(a.error).toHaveBeenCalledWith(
        'That memory no longer exists. Reload the page.',
      ),
    );
  });

  it('offers only "forget everything" while the organization has it off', async () => {
    renderView({ ...base, enabled: false, memories: [], storedCount: 3 });
    expect(
      screen.getByText('Memory is turned off for this organization.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/3 memories are still stored/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Forget everything' }));
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Forget everything' }).at(-1)!,
    );
    await waitFor(() => expect(a.forget).toHaveBeenCalledTimes(1));
  });

  it('still offers "forget everything" when the list could not be read', () => {
    renderView({
      ...base,
      memories: [],
      listUnavailable: true,
      storedCount: 2,
    });
    expect(screen.getByText(/couldn't be loaded/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Forget everything' }),
    ).toBeInTheDocument();
  });
});
