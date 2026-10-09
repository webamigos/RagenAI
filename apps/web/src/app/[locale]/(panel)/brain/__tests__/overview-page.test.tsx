import { beforeEach, expect, it, vi } from 'vitest';
const access = vi.hoisted(() => vi.fn());
const overview = vi.hoisted(() => vi.fn());
vi.mock('@/features/brain/services/queries/get-brain-access-query', () => ({
  getBrainAccessQuery: access,
}));
vi.mock('@/features/brain/services/queries/get-brain-overview-query', () => ({
  getBrainOverviewQuery: overview,
}));
vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => key,
}));
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('not-found');
  },
}));
vi.mock('../components/BrainOverviewPanel', () => ({
  BrainOverviewPanel: () => null,
}));
vi.mock('../components/assistant/BrainAssistantContext', () => ({
  BrainScreen: () => null,
}));
import OverviewPage from '../overview/page';
beforeEach(() => vi.clearAllMocks());
it('refuses the route before querying data when Brain access is unavailable', async () => {
  access.mockResolvedValue(null);
  await expect(
    OverviewPage({ searchParams: Promise.resolve({ lang: 'pol' }) }),
  ).rejects.toThrow('not-found');
  expect(overview).not.toHaveBeenCalled();
});
it('uses organization from access and a validated language, never from URL input', async () => {
  access.mockResolvedValue({ orgId: 'session-org', canWrite: false });
  overview.mockResolvedValue({});
  await OverviewPage({ searchParams: Promise.resolve({ lang: 'pol' }) });
  expect(overview).toHaveBeenCalledWith('session-org', 'pol');
});
it('runs the full width of the panel, like the other Brain tabs', async () => {
  access.mockResolvedValue({ orgId: 'session-org', canWrite: false });
  overview.mockResolvedValue({});
  const page = await OverviewPage({ searchParams: Promise.resolve({}) });
  // A cap here makes the content jump width on every tab switch, because
  // the pages table and the graph beside it run full width.
  expect(String(page.props.className ?? '')).not.toMatch(/max-w-/);
});
