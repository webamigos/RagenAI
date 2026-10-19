import { describe, expect, it } from 'vitest';

import {
  APPLIANCE_PROFILES,
  APPLIANCE_TIERS,
  availableApplianceProfiles,
  composeFileValue,
  DEFAULT_APPLIANCE_TIER,
  findOffMachineRoutes,
  findUnroutedModels,
  parseRouteTable,
  renderApplianceRouteTable,
  resolveApplianceSelection,
} from '../appliance';

const LOCAL_TABLE = [
  '# yaml-language-server: $schema=./routes.schema.json',
  'version: 1',
  '',
  'routes:',
  '  # The answer model.',
  '  local-chat:',
  '    provider: openai-compatible',
  '    connection: ollama',
  '    model: SpeakLeash/bielik-11b-v2.3-instruct:Q4_K_M',
  '    capabilities: [chat]',
  '  local-embed:',
  "    provider: 'openai-compatible'",
  '    connection: ollama # the same server',
  '    model: bge-m3',
].join('\n');

describe('appliance profiles', () => {
  it('offers local and lists hybrid as not available, with the reason', () => {
    expect(availableApplianceProfiles().map((p) => p.id)).toEqual(['local']);
    const hybrid = APPLIANCE_PROFILES.find((p) => p.id === 'hybrid');
    expect(hybrid?.available).toBe(false);
    expect(hybrid?.unavailableReason).toMatch(/A1b/);
  });
});

describe('appliance tiers', () => {
  it('has one tier, the default, and says it is not measured', () => {
    // The spec offers no tier before A5 has measured it. Flipping this to
    // true belongs to the change that commits those numbers.
    expect(APPLIANCE_TIERS.map((t) => t.id)).toEqual([DEFAULT_APPLIANCE_TIER]);
    expect(APPLIANCE_TIERS.every((t) => !t.measured)).toBe(true);
    expect(APPLIANCE_TIERS[0]?.label).toMatch(/not yet measured/);
  });

  it('writes the env a local install needs and no cloud key', () => {
    const env = APPLIANCE_TIERS[0]?.envUpdates ?? {};
    expect(env).toMatchObject({
      DEFAULT_MODEL: 'local-chat',
      EMBEDDINGS_MODEL: 'local-embed',
      VECTOR_SIZE: '1024',
      DOCLING_STRICT: '1',
    });
    expect(Object.keys(env).filter((key) => /API_KEY$/.test(key))).toEqual([
      'LLM_OLLAMA_API_KEY',
    ]);
  });
});

describe('resolveApplianceSelection', () => {
  it('stacks the appliance compose files, with the GPU file last when asked', () => {
    const cpu = resolveApplianceSelection('local', 'default', { gpu: false });
    expect(cpu.composeFiles).toEqual([
      'docker-compose.yml',
      'docker-compose.fullapp.yml',
      'docker-compose.appliance.yml',
    ]);

    const gpu = resolveApplianceSelection('local', 'default', { gpu: true });
    expect(gpu.composeFiles.at(-1)).toBe('docker-compose.appliance.gpu.yml');
    expect(gpu.gpu).toBe(true);
  });

  it('copies the env, so a caller cannot change the tier table', () => {
    const selection = resolveApplianceSelection('local', 'default', {
      gpu: false,
    });
    selection.envUpdates.DEFAULT_MODEL = 'changed';
    expect(APPLIANCE_TIERS[0]?.envUpdates.DEFAULT_MODEL).toBe('local-chat');
  });

  it('refuses an unavailable profile and an unknown tier', () => {
    expect(() =>
      resolveApplianceSelection('hybrid', 'default', { gpu: false }),
    ).toThrow(/not available/);
    expect(() =>
      resolveApplianceSelection('local', 'nope', { gpu: false }),
    ).toThrow(/Unknown appliance tier/);
  });
});

describe('parseRouteTable', () => {
  it('reads each route with its provider and connection, ignoring comments and quotes', () => {
    expect(parseRouteTable(LOCAL_TABLE)).toEqual([
      {
        name: 'local-chat',
        provider: 'openai-compatible',
        connection: 'ollama',
      },
      {
        name: 'local-embed',
        provider: 'openai-compatible',
        connection: 'ollama',
      },
    ]);
  });

  it('reads nothing outside the routes map', () => {
    expect(
      parseRouteTable('version: 1\nother:\n  thing:\n    provider: x\n'),
    ).toEqual([]);
  });
});

describe('findOffMachineRoutes', () => {
  it('passes a table whose every route is the local server', () => {
    expect(findOffMachineRoutes(LOCAL_TABLE, ['ollama'])).toEqual([]);
  });

  it('names a cloud provider', () => {
    const table = `${LOCAL_TABLE}\n  gpt-4o:\n    provider: openai\n    model: gpt-4o\n`;
    expect(findOffMachineRoutes(table, ['ollama'])).toEqual([
      'gpt-4o: provider openai is not a local server',
    ]);
  });

  it('names an openai-compatible route on a connection this install does not run', () => {
    // `scaleway` is openai-compatible too — and a cloud.
    const table = `${LOCAL_TABLE}\n  mistral:\n    provider: openai-compatible\n    connection: scaleway\n    model: m\n`;
    expect(findOffMachineRoutes(table, ['ollama'])).toEqual([
      'mistral: connection scaleway is not one this install runs (ollama)',
    ]);
  });

  it('treats a table it cannot read as a failure, not a pass', () => {
    expect(findOffMachineRoutes('', ['ollama'])).toEqual([
      'no routes could be read from the table',
    ]);
  });
});

describe('findUnroutedModels', () => {
  it('lists each *_MODEL value the table has no route for, once', () => {
    expect(
      findUnroutedModels(LOCAL_TABLE, {
        DEFAULT_MODEL: 'local-chat',
        REPHRASE_MODEL: 'local-small',
        SUMMARY_MODEL: 'local-small',
        VECTOR_SIZE: '1024',
      }),
    ).toEqual(['local-small']);
  });
});

describe('renderApplianceRouteTable', () => {
  it('keeps the source table whole, under a header naming profile and tier', () => {
    const selection = resolveApplianceSelection('local', 'default', {
      gpu: false,
    });
    const rendered = renderApplianceRouteTable(LOCAL_TABLE, selection);
    expect(rendered).toContain('profile: local, tier: default');
    expect(rendered).toContain('infra/llm-gateway/routes.appliance.yaml');
    expect(rendered.endsWith(LOCAL_TABLE)).toBe(true);
    // The copy is still a local-only table.
    expect(findOffMachineRoutes(rendered, ['ollama'])).toEqual([]);
  });
});

describe('composeFileValue', () => {
  it('joins with the separator Compose splits COMPOSE_FILE by', () => {
    expect(composeFileValue(['a.yml', 'b.yml'], ':')).toBe('a.yml:b.yml');
    expect(composeFileValue(['a.yml', 'b.yml'], ';')).toBe('a.yml;b.yml');
  });
});
