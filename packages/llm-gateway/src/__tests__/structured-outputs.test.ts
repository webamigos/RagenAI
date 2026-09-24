import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

import { PROVIDER_FACTORIES } from '../providers';
import { loadRouteTable } from '../route-table';

/**
 * With `supportsStructuredOutputs` off, the AI SDK's OpenAI-compatible client
 * drops the JSON Schema and sends plain JSON mode — it only logs a warning.
 * Mistral on Scaleway then guessed the shape (`source`/`target` for
 * `from`/`to`, no `title`, no `entityKey`) and every Brain extraction on the
 * demo failed validation.
 */
const compatible = (structuredOutputs?: boolean) =>
  PROVIDER_FACTORIES['openai-compatible'](
    {
      provider: 'openai-compatible',
      model: 'mistral-small-3.2-24b-instruct-2506',
      connection: 'scaleway',
      ...(structuredOutputs === undefined ? {} : { structuredOutputs }),
    },
    { apiKey: 'k', baseUrl: 'https://api.example/v1' },
  ) as unknown as { supportsStructuredOutputs: boolean };

describe('structured outputs on an openai-compatible route', () => {
  it('is off unless the route says so', () => {
    expect(compatible().supportsStructuredOutputs).toBe(false);
  });

  it('reaches the model when the route turns it on', () => {
    expect(compatible(true).supportsStructuredOutputs).toBe(true);
  });

  it('is accepted by the route table', () => {
    const table = loadRouteTable({
      version: 1,
      routes: {
        m: {
          provider: 'openai-compatible',
          model: 'm',
          connection: 'c',
          structuredOutputs: true,
        },
      },
    });
    expect(table.m?.structuredOutputs).toBe(true);
  });

  it('is on for the shipped Mistral route, which Brain and RAG scoring use', () => {
    const file = parse(
      readFileSync(
        join(import.meta.dirname, '../../../../infra/llm-gateway/routes.yaml'),
        'utf8',
      ),
    ) as { routes: Record<string, { structuredOutputs?: boolean }> };
    expect(file.routes['mistral-small-3.2']?.structuredOutputs).toBe(true);
  });
});
