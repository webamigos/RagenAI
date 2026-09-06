import { beforeEach, describe, expect, it, vi } from 'vitest';

const isFeatureEnabledQuery = vi.fn();

vi.mock(
  '@/features/subscriptions/services/queries/get-effective-features-query',
  () => ({ isFeatureEnabledQuery }),
);

const {
  assertCanManageDocuments,
  assertCanManageProjects,
  assertCanManageOrganizationSettings,
} = await import('../feature-guards');

/**
 * The gates themselves. Every command that can change an organization's
 * content mocks this module out, so without these tests the rule they all
 * depend on would have no coverage anywhere.
 *
 * Each case asserts the flag key as well as the outcome: a guard that refuses
 * correctly but reads the wrong key would let an organization freeze one
 * capability and lose another, and nothing else in the suite would notice.
 */
describe('the write-restriction guards', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const cases = [
    ['manageDocuments', assertCanManageDocuments, 'add or remove documents'],
    ['manageProjects', assertCanManageProjects, 'create or delete projects'],
    [
      'manageOrganizationSettings',
      assertCanManageOrganizationSettings,
      'change its settings',
    ],
  ] as const;

  it.each(cases)(
    '%s allows the operation when the flag is on',
    async (key, guard) => {
      isFeatureEnabledQuery.mockResolvedValue(true);

      await expect(guard('org-1')).resolves.toBeUndefined();
      expect(isFeatureEnabledQuery).toHaveBeenCalledWith('org-1', key);
    },
  );

  it.each(cases)(
    '%s refuses when the flag is off, naming the organization not the user',
    async (key, guard, fragment) => {
      isFeatureEnabledQuery.mockResolvedValue(false);

      // The message reaches a demo visitor, so it has to say the organization
      // is restricted rather than imply a missing role or an expired plan.
      await expect(guard('org-1')).rejects.toThrow(fragment);
      await expect(guard('org-1')).rejects.toThrow(/This organization/);
      expect(isFeatureEnabledQuery).toHaveBeenCalledWith('org-1', key);
    },
  );

  it('lets a resolution failure surface rather than treating it as allowed', async () => {
    // Failing open here would mean a database blip silently unfreezes every
    // restricted organization at once.
    isFeatureEnabledQuery.mockRejectedValue(new Error('db down'));

    await expect(assertCanManageDocuments('org-1')).rejects.toThrow('db down');
  });
});
