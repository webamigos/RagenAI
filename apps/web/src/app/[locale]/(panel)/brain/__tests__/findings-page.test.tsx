import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  scope: vi.fn(),
  findings: vi.fn(),
  counts: vi.fn(),
  types: vi.fn(),
  options: vi.fn(),
  cards: vi.fn(() => null),
}));
vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: mocks.access,
}));
vi.mock('@/features/brain/services/queries/brain-language-scope', () => ({
  getBrainLanguageScopeQuery: mocks.scope,
}));
vi.mock(
  '@/features/brain/services/queries/get-knowledge-findings-query',
  () => ({ getKnowledgeFindingsQuery: mocks.findings }),
);
vi.mock(
  '@/features/brain/services/queries/get-brain-status-counts-query',
  () => ({ getBrainStatusCountsQuery: mocks.counts }),
);
vi.mock(
  '@/features/brain/services/queries/get-finding-type-counts-query',
  () => ({ getFindingTypeCountsQuery: mocks.types }),
);
vi.mock(
  '@/features/brain/services/queries/get-brain-review-options-query',
  () => ({ getBrainReviewOptionsQuery: mocks.options }),
);
vi.mock('../components/FindingCards', () => ({ FindingCards: mocks.cards }));
vi.mock('../components/assistant/BrainAssistantContext', () => ({
  BrainScreen: () => null,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw Error('not-found');
  },
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('@/i18n/routing', () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));
vi.mock('../components/BrainPager', () => ({ BrainPager: () => null }));
import FindingsPage from '../findings/page';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({
    orgId: 'org',
    canWrite: false,
    assistant: false,
  });
  mocks.scope.mockResolvedValue({ fileIds: ['file'], pageIds: [1] });
  mocks.findings.mockResolvedValue({ items: [{ publicId: 'f' }], total: 1 });
  mocks.counts.mockResolvedValue({
    findings: { OPEN: 1, RESOLVED: 0, DISMISSED: 0 },
  });
  mocks.types.mockResolvedValue({
    ORPHAN: 1,
    GAP: 0,
    CONTRADICTION: 0,
    STALE: 0,
    UNOWNED: 0,
    EXTRACTION_FAILED: 0,
  });
  mocks.options.mockResolvedValue({ members: [], teams: [] });
});
it('guards access before reading findings or counts', async () => {
  mocks.access.mockResolvedValue(null);
  await expect(
    FindingsPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('not-found');
  expect(mocks.findings).not.toHaveBeenCalled();
  expect(mocks.types).not.toHaveBeenCalled();
});
it('retains status and language on all type filters, resets pagination, and skips member reads in read-only mode', async () => {
  render(
    await FindingsPage({
      searchParams: Promise.resolve({
        lang: 'pol',
        status: 'RESOLVED',
        type: 'ORPHAN',
        page: '2',
      }),
    }),
  );
  expect(mocks.findings).toHaveBeenCalledWith('org', 'RESOLVED', 2, 'ORPHAN', {
    fileIds: ['file'],
    pageIds: [1],
  });
  expect(mocks.types).toHaveBeenCalledWith('org', 'RESOLVED', {
    fileIds: ['file'],
    pageIds: [1],
  });
  expect(mocks.counts).toHaveBeenCalledWith(
    'org',
    { fileIds: ['file'], pageIds: [1] },
    'ORPHAN',
  );
  const filter = screen.getByRole('link', { name: /findings.type.GAP/ });
  expect(filter).toHaveAttribute(
    'href',
    '/brain/findings?status=RESOLVED&lang=pol&type=GAP',
  );
  expect(mocks.options).not.toHaveBeenCalled();
});
