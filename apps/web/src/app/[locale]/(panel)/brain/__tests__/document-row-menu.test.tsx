import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, expect, it, vi } from 'vitest';

import messages from '@/app/messages/pl.json';

const mocks = vi.hoisted(() => ({
  withdraw: vi.fn(),
  restore: vi.fn(),
  retry: vi.fn(),
  send: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../actions', () => ({
  withdrawSourceDocumentAction: mocks.withdraw,
  restoreSourceDocumentAction: mocks.restore,
  retryExtractionFindingAction: mocks.retry,
}));
vi.mock('@/app/actions/bulk-documents', () => ({
  sendStagedToKnowledgeBaseAction: mocks.send,
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { DocumentRowMenu } = await import('../components/DocumentRowMenu');

type Props = Parameters<typeof DocumentRowMenu>[0];
const show = (over: Partial<Props> = {}) =>
  render(
    <NextIntlClientProvider locale="pl" messages={messages}>
      <DocumentRowMenu
        fileId="file-1"
        fileName="regulamin.pdf"
        retrieval="in"
        curated
        failedExtraction={null}
        {...over}
      />
    </NextIntlClientProvider>,
  );
const open = () => {
  const trigger = screen.getByRole('button', {
    name: 'Działania: regulamin.pdf',
  });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false });
};

beforeEach(() => vi.clearAllMocks());

it('offers nothing, and renders nothing, when the row has nothing to do', () => {
  const { container } = show({ curated: false });
  expect(container).toBeEmptyDOMElement();
});

it('asks before taking a curated document out of search', async () => {
  mocks.withdraw.mockResolvedValue({ success: true });
  show();
  open();
  fireEvent.click(
    await screen.findByRole('menuitem', { name: 'Wyłącz z wyszukiwania' }),
  );
  expect(mocks.withdraw).not.toHaveBeenCalled();
  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(
    within(dialog).getByRole('button', { name: 'Wyłącz z wyszukiwania' }),
  );
  await waitFor(() =>
    expect(mocks.withdraw).toHaveBeenCalledWith({ fileId: 'file-1' }),
  );
});

it('puts a withdrawn document back without asking', async () => {
  mocks.restore.mockResolvedValue({ success: true });
  show({ retrieval: 'withdrawn' });
  open();
  fireEvent.click(await screen.findByRole('menuitem', { name: /Przywróć/ }));
  await waitFor(() =>
    expect(mocks.restore).toHaveBeenCalledWith({ fileId: 'file-1' }),
  );
});

it('retries the failed extraction it is given, beside the retrieval move', async () => {
  mocks.retry.mockResolvedValue({ success: true });
  show({ retrieval: 'staged', failedExtraction: 'finding-1' });
  open();
  expect(
    await screen.findByRole('menuitem', { name: /Wyślij do bazy wiedzy/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Ponów ekstrakcję' }));
  await waitFor(() =>
    expect(mocks.retry).toHaveBeenCalledWith({ findingPublicId: 'finding-1' }),
  );
});
