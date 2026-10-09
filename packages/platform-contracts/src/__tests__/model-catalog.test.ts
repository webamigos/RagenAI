import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { AI_PRICING } from '../pricing/ai-pricing';
import {
  MODEL_REGISTRY,
  isChatModel,
  isReasoningModel,
  normalizeModelId,
  selectableModels,
  supportsReasoningEffort,
} from '../llm/model-catalog';

const REPO_ROOT = path.resolve(
  fileURLToPath(new URL('../../../../', import.meta.url)),
);

/**
 * The keys are LiteLLM model IDs. `getAvailableModelsForOrganization()` and
 * the admin allowlist both do membership tests against them, so a key that is
 * not a real ID does not narrow a list — it empties it.
 */
describe('model IDs', () => {
  it('never carry a provider prefix', () => {
    const prefixed = Object.keys(MODEL_REGISTRY).filter((id) =>
      id.includes('/'),
    );
    expect(prefixed).toEqual([]);
  });

  it('are lower-case, so a case mismatch cannot fail a membership test', () => {
    const wrong = Object.keys(MODEL_REGISTRY).filter(
      (id) => id !== id.toLowerCase(),
    );
    expect(wrong).toEqual([]);
  });

  it('are unique once whitespace is ignored', () => {
    const trimmed = Object.keys(MODEL_REGISTRY).map((id) => id.trim());
    expect(new Set(trimmed).size).toBe(trimmed.length);
  });
});

describe('every entry', () => {
  it.each(Object.entries(MODEL_REGISTRY))(
    '%s has a display name and a grouping origin',
    (_id, entry) => {
      expect(entry.displayName.trim()).not.toBe('');
      expect(['openai', 'google', 'anthropic', 'mistral']).toContain(
        entry.origin,
      );
      expect(typeof entry.visible).toBe('boolean');
    },
  );

  // `supportsReasoningEffort` is the OpenAI `reasoning_effort` contract
  // specifically; a model can reason (Claude, Gemini) without accepting it,
  // but not the other way round.
  it('only claims reasoning_effort support on a reasoning model', () => {
    const inconsistent = Object.entries(MODEL_REGISTRY)
      .filter(([, e]) => e.supportsReasoningEffort && !e.reasoning)
      .map(([id]) => id);

    expect(inconsistent).toEqual([]);
  });
});

describe('selectableModels', () => {
  it('returns the visible entries with their ID attached', () => {
    const selectable = selectableModels();

    expect(selectable.length).toBeGreaterThan(0);
    for (const model of selectable) {
      expect(MODEL_REGISTRY[model.value].visible).toBe(true);
      expect(model.displayName).toBe(MODEL_REGISTRY[model.value].displayName);
    }
  });

  it('excludes every internal model', () => {
    const values = new Set(selectableModels().map((m) => m.value));
    const internal = Object.entries(MODEL_REGISTRY)
      .filter(([, e]) => !e.visible)
      .map(([id]) => id);

    for (const id of internal) {
      expect(values.has(id)).toBe(false);
    }
  });

  it('keeps the embedding and rerank models internal', () => {
    // These are chosen by the ingest and retrieval pipelines, never by a user,
    // so offering them in a picker or an allowlist is meaningless.
    for (const id of [
      'bge-multilingual-gemma2',
      'qwen3-embedding-8b',
      'cohere-rerank-v3-5',
    ]) {
      expect(MODEL_REGISTRY[id]?.visible).toBe(false);
    }
  });
});

describe('isChatModel', () => {
  // The answer-model check in apps/api asks this, and so does the list of
  // models its 400 offers instead. A route says nothing about it: the route
  // table serves the embedding models too.
  it.each([
    'bge-multilingual-gemma2',
    'qwen3-embedding-8b',
    'cohere-embed-multilingual-v3',
    'cohere-rerank-v3-5',
  ])('is false for the internal non-chat model %s', (id) => {
    expect(isChatModel(id)).toBe(false);
  });

  it('is true for a chat model, visible or internal', () => {
    expect(isChatModel('gpt-5.4')).toBe(true);
    expect(isChatModel('gemini-2.5-flash')).toBe(true);
  });

  // An operator may route models of their own that no entry describes.
  it('is true for an id the catalogue does not know', () => {
    expect(isChatModel('my-own-llm')).toBe(true);
  });

  it('holds for every model a user can pick', () => {
    const notChat = selectableModels()
      .filter((m) => !isChatModel(m.value))
      .map((m) => m.value);

    expect(notChat).toEqual([]);
  });
});

describe('helpers', () => {
  it('report reasoning support from the registry', () => {
    expect(isReasoningModel('claude-sonnet-4-6')).toBe(true);
    expect(isReasoningModel('gpt-5.4')).toBe(false);
  });

  it('report reasoning_effort support from the registry', () => {
    expect(supportsReasoningEffort('gpt-oss-120b')).toBe(true);
    expect(supportsReasoningEffort('claude-sonnet-4-6')).toBe(false);
  });

  // An unknown ID must answer "no", not throw — these are called with whatever
  // model a thread was saved with, including one since removed from the proxy.
  it.each([
    ['isReasoningModel', isReasoningModel],
    ['supportsReasoningEffort', supportsReasoningEffort],
  ])('%s returns false for an unknown model', (_name, fn) => {
    expect(fn('no-such-model')).toBe(false);
  });

  it('passes an ID through normalizeModelId unchanged', () => {
    expect(normalizeModelId('gpt-5.4')).toBe('gpt-5.4');
  });
});

/**
 * Advisory direction only. Which models a deployment serves is a per-deployment
 * choice — it points `LLM_ROUTES_PATH` at its own table — and an entry here for
 * a model this deployment does not route is harmless, because nothing matches
 * it. The reverse is not harmless: a model the table serves and users can pick,
 * with no entry here, gets an inferred label and no visibility decision.
 *
 * Read from the route table since B6, which is the same question asked of the
 * file that answers it now.
 */
describe('against infra/llm-gateway/routes.yaml', () => {
  const table = readFileSync(
    path.join(REPO_ROOT, 'infra/llm-gateway/routes.yaml'),
    'utf8',
  );

  // Two-space keys under `routes:` are the model ids; `provider`, `model`,
  // `connection` and `location` are four-space properties of one.
  const routed = table
    .split('\n')
    .map((line) => line.match(/^ {2}([A-Za-z0-9][\w.-]*):\s*$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => m[1]);

  it('found the routed model ids', () => {
    expect(routed.length).toBeGreaterThan(3);
  });

  it('knows every model the route table serves', () => {
    const unknown = routed.filter((name) => !MODEL_REGISTRY[name]);
    expect(unknown).toEqual([]);
  });

  // The Railway template serves a whole install from one OPENROUTER_API_KEY,
  // and that only holds while the shipped table carries a chat route and an
  // embeddings route for it. A route with no price records its usage at cost 0
  // and slips under the monthly ceiling, so the pair is checked here.
  it('serves chat and embeddings from OpenRouter, priced, with the right kinds', () => {
    const openrouter = [
      'claude-haiku-4-5-openrouter',
      'text-embedding-3-small-openrouter',
    ];

    expect(routed).toEqual(expect.arrayContaining(openrouter));
    expect(MODEL_REGISTRY['claude-haiku-4-5-openrouter']?.kind ?? 'chat').toBe(
      'chat',
    );
    expect(MODEL_REGISTRY['text-embedding-3-small-openrouter']?.kind).toBe(
      'embedding',
    );
    for (const id of openrouter) {
      expect(AI_PRICING.litellm?.[id]).toBeDefined();
    }
    expect(table).toMatch(
      /claude-haiku-4-5-openrouter:\n\s+provider: openrouter/,
    );
    expect(table).toMatch(
      /text-embedding-3-small-openrouter:\n\s+provider: openrouter/,
    );
  });
});
