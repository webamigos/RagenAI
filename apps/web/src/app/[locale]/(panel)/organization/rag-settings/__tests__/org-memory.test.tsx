import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import en from '@/app/messages/en.json';

const m = vi.hoisted(() => ({
  orgId: vi.fn(),
  requireOrgAdmin: vi.fn(),
  featureOn: vi.fn(),
  hasMemories: vi.fn(),
  deleteAll: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => m.orgId(),
  getCurrentUserId: vi.fn(),
}));
vi.mock('@/lib/auth-guards', () => ({
  requireOrgAdmin: (id: string) => m.requireOrgAdmin(id),
}));
vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery: (...a: unknown[]) => m.featureOn(...a) }),
);
vi.mock(
  '@/features/memory/services/queries/get-org-has-memories-query',
  () => ({
    getOrgHasMemoriesQuery: () => m.hasMemories(),
  }),
);
vi.mock(
  '@/features/memory/services/commands/delete-all-org-memories-command',
  () => ({ deleteAllOrgMemoriesCommand: () => m.deleteAll() }),
);
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getRagPipelineSettings: vi.fn(),
  getUsageLimits: vi.fn(),
  getModel: vi.fn(),
}));
vi.mock('@/i18n/routing', () => ({
  useRouter: () => ({ refresh: m.refresh }),
}));
vi.mock('sonner', () => ({ toast: { success: m.success, error: m.error } }));

import { deleteAllMembersMemoriesAction, getOrgMemoryAction } from '../actions';
import { OrgMemorySection } from '../components/OrgMemorySection';

beforeEach(() => {
  vi.clearAllMocks();
  m.orgId.mockResolvedValue('org-1');
  m.requireOrgAdmin.mockResolvedValue({ role: 'admin' });
  m.featureOn.mockResolvedValue(false);
  m.hasMemories.mockResolvedValue(true);
  m.deleteAll.mockResolvedValue(3);
});

describe('the org memory actions', () => {
  it('reports the key and whether memories exist, for an admin', async () => {
    expect(await getOrgMemoryAction()).toEqual({
      enabled: false,
      hasMemories: true,
    });
    expect(m.requireOrgAdmin).toHaveBeenCalledWith('org-1');
  });

  it('refuses a member without the capability before touching anything', async () => {
    m.requireOrgAdmin.mockRejectedValue(new Error('Unauthorized'));
    await expect(deleteAllMembersMemoriesAction()).rejects.toThrow(
      'Unauthorized',
    );
    expect(m.deleteAll).not.toHaveBeenCalled();
  });

  it('deletes and returns how many members it covered', async () => {
    expect(await deleteAllMembersMemoriesAction()).toEqual({
      deletedProfiles: 3,
    });
  });
});

describe('OrgMemorySection', () => {
  const renderSection = (hasMemories: boolean) =>
    render(
      <NextIntlClientProvider messages={en} locale="en">
        <OrgMemorySection data={{ enabled: true, hasMemories }} />
      </NextIntlClientProvider>,
    );

  it('deletes all members’ memories only after confirming', async () => {
    renderSection(true);
    fireEvent.click(
      screen.getByRole('button', { name: "Delete all members' memories" }),
    );
    expect(m.deleteAll).not.toHaveBeenCalled();
    fireEvent.click(
      screen
        .getAllByRole('button', { name: "Delete all members' memories" })
        .at(-1)!,
    );
    await waitFor(() =>
      expect(m.success).toHaveBeenCalledWith(
        "All members' memories are deleted.",
      ),
    );
    expect(m.refresh).toHaveBeenCalled();
  });

  it('offers nothing to delete when no member has memories', () => {
    renderSection(false);
    expect(
      screen.getByText('No member has memories stored.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
