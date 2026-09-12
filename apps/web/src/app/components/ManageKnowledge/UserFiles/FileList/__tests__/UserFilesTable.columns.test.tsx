import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextIntlClientProvider } from 'next-intl';
import { UserFilesTable } from '../UserFilesTable';
import type { UserFileTypeSafe } from '../UserFilesTable';
import { EmbeddingStatus } from '@/generated/prisma/browser';
import type {
  UserFilesSort,
  UserFilesSortDir,
} from '@/features/documents/contracts/document.types';

/*
  The real messages, not a fixture. A fixture declared in the test is the
  answer sheet: it cannot tell a missing key from a present one, and the
  columns here are named by six keys that did not exist until phase 7 asked
  for them.
*/
import messages from '@/app/messages/en.json';

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: vi.fn(() => '/'),
  Link: ({ children, href }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@ragenai/common-ui/Tooltip', () => ({
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock('@/app/actions', () => ({
  updateFilePiiPolicy: vi.fn().mockResolvedValue(undefined),
  reembedFile: vi.fn().mockResolvedValue({ workflowId: 'wf-1' }),
}));

vi.mock('@/app/[locale]/(panel)/knowledge/optimize-document/actions', () => ({
  scoreDocumentAction: vi.fn().mockResolvedValue({ total: 80 }),
}));

const makeFile = (
  overrides: Partial<UserFileTypeSafe> = {},
): UserFileTypeSafe => ({
  id: 'file-1',
  organizationId: 'org-1',
  fileName: 'hr-payroll-policy.pdf',
  fileSize: 2_411_724,
  fileType: 'PDF',
  projectId: 'proj-1',
  project: null,
  // 6 September 2026, 12:54 in the provider's time zone.
  createdAt: new Date('2026-09-06T10:54:00.000Z'),
  embeddingStatus: EmbeddingStatus.COMPLETED,
  embeddingStartedAt: null,
  embeddingCompletedAt: null,
  embeddingFailedAt: null,
  ...overrides,
});

const defaultProps = {
  files: [makeFile()],
  subfolders: [],
  showModal: { isOpen: false, fileId: null },
  deleteLoading: false,
  toggleModal: vi.fn(),
  onAddFile: vi.fn(),
  onRemoveFile: vi.fn(),
  handleDelete: vi.fn(),
  sort: 'createdAt' as UserFilesSort,
  dir: 'desc' as UserFilesSortDir,
};

function renderTable(props: Partial<typeof defaultProps> = {}) {
  return render(
    <NextIntlClientProvider
      messages={messages}
      locale="en"
      timeZone="Europe/Warsaw"
    >
      <UserFilesTable {...defaultProps} {...props} />
    </NextIntlClientProvider>,
  );
}

describe('UserFilesTable — the columns phase 7 names', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  /**
   * FILE NAME · SIZE · ADDED · STATUS · PII POLICY, in the column's own words
   * rather than the sort menu's. "File Size" and "Date Added" read correctly
   * after "Sort:" and badly as column headings.
   */
  it('names its columns as the design does', () => {
    renderTable({ canManageOrg: true } as Partial<typeof defaultProps>);

    const header = screen.getAllByRole('rowgroup')[0];
    expect(within(header).getByText('File name')).toBeInTheDocument();
    expect(within(header).getByText('Size')).toBeInTheDocument();
    expect(within(header).getByText('Added')).toBeInTheDocument();
    expect(within(header).getByText('Status')).toBeInTheDocument();
    expect(within(header).getByText('PII policy')).toBeInTheDocument();
  });

  /** The row-menu column has no visible label, so its name is for a reader. */
  it('gives the actions column a translated accessible name', () => {
    renderTable();

    expect(screen.getByText('Actions')).toHaveClass('sr-only');
  });

  /**
   * `dd.MM.yyyy HH:mm:ss` is nineteen characters in a 128px column: it wrapped
   * to two lines in every row and spent the second on seconds nobody reads off
   * a file list. The order is the locale's — "Sep 6" here, "6 wrz" in Polish —
   * and the clock is 24-hour everywhere, as the rest of the panel is.
   */
  it('writes the date short, in the page locale and a 24-hour clock', () => {
    renderTable();

    expect(screen.getByText('Sep 6, 12:54')).toBeInTheDocument();
    expect(screen.queryByText(/06\.09\.2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/PM/)).not.toBeInTheDocument();
  });

  /**
   * One type marker, not two. The icon came from the `fileType` enum and the
   * tag from the extension, so a `.txt` file bucketed as MARKDOWN showed a
   * markdown icon beside a TXT tag — two marks that disagree.
   */
  it('marks the file type once, with the extension tag', () => {
    renderTable({
      files: [makeFile({ fileName: 'legacy-import-notes.txt' })],
    });

    expect(screen.getByText('TXT')).toBeInTheDocument();

    // The name cell only — the row still ends in a menu button with an icon.
    const nameCell = screen.getByText('legacy-import-notes.txt').closest('td')!;
    expect(nameCell.querySelectorAll('svg')).toHaveLength(0);
  });
});
