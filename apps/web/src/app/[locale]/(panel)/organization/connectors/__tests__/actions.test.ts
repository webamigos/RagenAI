/**
 * The org connector allowlist reads the catalogue.
 *
 * It used to read the eleven compiled-in manifests, which had two effects a
 * platform administrator could not explain: a connector they had added never
 * appeared on this page, and once they granted it at the app level the page
 * could not be saved at all — the validator rejected the very slug the
 * defaults had handed it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetOrgId = vi.fn();
vi.mock('@/app/lib/utils/auth-helpers', () => ({
  getOrgIdFromAuthOrThrow: () => mockGetOrgId(),
}));

const mockGetAllowed = vi.fn();
const mockSaveAllowed = vi.fn();
const mockGetDefaults = vi.fn();
vi.mock('@/features/organizations/services/organization-settings', () => ({
  getAllowedConnectors: () => mockGetAllowed(),
  saveAllowedConnectors: (...args: unknown[]) => mockSaveAllowed(...args),
  getDefaultAllowedConnectors: () => mockGetDefaults(),
}));

const mockDefinitions = vi.fn();
vi.mock(
  '@/features/connectors/services/queries/get-connector-definitions-query',
  () => ({
    getConnectorDefinitionsQuery: () => mockDefinitions(),
  }),
);

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

const { getOrgConnectorSettingsAction, saveOrgConnectorsAction } =
  await import('../actions');

const slack = {
  provider: 'slack',
  name: 'Slack',
  iconUrl: '/connectors/slack.svg',
};
const addedByAnOperator = {
  provider: 'notion',
  name: 'Notion',
  iconUrl: undefined,
};

describe('getOrgConnectorSettingsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgId.mockResolvedValue('org-1');
    mockGetAllowed.mockResolvedValue([]);
    mockGetDefaults.mockResolvedValue([]);
    mockDefinitions.mockResolvedValue([slack, addedByAnOperator]);
  });

  it('offers a connector an operator added, not just the built-ins', async () => {
    const { available } = await getOrgConnectorSettingsAction();

    expect(available.map((c) => c.provider)).toEqual(['slack', 'notion']);
  });

  it('falls back to an empty icon rather than rendering a broken image', async () => {
    const { available } = await getOrgConnectorSettingsAction();

    expect(available[1]).toEqual({
      provider: 'notion',
      name: 'Notion',
      icon: '',
    });
  });

  it('narrows to the app-level defaults when there are any', async () => {
    mockGetDefaults.mockResolvedValue(['notion']);

    const { available } = await getOrgConnectorSettingsAction();

    expect(available.map((c) => c.provider)).toEqual(['notion']);
  });

  it('leaves out an entry the catalogue no longer offers', async () => {
    mockDefinitions.mockResolvedValue([slack]);

    const { available } = await getOrgConnectorSettingsAction();

    expect(available.map((c) => c.provider)).toEqual(['slack']);
  });
});

describe('saveOrgConnectorsAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOrgId.mockResolvedValue('org-1');
    mockDefinitions.mockResolvedValue([slack, addedByAnOperator]);
    mockSaveAllowed.mockResolvedValue(undefined);
  });

  it('saves a slug an operator added', async () => {
    await expect(saveOrgConnectorsAction(['notion'])).resolves.toEqual({
      success: true,
    });
    expect(mockSaveAllowed).toHaveBeenCalledWith('org-1', ['notion']);
  });

  it('refuses a slug the catalogue does not carry', async () => {
    await expect(saveOrgConnectorsAction(['made-up'])).resolves.toEqual({
      success: false,
    });
    expect(mockSaveAllowed).not.toHaveBeenCalled();
  });

  it('refuses a value that is not a string', async () => {
    await expect(
      saveOrgConnectorsAction([7 as unknown as string]),
    ).resolves.toEqual({ success: false });
    expect(mockSaveAllowed).not.toHaveBeenCalled();
  });

  it('derives the organization from the session before reading anything', async () => {
    mockGetOrgId.mockRejectedValue(new Error('no session'));

    await expect(saveOrgConnectorsAction(['notion'])).resolves.toEqual({
      success: false,
    });
    expect(mockDefinitions).not.toHaveBeenCalled();
    expect(mockSaveAllowed).not.toHaveBeenCalled();
  });
});
