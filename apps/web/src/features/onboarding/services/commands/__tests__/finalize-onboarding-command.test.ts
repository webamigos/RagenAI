import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  getSession: vi.fn(),
  listOrganizations: vi.fn(),
  setActiveOrganization: vi.fn(),
  teamUpsert: vi.fn(),
  teamMemberFindFirst: vi.fn(),
  teamMemberCreate: vi.fn(),
  subscriptionFindFirst: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: (...a: unknown[]) => m.getSession(...a),
      listOrganizations: (...a: unknown[]) => m.listOrganizations(...a),
      setActiveOrganization: (...a: unknown[]) => m.setActiveOrganization(...a),
    },
  },
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));
vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: { upsert: (...a: unknown[]) => m.teamUpsert(...a) },
    teamMember: {
      findFirst: (...a: unknown[]) => m.teamMemberFindFirst(...a),
      create: (...a: unknown[]) => m.teamMemberCreate(...a),
    },
    subscription: {
      findFirst: (...a: unknown[]) => m.subscriptionFindFirst(...a),
    },
  },
}));
vi.mock('@ragenai/rag-core', () => ({
  resolveDefaultVectorStore: () => 'qdrant',
}));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { isTenantScopeSatisfied } from '@ragenai/platform-contracts';
import { finalizeOnboardingCommand } from '../finalize-onboarding-command';

beforeEach(() => {
  vi.clearAllMocks();
  m.getSession.mockResolvedValue({ user: { id: 'user-1', name: 'Ada' } });
  m.listOrganizations.mockResolvedValue([
    { id: 'org-1', name: 'Ada’s Organization', slug: 'user-1-org' },
  ]);
  m.setActiveOrganization.mockResolvedValue({});
  m.teamUpsert.mockResolvedValue({});
  m.teamMemberFindFirst.mockResolvedValue({ id: 'tm-1' });
  m.subscriptionFindFirst.mockResolvedValue({ id: 'sub-1' });
});

describe('finalizeOnboardingCommand — the default team', () => {
  it('upserts the General team inside the active organization', async () => {
    await finalizeOnboardingCommand();

    const args = m.teamUpsert.mock.calls[0][0];
    expect(args.where).toEqual({
      id: 'org-1-general',
      organizationId: 'org-1',
    });
    expect(args.create).toMatchObject({ organizationId: 'org-1' });
    expect(isTenantScopeSatisfied('Team', 'upsert', args)).toBe(true);
  });
});
