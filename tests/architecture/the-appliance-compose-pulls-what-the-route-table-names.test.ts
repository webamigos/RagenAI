import { readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * The appliance's Ollama has the models its route table names — no fewer, no
 * more.
 *
 * `docker-compose.appliance.yml` pulls a list of models; the route table sends
 * calls to them. Nothing connects the two but this test. A model the table
 * routes and the list omits fails on its first call, on a box that may have
 * no internet to fetch it; a model the list pulls and the table never names
 * is gigabytes for nothing.
 *
 * Step A1 of docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function routedModels(): Set<string> {
  const table = parseYaml(read('infra/llm-gateway/routes.appliance.yaml')) as {
    routes: Record<string, { connection?: string; model: string }>;
  };
  return new Set(
    Object.values(table.routes)
      .filter((route) => route.connection === 'ollama')
      .map((route) => route.model),
  );
}

function pulledModels(): Set<string> {
  const match = /APPLIANCE_MODELS:\s*\$\{APPLIANCE_MODELS:-([^}]*)\}/.exec(
    read('docker-compose.appliance.yml'),
  );
  expect(match, 'APPLIANCE_MODELS default not found').not.toBeNull();
  return new Set(match![1]!.trim().split(/\s+/));
}

describe('the appliance compose file', () => {
  it('pulls every model the appliance route table routes, and nothing else', () => {
    expect([...pulledModels()].sort()).toEqual([...routedModels()].sort());
  });

  it('points the apps at the appliance table and the compose Ollama', () => {
    const compose = parseYaml(read('docker-compose.appliance.yml'), {
      merge: true,
    }) as {
      services: Record<string, { environment?: Record<string, string> }>;
    };
    for (const app of ['web', 'api', 'worker']) {
      expect(compose.services[app]?.environment).toMatchObject({
        LLM_ROUTES_PATH: '/app/infra/llm-gateway/routes.appliance.yaml',
        LLM_OLLAMA_BASE_URL: 'http://ollama:11434/v1',
        DOCLING_STRICT: '1',
      });
    }
  });
});
