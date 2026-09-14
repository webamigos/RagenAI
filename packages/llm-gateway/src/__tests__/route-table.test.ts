import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  InvalidRouteTableError,
  findRoute,
  loadRouteTable,
  readRouteTableFile,
  routeTableFromEnv,
} from '../route-table';

const valid = {
  version: 1 as const,
  routes: {
    'gpt-5.4': { provider: 'azure', model: 'gpt-5.4' },
    'cohere-rerank-v3-5': {
      provider: 'bedrock',
      model: 'cohere.rerank-v3-5:0',
    },
    'gpt-oss-120b': {
      provider: 'openai-compatible',
      model: 'gpt-oss-120b',
      connection: 'scaleway',
    },
  },
};

describe('the route table', () => {
  it('accepts a well-formed table', () => {
    const table = loadRouteTable(valid);

    expect(findRoute(table, 'gpt-5.4')).toEqual({
      provider: 'azure',
      model: 'gpt-5.4',
    });
  });

  it('keeps the upstream name separate from the key it is filed under', () => {
    // Bedrock spells Cohere's reranker differently from how the app refers to
    // it. Collapsing the two would work for most models and silently break
    // this one.
    const table = loadRouteTable(valid);

    expect(findRoute(table, 'cohere-rerank-v3-5')?.model).toBe(
      'cohere.rerank-v3-5:0',
    );
  });

  it('answers with undefined for a model this deployment does not serve', () => {
    // Not an exception: an allowlist check and a model picker both want to act
    // on "no such route" as an ordinary answer.
    expect(findRoute(loadRouteTable(valid), 'no-such-model')).toBeUndefined();
  });

  it('refuses an unknown provider', () => {
    // The failure that matters: a typo here must stop the boot, not the first
    // chat turn that happens to pick this model.
    expect(() =>
      loadRouteTable({
        version: 1,
        routes: { m: { provider: 'litellm', model: 'm' } },
      }),
    ).toThrow(InvalidRouteTableError);
  });

  it('names what is wrong and where', () => {
    expect(() =>
      loadRouteTable({
        version: 1,
        routes: { 'gpt-5.4': { provider: 'azure' } },
      }),
    ).toThrow(/routes\.gpt-5\.4\.model/);
  });

  it('refuses a file shape from a future version', () => {
    expect(() => loadRouteTable({ ...valid, version: 2 })).toThrow(
      InvalidRouteTableError,
    );
  });

  it('cannot be mutated after loading', () => {
    const table = loadRouteTable(valid) as Record<string, unknown>;

    expect(() => {
      table['gpt-5.4'] = { provider: 'bedrock', model: 'anything' };
    }).toThrow();
  });

  describe('reading it from disk', () => {
    const dir = mkdtempSync(join(tmpdir(), 'llm-gateway-'));

    const yaml = `
version: 1
routes:
  # Why this model points where it does is the kind of thing that needs
  # saying next to the line — which is why this is YAML and not JSON.
  gpt-5.4:
    provider: azure
    model: gpt-5.4
`;

    it('reads and validates a file, comments and all', () => {
      const path = join(dir, 'routes.yaml');
      writeFileSync(path, yaml);

      expect(findRoute(readRouteTableFile(path), 'gpt-5.4')?.provider).toBe(
        'azure',
      );
    });

    it('says which file it could not read', () => {
      const path = join(dir, 'absent.yaml');

      expect(() => readRouteTableFile(path)).toThrow(new RegExp(path));
    });

    it('distinguishes malformed YAML from an invalid table', () => {
      const path = join(dir, 'broken.yaml');
      writeFileSync(path, 'routes:\n  - [unclosed');

      expect(() => readRouteTableFile(path)).toThrow(/not valid YAML/);
    });

    it('takes its path from LLM_ROUTES_PATH', () => {
      // What makes the shipped table a default rather than a law: a
      // deployment running one provider points this at its own file instead
      // of editing ours.
      const path = join(dir, 'mine.yaml');
      writeFileSync(path, yaml);

      const table = routeTableFromEnv({
        LLM_ROUTES_PATH: path,
      } as NodeJS.ProcessEnv);

      expect(Object.keys(table)).toEqual(['gpt-5.4']);
    });
  });
});
