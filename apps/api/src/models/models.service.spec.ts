import { NotFoundException } from '@nestjs/common';
import { ModelsService } from './models.service.js';
import { type OrganizationSettingsService } from '../organizations/organization-settings.service.js';
import { type ApiContext } from '../common/types/api-context.js';
import { type ModelRegistryEntry } from '../llm/model-registry.js';
import { type OrgId, type UserId, type KeyId } from '../common/types/brand.js';

type CatalogueEntry = ModelRegistryEntry & { value: string };

// Typed, because the factories below return them straight into the mocked
// modules: an untyped `vi.fn()` makes those returns `any` and the rule that
// catches a genuinely unsafe return cannot tell the difference.
const { availableModels, selectableModels } = vi.hoisted(() => ({
  availableModels: vi.fn<() => string[]>(),
  selectableModels: vi.fn<() => CatalogueEntry[]>(),
}));

vi.mock('@ragenai/llm-gateway', () => ({
  gatewayFromEnv: () => ({ availableModels }),
}));

vi.mock('../llm/model-registry.js', () => ({
  selectableModels: () => selectableModels(),
}));

const CATALOGUE: CatalogueEntry[] = [
  { value: 'gpt-5.4', displayName: 'GPT 5.4', visible: true, origin: 'openai' },
  {
    value: 'gemini-3-flash-preview',
    displayName: 'Gemini 3 Flash',
    visible: true,
    origin: 'google',
  },
  {
    value: 'mistral-large',
    displayName: 'Mistral Large',
    visible: true,
    origin: 'mistral',
  },
];

describe('ModelsService', () => {
  const context: ApiContext = {
    orgId: 'org-1' as OrgId,
    userId: 'user-1' as UserId,
    keyId: 'key-1' as KeyId,
    debugMode: false,
    knowledgeScope: 'KNOWLEDGE_BASE',
  };

  function buildService(allowed: string[] = []) {
    const getAllowedModels = vi.fn().mockResolvedValue(allowed);
    const settings = {
      getAllowedModels,
    } as unknown as OrganizationSettingsService;
    return { service: new ModelsService(settings), getAllowedModels };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    selectableModels.mockReturnValue(CATALOGUE);
    availableModels.mockReturnValue([
      'gpt-5.4',
      'gemini-3-flash-preview',
      'mistral-large',
    ]);
  });

  it('lists the catalogue in the OpenAI Model shape', async () => {
    const { service } = buildService();
    await expect(service.list(context)).resolves.toEqual([
      { id: 'gpt-5.4', object: 'model', created: 0, owned_by: 'openai' },
      {
        id: 'gemini-3-flash-preview',
        object: 'model',
        created: 0,
        owned_by: 'google',
      },
      {
        id: 'mistral-large',
        object: 'model',
        created: 0,
        owned_by: 'mistral',
      },
    ]);
  });

  it('drops a catalogue model no route serves', async () => {
    availableModels.mockReturnValue(['gpt-5.4']);
    const { service } = buildService();
    const ids = (await service.list(context)).map((m) => m.id);
    expect(ids).toEqual(['gpt-5.4']);
  });

  it('applies the organization allowlist on top of the route table', async () => {
    const { service } = buildService(['gemini-3-flash-preview']);
    const ids = (await service.list(context)).map((m) => m.id);
    expect(ids).toEqual(['gemini-3-flash-preview']);
  });

  // The column defaults to `[]` for every organization that predates per-org
  // model management. Reading that as an allowlist empties every picker.
  it('treats an empty allowlist as no restriction', async () => {
    const { service } = buildService([]);
    expect(await service.list(context)).toHaveLength(3);
  });

  // An empty list reads as "this product is broken", and the model call itself
  // still fails loudly per model — so the fallback keeps the failure where it
  // is actionable. Mirrors apps/web's picker.
  it('falls back to the whole catalogue when the route table cannot be read', async () => {
    availableModels.mockImplementation(() => {
      throw new Error('no routes file');
    });
    const { service } = buildService();
    expect(await service.list(context)).toHaveLength(3);
  });

  it('falls back to the whole catalogue when no route matches the catalogue', async () => {
    availableModels.mockReturnValue(['some-internal-tier']);
    const { service } = buildService();
    expect(await service.list(context)).toHaveLength(3);
  });

  // An allowlist naming only models no route serves is a real, legible state:
  // an admin restricted the org to something this deployment cannot serve.
  it('returns an empty list when the allowlist and the routes do not meet', async () => {
    availableModels.mockReturnValue(['gpt-5.4']);
    const { service } = buildService(['mistral-large']);
    expect(await service.list(context)).toEqual([]);
  });

  describe('get', () => {
    it('returns one model', async () => {
      const { service } = buildService();
      await expect(service.get('gpt-5.4', context)).resolves.toMatchObject({
        id: 'gpt-5.4',
      });
    });

    it('404s for an unknown id', async () => {
      const { service } = buildService();
      await expect(
        service.get('no-such-model', context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // Same answer as an id that does not exist: the allowlist is another
    // tier's configuration, and a 403 would confirm the id is real.
    it('404s for a real model the organization is not allowed', async () => {
      const { service } = buildService(['gpt-5.4']);
      await expect(
        service.get('mistral-large', context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
