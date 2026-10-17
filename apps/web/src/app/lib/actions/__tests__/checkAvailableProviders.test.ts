import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The picker has to answer for the path the app is actually on.
 *
 * It asked the proxy what it served regardless of `LLM_GATEWAY`, and the
 * proxy's credentials are not the app processes' — so under `native` it could
 * offer a model whose provider only the proxy container had a key for, and the
 * first click was a credentials error. Documented in the cutover runbook as the
 * reason demo needs Azure and Bedrock credentials it otherwise would not.
 */

const getAllowedModels = vi.hoisted(() => vi.fn(async () => [] as string[]));
const fetchLiteLLMModels = vi.hoisted(() => vi.fn());
const availableModelsFromGateway = vi.hoisted(() =>
  vi.fn(() => [] as string[]),
);
const describedModelsFromGateway = vi.hoisted(() =>
  vi.fn(
    () =>
      [] as {
        id: string;
        displayName: string;
        capabilities: string[];
      }[],
  ),
);
const missingModelsFromGateway = vi.hoisted(() =>
  vi.fn(async () => new Set<string>()),
);
const gatewayFromEnv = vi.hoisted(() =>
  vi.fn(() => ({
    availableModels: availableModelsFromGateway,
    describedModels: describedModelsFromGateway,
    missingModels: missingModelsFromGateway,
  })),
);

vi.mock('@/features/organizations/services/organization-settings', () => ({
  getAllowedModels,
}));

vi.mock('@/libs/litellm/client', () => ({ fetchLiteLLMModels }));

vi.mock('@ragenai/llm-gateway', () => ({
  gatewayFromEnv,
  // Mirrors the real default, which is `native`. Written as `=== 'native'`
  // this double kept answering "proxy" for an unset value long after the
  // real function stopped — a test double that lies in exactly the
  // direction that makes the suite pass.
  usingNativeGateway: () => process.env.LLM_GATEWAY !== 'litellm',
}));

vi.mock('@/app/lib/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { availableModels } from '@/app/components/config';
import { getAvailableModelsForOrganization } from '../checkAvailableProviders';

const saved = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();
  getAllowedModels.mockResolvedValue([]);
  describedModelsFromGateway.mockReturnValue([]);
  // `clearAllMocks` keeps implementations, so the unreadable-table test's
  // throwing gateway would otherwise leak into every test after it.
  missingModelsFromGateway.mockResolvedValue(new Set());
  gatewayFromEnv.mockImplementation(() => ({
    availableModels: availableModelsFromGateway,
    describedModels: describedModelsFromGateway,
    missingModels: missingModelsFromGateway,
  }));
});

afterEach(() => {
  process.env = { ...saved };
});

describe('LLM_GATEWAY=native', () => {
  beforeEach(() => {
    process.env.LLM_GATEWAY = 'native';
  });

  /** The bug: the proxy's answer is not this path's answer. */
  it('does not ask the proxy at all', async () => {
    availableModelsFromGateway.mockReturnValue([availableModels[0]!.value]);

    await getAvailableModelsForOrganization('org-1');

    expect(fetchLiteLLMModels).not.toHaveBeenCalled();
  });

  it('offers only models the gateway can actually serve', async () => {
    const served = availableModels[0]!.value;
    availableModelsFromGateway.mockReturnValue([served]);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models.map((m) => m.value)).toEqual([served]);
  });

  it('keeps the catalogue’s labels and capability flags', async () => {
    const entry = availableModels[0]!;
    availableModelsFromGateway.mockReturnValue([entry.value]);

    const [model] = await getAvailableModelsForOrganization('org-1');

    expect(model).toMatchObject({ value: entry.value, label: entry.label });
  });

  /**
   * An empty picker reads as "the product is broken" rather than "nothing is
   * configured", and the per-model call still fails loudly either way.
   */
  it('falls back to the catalogue when the route table cannot be read', async () => {
    gatewayFromEnv.mockImplementation(() => {
      throw new Error('cannot read route table');
    });

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models.length).toBe(availableModels.length);
  });

  it('falls back when the gateway serves nothing the picker knows', async () => {
    availableModelsFromGateway.mockReturnValue(['some-internal-embedding']);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models.length).toBe(availableModels.length);
  });

  it('still applies the organization allowlist on top', async () => {
    const [first, second] = availableModels;
    availableModelsFromGateway.mockReturnValue([first!.value, second!.value]);
    getAllowedModels.mockResolvedValue([second!.value]);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models.map((m) => m.value)).toEqual([second!.value]);
  });
});

/**
 * A model on the install's own hardware. The catalogue is compiled, so without
 * a route describing it the picker either does not show it or shows the cloud
 * name of an id it borrowed.
 */
describe('a route that describes itself', () => {
  it('is offered under its own name, grouped as local', async () => {
    availableModelsFromGateway.mockReturnValue(['local-chat']);
    describedModelsFromGateway.mockReturnValue([
      { id: 'local-chat', displayName: 'Bielik 11B', capabilities: ['chat'] },
    ]);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models).toEqual([
      expect.objectContaining({
        value: 'local-chat',
        label: 'Bielik 11B',
        origin: 'local',
      }),
    ]);
  });

  it('renames a catalogue id it aliases', async () => {
    const aliased = availableModels[0]!;
    availableModelsFromGateway.mockReturnValue([aliased.value]);
    describedModelsFromGateway.mockReturnValue([
      { id: aliased.value, displayName: 'Bielik 11B', capabilities: ['chat'] },
    ]);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models).toEqual([
      expect.objectContaining({ value: aliased.value, label: 'Bielik 11B' }),
    ]);
  });

  it('is not offered without the chat capability', async () => {
    availableModelsFromGateway.mockReturnValue([
      'local-embed',
      availableModels[0]!.value,
    ]);
    describedModelsFromGateway.mockReturnValue([
      { id: 'local-embed', displayName: 'BGE-M3', capabilities: [] },
    ]);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models.map((m) => m.value)).toEqual([availableModels[0]!.value]);
  });

  it('does not fall back to the catalogue when a described route removed the only model', async () => {
    const aliased = availableModels[0]!.value;
    availableModelsFromGateway.mockReturnValue([aliased]);
    describedModelsFromGateway.mockReturnValue([
      { id: aliased, displayName: 'Embedder', capabilities: [] },
    ]);

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models).toEqual([]);
  });

  it('hides a model its server does not have', async () => {
    // An Ollama model nobody pulled: the first answer would fail, so it is
    // not offered. The setup checklist says which to pull.
    availableModelsFromGateway.mockReturnValue(['local-chat', 'local-vision']);
    describedModelsFromGateway.mockReturnValue([
      { id: 'local-chat', displayName: 'Bielik 11B', capabilities: ['chat'] },
      {
        id: 'local-vision',
        displayName: 'Gemma 3 12B',
        capabilities: ['chat'],
      },
    ]);
    missingModelsFromGateway.mockResolvedValue(new Set(['local-vision']));

    const models = await getAvailableModelsForOrganization('org-1');

    expect(models.map((m) => m.value)).toEqual(['local-chat']);
  });
});
