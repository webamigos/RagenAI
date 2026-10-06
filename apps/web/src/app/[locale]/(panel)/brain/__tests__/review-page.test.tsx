import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  queue: vi.fn(),
  options: vi.fn(),
  documents: vi.fn(),
  counts: vi.fn(),
  scope: vi.fn(),
  features: vi.fn(),
  page: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));
vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: mocks.access,
}));
vi.mock(
  '@/features/brain/services/queries/get-brain-review-queue-query',
  () => ({ getBrainReviewQueueQuery: mocks.queue }),
);
vi.mock(
  '@/features/brain/services/queries/get-brain-review-options-query',
  () => ({ getBrainReviewOptionsQuery: mocks.options }),
);
vi.mock('@/features/brain/services/queries/get-brain-documents-query', () => ({
  getBrainDocumentsQuery: mocks.documents,
}));
vi.mock(
  '@/features/brain/services/queries/get-brain-status-counts-query',
  () => ({ getBrainStatusCountsQuery: mocks.counts }),
);
vi.mock('@/features/brain/services/queries/brain-language-scope', () => ({
  getBrainLanguageScopeQuery: mocks.scope,
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ getEffectiveFeaturesQuery: mocks.features }),
);
vi.mock('@/features/brain/services/queries/get-knowledge-page-query', () => ({
  getKnowledgePageQuery: mocks.page,
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('../components/BrainReviewMode', () => ({
  BrainReviewMode: () => null,
}));
const { default: ReviewPage } = await import('../review/page');
beforeEach(() => {
  vi.resetAllMocks();
  mocks.notFound.mockImplementation(() => {
    throw new Error('not-found');
  });
  mocks.access.mockResolvedValue({ orgId: 'session-org', canWrite: true });
  mocks.queue.mockResolvedValue([
    { publicId: '11111111-2222-4333-8444-555555555555' },
  ]);
  mocks.options.mockResolvedValue({ members: [], teams: [] });
  mocks.documents.mockResolvedValue([]);
  mocks.counts.mockResolvedValue({
    pages: { CANDIDATE: 2, APPROVED: 3, REJECTED: 1, STALE: 0 },
  });
  mocks.scope.mockResolvedValue(null);
  mocks.features.mockResolvedValue({ brainParaphraseWarnings: false });
  mocks.page.mockResolvedValue({
    publicId: '11111111-2222-4333-8444-555555555555',
  });
});
it('guards its own route before loading data', async () => {
  mocks.access.mockResolvedValue(null);
  await expect(
    ReviewPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('not-found');
  expect(mocks.queue).not.toHaveBeenCalled();
});
it('passes the session organization and language to the queue, and loads its first page', async () => {
  await ReviewPage({ searchParams: Promise.resolve({ lang: 'pol' }) });
  expect(mocks.queue).toHaveBeenCalledWith('session-org', 'pol');
  expect(mocks.page).toHaveBeenCalledWith(
    'session-org',
    '11111111-2222-4333-8444-555555555555',
  );
});
it('refuses malformed or absent explicit page ids instead of switching silently', async () => {
  await expect(
    ReviewPage({ searchParams: Promise.resolve({ page: 'invalid' }) }),
  ).rejects.toThrow('not-found');
  mocks.page.mockResolvedValue(null);
  await expect(
    ReviewPage({
      searchParams: Promise.resolve({
        page: '11111111-2222-4333-8444-555555555555',
      }),
    }),
  ).rejects.toThrow('not-found');
});
