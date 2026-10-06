import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  graph: vi.fn(),
  topics: vi.fn(),
  scope: vi.fn(),
  canvas: vi.fn((_props: Record<string, unknown>) => null),
  notFound: vi.fn(() => {
    throw Error('not-found');
  }),
}));
vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: mocks.access,
}));
vi.mock('@/features/brain/services/queries/get-brain-graph-query', async () => {
  const actual = await vi.importActual(
    '@/features/brain/services/queries/get-brain-graph-query',
  );
  return { ...actual, getBrainGraphQuery: mocks.graph };
});
vi.mock('@/features/brain/services/queries/get-brain-topics-query', () => ({
  getBrainTopicsQuery: mocks.topics,
}));
vi.mock('@/features/brain/services/queries/brain-language-scope', () => ({
  getBrainLanguageScopeQuery: mocks.scope,
}));
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getCurrentUserId: async () => 'user',
}));
vi.mock('next/navigation', () => ({ notFound: mocks.notFound }));
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
vi.mock('../components/BrainGraphCanvas', () => ({
  BrainGraphCanvas: mocks.canvas,
}));
vi.mock('../components/BrainTopicMap', () => ({
  BrainTopicMap: () => <div data-testid="topics" />,
}));
vi.mock('../components/GraphPageSearch', () => ({
  GraphPageSearch: () => null,
}));
const { default: GraphPage } = await import('../graph/page');
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ orgId: 'session-org' });
  mocks.scope.mockResolvedValue({ fileIds: ['file'], pageIds: [1] });
  mocks.topics.mockResolvedValue({
    topics: [
      {
        anchor: id,
        label: 'A',
        pages: [{ id, title: 'A', status: 'CANDIDATE' }],
        approved: 0,
        candidates: 1,
      },
    ],
    isolated: [],
    pages: [{ id, title: 'A' }],
  });
  mocks.graph.mockResolvedValue({
    nodes: [{ id, title: 'A' }],
    total: { nodes: 1, edges: 0 },
    shown: { nodes: 1, edges: 0 },
    focus: id,
    budgets: [150],
    budget: 150,
    hops: 1,
    edges: [],
    communities: [],
    includeInferred: false,
  });
});
it('guards the route before reading either graph or topic data', async () => {
  mocks.access.mockResolvedValue(null);
  await expect(
    GraphPage({ searchParams: Promise.resolve({}) }),
  ).rejects.toThrow('not-found');
  expect(mocks.graph).not.toHaveBeenCalled();
  expect(mocks.topics).not.toHaveBeenCalled();
});
it('defaults to topics with session organization and language scope, then focuses its hub', async () => {
  render(await GraphPage({ searchParams: Promise.resolve({ lang: 'pol' }) }));
  expect(screen.getByTestId('topics')).toBeInTheDocument();
  expect(mocks.topics).toHaveBeenCalledWith('session-org', {
    fileIds: ['file'],
    pageIds: [1],
  });
  expect(mocks.graph).toHaveBeenCalledWith(
    'session-org',
    expect.objectContaining({ focus: id, hops: 1 }),
    { fileIds: ['file'], pageIds: [1] },
  );
  expect(mocks.canvas.mock.calls[0]?.[0]).toMatchObject({ compact: true });
  expect(screen.queryByTestId('brain-topic-members')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'review-group' })).toHaveAttribute(
    'href',
    `/brain/graph?view=topics&topic=${id}&lang=pol`,
  );
});
it('keeps the budgeted full graph explicit and never loads the topic payload for it', async () => {
  render(
    await GraphPage({
      searchParams: Promise.resolve({ view: 'full', budget: '300' }),
    }),
  );
  expect(mocks.topics).not.toHaveBeenCalled();
  expect(mocks.graph.mock.calls[0]?.[1]).toMatchObject({
    focus: null,
    budget: 300,
  });
  expect(mocks.canvas.mock.calls[0]?.[0].compact).toBeUndefined();
});

it('refuses a neighbourhood focus outside the scoped organization pages', async () => {
  await expect(
    GraphPage({
      searchParams: Promise.resolve({
        focus: '00000000-0000-4000-8000-000000000099',
      }),
    }),
  ).rejects.toThrow('not-found');
  expect(mocks.graph).not.toHaveBeenCalled();
});

it('opens the full member list only after choosing a topic', async () => {
  render(await GraphPage({ searchParams: Promise.resolve({ topic: id }) }));
  expect(screen.getByTestId('brain-topic-members')).toHaveTextContent('A');
});
