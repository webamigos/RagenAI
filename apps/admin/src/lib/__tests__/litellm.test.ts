import { beforeEach, describe, expect, it, vi } from 'vitest';

const teamFindMany = vi.fn();
const updateLiteLLMTeam = vi.fn();

vi.mock('../db', () => ({
  prisma: { team: { findMany: (...a: unknown[]) => teamFindMany(...a) } },
}));

vi.mock('@ragenai/litellm-client', () => ({
  createLiteLLMClient: () => ({
    fetchLiteLLMModels: vi.fn(),
    getLiteLLMHealth: vi.fn(),
    getLiteLLMModelInfo: vi.fn(),
    getLiteLLMTeamInfo: vi.fn(),
    getLiteLLMSpendLogs: vi.fn(),
    getLiteLLMKeyInfo: vi.fn(),
    isLiteLLMAvailable: vi.fn(),
    updateLiteLLMTeam: (...a: unknown[]) => updateLiteLLMTeam(...a),
  }),
}));

const { syncOrgToLiteLLM } = await import('../litellm');

const ORG_ID = 'org-1';

beforeEach(() => {
  vi.clearAllMocks();
  process.env.LITELLM_PROXY_URL = 'http://litellm.test';
  teamFindMany.mockResolvedValue([{ litellmTeamId: `${ORG_ID}-general` }]);
  updateLiteLLMTeam.mockResolvedValue({});
});

/**
 * The regression this helper exists for. The panel used to POST
 * `{ team_id: orgId }` only. That team exists, but `resolveLiteLLMKeyQuery`
 * prefers a *team* key whenever the caller belongs to exactly one team — which
 * is what every signup produces. So the ceiling an administrator set was
 * applied to a team almost no traffic used.
 */
describe('which teams get updated', () => {
  it('updates the org-level team and every provisioned team', async () => {
    await syncOrgToLiteLLM(ORG_ID, { maxBudget: 50 });

    const targeted = updateLiteLLMTeam.mock.calls.map(([p]) => p.teamId);
    expect(targeted).toEqual([ORG_ID, `${ORG_ID}-general`]);
  });

  it('reports how many teams it reached', async () => {
    await expect(syncOrgToLiteLLM(ORG_ID, { maxBudget: 1 })).resolves.toEqual({
      ok: true,
      teamsUpdated: 2,
    });
  });

  it('skips teams that have no LiteLLM counterpart yet', async () => {
    await syncOrgToLiteLLM(ORG_ID, { maxBudget: 1 });

    expect(teamFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORG_ID, litellmTeamId: { not: null } },
      }),
    );
  });

  it('still updates the org-level team when the org has no teams', async () => {
    teamFindMany.mockResolvedValue([]);

    const result = await syncOrgToLiteLLM(ORG_ID, { maxBudget: 1 });

    expect(updateLiteLLMTeam.mock.calls.map(([p]) => p.teamId)).toEqual([
      ORG_ID,
    ]);
    expect(result).toEqual({ ok: true, teamsUpdated: 1 });
  });
});

describe('what gets sent', () => {
  it('sends a budget with a 30-day window', async () => {
    await syncOrgToLiteLLM(ORG_ID, { maxBudget: 50 });

    expect(updateLiteLLMTeam.mock.calls[0][0]).toMatchObject({
      maxBudget: 50,
      budgetDuration: '30d',
    });
  });

  /**
   * The regression this test now guards. `updateLiteLLMTeam` omits any field
   * that is `undefined`, so coercing a cleared limit to `undefined` left the
   * proxy holding the previous ceiling while the panel reported success.
   */
  it('sends an explicit null when the limit is removed, so the proxy clears it', async () => {
    await syncOrgToLiteLLM(ORG_ID, { maxBudget: null });

    const params = updateLiteLLMTeam.mock.calls[0][0];
    expect(params.maxBudget).toBeNull();
    expect(params.budgetDuration).toBeNull();
    expect('maxBudget' in params).toBe(true);
  });

  // Budget and models are written by two different pages, so neither may
  // clobber the other's field by sending it as undefined.
  it('sends only models when only models were given', async () => {
    await syncOrgToLiteLLM(ORG_ID, { models: ['gpt-5.4'] });

    const params = updateLiteLLMTeam.mock.calls[0][0];
    expect(params.models).toEqual(['gpt-5.4']);
    expect(params).not.toHaveProperty('maxBudget');
  });

  it('sends only the budget when only the budget was given', async () => {
    await syncOrgToLiteLLM(ORG_ID, { maxBudget: 10 });

    expect(updateLiteLLMTeam.mock.calls[0][0]).not.toHaveProperty('models');
  });
});

describe('failure', () => {
  it('reports the reason instead of swallowing it', async () => {
    updateLiteLLMTeam.mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await syncOrgToLiteLLM(ORG_ID, { maxBudget: 1 });

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ teamsUpdated: 0 });
    expect('reason' in result && result.reason).toContain('ECONNREFUSED');
  });

  // One unreachable team must not hide that the others were updated.
  it('counts the teams it did reach when only some fail', async () => {
    updateLiteLLMTeam
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error('boom'));

    const result = await syncOrgToLiteLLM(ORG_ID, { maxBudget: 1 });

    expect(result).toMatchObject({ ok: false, teamsUpdated: 1 });
  });

  it('does nothing and says so when no proxy is configured', async () => {
    delete process.env.LITELLM_PROXY_URL;

    const result = await syncOrgToLiteLLM(ORG_ID, { maxBudget: 1 });

    expect(updateLiteLLMTeam).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      reason: 'LITELLM_PROXY_URL is not set',
      teamsUpdated: 0,
    });
  });
});
