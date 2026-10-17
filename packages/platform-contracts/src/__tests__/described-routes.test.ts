import { describe, expect, it } from 'vitest';

import {
  selectableModels,
  withDescribedRoutes,
  type RouteDescription,
} from '../llm/model-catalog';

const catalogue = selectableModels();
const ids = (models: { value: string }[]) => models.map((m) => m.value);

describe('withDescribedRoutes', () => {
  it('returns the catalogue unchanged when no route describes itself', () => {
    expect(withDescribedRoutes(catalogue, [])).toEqual(catalogue);
  });

  it('adds a local chat model the catalogue does not know', () => {
    const merged = withDescribedRoutes(catalogue, [
      { id: 'local-chat', displayName: 'Bielik 11B', capabilities: ['chat'] },
    ]);

    expect(merged.at(-1)).toEqual({
      value: 'local-chat',
      displayName: 'Bielik 11B',
      visible: true,
      origin: 'local',
      kind: 'chat',
    });
  });

  it('renames a catalogue id aliased to a local model, in place', () => {
    // The appliance routes `gpt-oss-120b` (hardcoded as the deep-thinking
    // default) to a local model. Showing "GPT OSS 120B" would name a model
    // that is not what answers.
    const aliased = catalogue.find((m) => m.value === 'gpt-oss-120b');
    expect(aliased).toBeDefined();

    const merged = withDescribedRoutes(catalogue, [
      { id: 'gpt-oss-120b', displayName: 'Bielik 11B', capabilities: ['chat'] },
    ]);
    const entry = merged.find((m) => m.value === 'gpt-oss-120b');

    expect(entry).toMatchObject({ displayName: 'Bielik 11B', origin: 'local' });
    // The cloud model's reasoning flags describe the cloud model.
    expect(entry).not.toHaveProperty('supportsReasoningEffort');
    expect(ids(merged).indexOf('gpt-oss-120b')).toBe(
      ids(catalogue).indexOf('gpt-oss-120b'),
    );
  });

  it('never offers a described route without the chat capability', () => {
    const described: RouteDescription[] = [
      { id: 'local-embed', displayName: 'BGE-M3', capabilities: [] },
      // And removes a catalogue chat entry this install serves as something else.
      { id: 'gpt-oss-120b', displayName: 'Embedder', capabilities: ['vision'] },
    ];

    const merged = ids(withDescribedRoutes(catalogue, described));

    expect(merged).not.toContain('local-embed');
    expect(merged).not.toContain('gpt-oss-120b');
  });

  it('appends local models in id order, after the catalogue', () => {
    const merged = withDescribedRoutes(catalogue, [
      { id: 'local-z', displayName: 'Z', capabilities: ['chat'] },
      { id: 'local-a', displayName: 'A', capabilities: ['chat'] },
    ]);

    expect(ids(merged).slice(-2)).toEqual(['local-a', 'local-z']);
  });
});
