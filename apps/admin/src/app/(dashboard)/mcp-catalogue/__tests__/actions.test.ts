import { beforeEach, describe, expect, it, vi } from 'vitest';

const admin = { id: 'admin-1', email: 'admin@example.com', name: 'Admin' };

const findFirst = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const remove = vi.fn();
const connectorCount = vi.fn();
const tokenCount = vi.fn();
const settingsFindMany = vi.fn();
const settingsFindUnique = vi.fn();
const settingsUpdate = vi.fn();
const transaction = vi.fn();
const recordAdminAction = vi.fn();
const probeMcpServer = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: () => Promise.resolve(admin),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// Partial: `validation.ts` uses the real `isBlockedHost`, which is the
// behaviour these tests are checking. Only the outbound probe is stubbed.
vi.mock('@ragenai/connector-guard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@ragenai/connector-guard')>()),
  probeMcpServer: (...args: unknown[]) => probeMcpServer(...args),
}));
vi.mock('@/lib/audit', () => ({
  ADMIN_ACTIONS: {
    catalogueConnectionTested: 'admin.mcp_catalogue.connection_tested',
    catalogueEntryCreated: 'admin.mcp_catalogue.created',
    catalogueEntryUpdated: 'admin.mcp_catalogue.updated',
    catalogueEntryToggled: 'admin.mcp_catalogue.toggled',
    catalogueEntryDeleted: 'admin.mcp_catalogue.deleted',
  },
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    mcpCatalogEntry: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      findMany: vi.fn().mockResolvedValue([]),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => remove(...a),
    },
    mcpConnector: { count: (...a: unknown[]) => connectorCount(...a) },
    mcpOAuthToken: { count: (...a: unknown[]) => tokenCount(...a) },
    organizationSettings: {
      findMany: (...a: unknown[]) => settingsFindMany(...a),
      update: vi.fn(),
    },
    organization: { findMany: vi.fn().mockResolvedValue([]) },
    settings: {
      findUnique: (...a: unknown[]) => settingsFindUnique(...a),
      update: (...a: unknown[]) => settingsUpdate(...a),
    },
    $transaction: (...a: unknown[]) => transaction(...a),
  },
}));

const isVaultConfigured = vi.fn(() => true);
const storeToken = vi.fn();
vi.mock('@/lib/vault', () => ({
  isVaultConfigured: () => isVaultConfigured(),
  getVaultClient: () => ({
    storeToken: (...a: unknown[]) => storeToken(...a),
  }),
}));

import {
  createCatalogueEntryAction,
  deleteCatalogueEntryAction,
  storeCatalogueOAuthCredentialsAction,
  testCatalogueConnectionAction,
  updateCatalogueEntryAction,
} from '../actions';
import type { CatalogueEntryInput } from '../validation';

function input(over: Partial<CatalogueEntryInput> = {}): CatalogueEntryInput {
  return {
    slug: 'notion',
    label: 'Notion',
    description: '',
    mcpServerUrl: 'https://mcp.notion.com/mcp',
    authType: 'API_KEY_BEARER',
    icon: '',
    lucideIcon: 'notebook',
    systemPrompt: '',
    allowsPrivateAddress: false,
    scopes: [],
    useUserScope: false,
    ...over,
  };
}

describe('adding a connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 1, slug: 'notion', publicId: 'pub-1' });
  });

  it('writes the row and records what it widened', async () => {
    const result = await createCatalogueEntryAction(
      input({ allowsPrivateAddress: false }),
    );

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          slug: 'notion',
          isBuiltIn: false,
          createdBy: 'admin-1',
        }),
      }),
    );
    // The opt-out is the one field on the form with a security consequence,
    // so it is in the audit entry whether or not it was ticked.
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.mcp_catalogue.created',
        after: expect.objectContaining({ allowsPrivateAddress: false }),
      }),
    );
  });

  it('refuses a slug that differs only in case from an existing one', async () => {
    // `customerId` lowercases the slug, so `slack` beside `SLACK` would send
    // both connectors the same `x-customer-id`.
    findFirst.mockResolvedValue({ slug: 'SLACK' });

    const result = await createCatalogueEntryAction(input({ slug: 'slack' }));

    expect(result.ok).toBe(false);
    expect(result.field).toBe('slug');
    expect(result.message).toMatch(/differs only in case/);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a private address unless the entry opts in', async () => {
    const refused = await createCatalogueEntryAction(
      input({ mcpServerUrl: 'http://10.0.0.5/mcp' }),
    );
    expect(refused.ok).toBe(false);
    expect(refused.field).toBe('mcpServerUrl');
    expect(create).not.toHaveBeenCalled();

    const allowed = await createCatalogueEntryAction(
      input({
        mcpServerUrl: 'http://10.0.0.5/mcp',
        allowsPrivateAddress: true,
      }),
    );
    expect(allowed.ok).toBe(true);
  });

  it('refuses the metadata address even with the opt-in ticked', async () => {
    const result = await createCatalogueEntryAction(
      input({
        mcpServerUrl: 'http://169.254.169.254/latest/meta-data/',
        allowsPrivateAddress: true,
      }),
    );

    expect(result.ok).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});

describe('editing a connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses to edit a built-in, and says what can be done instead', async () => {
    findUnique.mockResolvedValue({
      id: 1,
      slug: 'SLACK',
      isBuiltIn: true,
      authType: 'EXTERNAL_MCP',
      mcpServerUrl: null,
      allowsPrivateAddress: false,
    });

    const result = await updateCatalogueEntryAction('pub-1', input());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/disable it/i);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('deleting a connector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findUnique.mockResolvedValue({ id: 1, slug: 'notion', isBuiltIn: false });
    connectorCount.mockResolvedValue(0);
    tokenCount.mockResolvedValue(0);
    settingsFindMany.mockResolvedValue([]);
    settingsFindUnique.mockResolvedValue(null);
    transaction.mockResolvedValue([]);
  });

  it('refuses while a connector still holds the slug', async () => {
    connectorCount.mockResolvedValue(3);

    const result = await deleteCatalogueEntryAction('pub-1');

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/3 connectors/);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('refuses while a credential is still stored against it', async () => {
    // Vault paths are keyed by slug, so a reused slug would inherit an old
    // token — the quietest way for one operator's server to be handed
    // another's credentials.
    tokenCount.mockResolvedValue(1);

    const result = await deleteCatalogueEntryAction('pub-1');

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Credentials are still stored/);
  });

  it('purges the slug from every allowlist in the same transaction', async () => {
    settingsFindMany.mockResolvedValue([
      { id: 1, allowedConnectors: ['notion', 'SLACK'] },
    ]);

    const result = await deleteCatalogueEntryAction('pub-1');

    expect(result.ok).toBe(true);
    // One update per organization plus the delete: a slug left in an
    // `allowedConnectors` array would be inherited by the next entry created
    // under the same name.
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0][0]).toHaveLength(2);
  });

  it('purges the platform default allowlist too', async () => {
    settingsFindUnique.mockResolvedValue({
      key: 'default_allowed_connectors',
      value: JSON.stringify(['notion', 'SLACK']),
    });

    await deleteCatalogueEntryAction('pub-1');

    expect(settingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { value: JSON.stringify(['SLACK']) } }),
    );
  });

  it('refuses to delete a built-in, which is re-seeded on every deploy', async () => {
    findUnique.mockResolvedValue({ id: 1, slug: 'SLACK', isBuiltIn: true });

    const result = await deleteCatalogueEntryAction('pub-1');

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Disable it instead/);
  });
});

describe('testing a connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    probeMcpServer.mockResolvedValue({ ok: true, toolNames: ['search'] });
  });

  it('lists the tools, and records that it reached out', async () => {
    const result = await testCatalogueConnectionAction(
      'https://mcp.notion.com/mcp',
      false,
    );

    expect(result).toEqual({ ok: true, toolNames: ['search'] });
    // The audit entry is the only record a probe leaves: it is an outbound
    // request from the platform to an address somebody just typed.
    expect(recordAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'admin.mcp_catalogue.connection_tested',
      }),
    );
  });

  it('refuses an address the form would refuse to save, before dialling', async () => {
    const result = await testCatalogueConnectionAction(
      'http://169.254.169.254/latest/',
      true,
    );

    expect(result.ok).toBe(false);
    // A check offered on a form must not be the one path that reaches an
    // address the form itself would not store.
    expect(probeMcpServer).not.toHaveBeenCalled();
  });

  it('passes the entry’s opt-out through to the policy', async () => {
    await testCatalogueConnectionAction('http://10.0.0.5/mcp', true);

    expect(probeMcpServer).toHaveBeenCalledWith('http://10.0.0.5/mcp', {
      allowPrivate: true,
    });
  });
});

describe('an OAuth entry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findFirst.mockResolvedValue(null);
    create.mockResolvedValue({ id: 1, slug: 'notion', publicId: 'pub-1' });
  });

  it('stores its scopes and its user-scope quirk on the row', async () => {
    await createCatalogueEntryAction(
      input({
        authType: 'EXTERNAL_MCP',
        scopes: ['search:read.public', 'channels:history'],
        useUserScope: true,
      }),
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          scopes: ['search:read.public', 'channels:history'],
          useUserScope: true,
        }),
      }),
    );
  });

  it('never writes a client secret to a column', async () => {
    await createCatalogueEntryAction(input({ authType: 'EXTERNAL_MCP' }));

    // ADR-32: the row carries `oauthCredentialsStored` and nothing else, so a
    // secret cannot reach a `SELECT *` or the admin activity feed.
    const written = create.mock.calls[0][0].data as Record<string, unknown>;
    expect(Object.keys(written)).not.toContain('oauthClientSecret');
    expect(Object.keys(written)).not.toContain('oauthClientId');
  });
});

describe('storing an OAuth client secret', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isVaultConfigured.mockReturnValue(true);
    storeToken.mockResolvedValue(undefined);
  });

  it('refuses an entry whose persisted auth type is not EXTERNAL_MCP', async () => {
    // The form hides the control for anything else, but the action is
    // reachable without it — and the form used to render the control the
    // moment EXTERNAL_MCP was *selected*, before any save. A secret stored
    // then belongs to an entry that may never become an OAuth one, and
    // nothing would read it or clear it.
    findUnique.mockResolvedValue({
      id: 1,
      slug: 'notion',
      isBuiltIn: false,
      authType: 'API_KEY_BEARER',
    });

    const result = await storeCatalogueOAuthCredentialsAction(
      'pub-1',
      'client-id',
      'client-secret',
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/authentication type/i);
  });

  it('refuses an entry that is no longer in the catalogue', async () => {
    findUnique.mockResolvedValue(null);

    const result = await storeCatalogueOAuthCredentialsAction(
      'pub-1',
      'client-id',
      'client-secret',
    );

    expect(result.ok).toBe(false);
  });

  it('refuses both fields empty before it reads anything', async () => {
    const result = await storeCatalogueOAuthCredentialsAction('pub-1', ' ', '');

    expect(result.ok).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
