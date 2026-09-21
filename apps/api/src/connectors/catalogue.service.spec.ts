import { CatalogueService } from './catalogue.service.js';
import { type PrismaService } from '../prisma/prisma.service.js';

function row(over: Record<string, unknown> = {}) {
  return {
    publicId: 'public-1',
    slug: 'notion',
    label: 'Notion',
    description: 'Search pages.',
    icon: null,
    lucideIcon: 'notebook',
    mcpServerUrl: 'https://mcp.notion.com/mcp',
    authType: 'API_KEY_BEARER',
    authBaseUrl: null,
    authPath: null,
    scopes: [],
    useUserScope: false,
    oauthCredentialsStored: false,
    systemPrompt: null,
    allowsPrivateAddress: false,
    isBuiltIn: false,
    enabled: true,
    ...over,
  };
}

function makeService(rows: Record<string, unknown>[]) {
  const findMany = vi.fn().mockResolvedValue(rows);
  const prisma = {
    client: { mcpCatalogEntry: { findMany } },
  } as unknown as PrismaService;
  return { service: new CatalogueService(prisma), findMany };
}

describe('CatalogueService', () => {
  it('asks only for enabled entries', async () => {
    // Disabling is the switch an operator has instead of a feature flag, and
    // an entry that is off everywhere except the public API is not off.
    const { service, findMany } = makeService([]);

    await service.getDefinitions();

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { enabled: true } }),
    );
  });

  it('resolves a row with no behaviour pack, which is the point', async () => {
    const { service } = makeService([row()]);

    const [definition] = await service.getDefinitions();

    expect(definition).toMatchObject({
      provider: 'notion',
      name: 'Notion',
      authType: 'api_key_bearer',
      mcpServerUrl: 'https://mcp.notion.com/mcp',
    });
  });

  it('marks an operator entry as one whose address must be checked', async () => {
    const { service } = makeService([row({ allowsPrivateAddress: true })]);

    const [definition] = await service.getDefinitions();

    // The URL was typed into a form, so it is not the deployer-controlled
    // address the SSRF exemption was written for.
    expect(definition.addressGuard).toEqual({ allowPrivate: true });
  });

  it("leaves a built-in's address to the environment, and exempt", async () => {
    const { service } = makeService([
      row({ slug: 'SLACK', mcpServerUrl: null, isBuiltIn: true }),
    ]);

    const [definition] = await service.getDefinitions();

    expect(definition.addressGuard).toBeUndefined();
    expect(definition.mcpServerUrl).toBe('https://mcp.slack.com/mcp');
  });

  it('skips a row whose auth shape this build has no member for', async () => {
    const { service } = makeService([
      row(),
      row({ authType: 'WEBAUTHN_MAGIC' }),
    ]);

    const definitions = await service.getDefinitions();

    expect(definitions.map((d) => d.provider)).toEqual(['notion']);
  });
});
