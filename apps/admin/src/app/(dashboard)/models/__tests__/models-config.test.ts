import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, selectableModels } from '@ragenai/platform-contracts';

import {
  allModels,
  groupModelsByOrigin,
  originDisplayNames,
  originOrder,
} from '../models-config';

/**
 * The catalogue's own invariants — no provider prefix, every ID known, every
 * served model offerable — are tested in `@ragenai/platform-contracts`, against
 * `infra/litellm/config.yaml` directly. What is left for this file is this
 * app's *derivation* of it: the page turns the catalogue into checkboxes
 * grouped by origin, and a mistake there drops a group silently rather than
 * failing.
 */
describe('the admin model allowlist', () => {
  it('offers exactly the models a user can pick in chat', () => {
    expect(allModels.map((m) => m.value).sort()).toEqual(
      selectableModels()
        .map((m) => m.value)
        .sort(),
    );
  });

  it('labels each model the way the chat picker does', () => {
    for (const model of allModels) {
      expect(model.label).toBe(MODEL_REGISTRY[model.value].displayName);
    }
  });

  it('never offers an internal model (rephrase, summary, embeddings, rerank)', () => {
    const internal = allModels.filter(
      (m) => MODEL_REGISTRY[m.value].visible === false,
    );
    expect(internal).toEqual([]);
  });
});

describe('origin grouping', () => {
  // An origin missing from `originOrder` drops its whole group from the page:
  // the models simply do not render, with no error anywhere.
  it('orders and names every origin the catalogue can produce', () => {
    const origins = new Set(
      Object.values(MODEL_REGISTRY).map((entry) => entry.origin),
    );

    for (const origin of origins) {
      expect(originOrder).toContain(origin);
      expect(originDisplayNames[origin]).toBeTruthy();
    }
  });

  it('renders every offered model into exactly one group', () => {
    const flattened = groupModelsByOrigin(allModels).flatMap((g) =>
      g.models.map((m) => m.value),
    );

    expect(flattened.sort()).toEqual(allModels.map((m) => m.value).sort());
    expect(new Set(flattened).size).toBe(flattened.length);
  });

  it('emits no empty group', () => {
    for (const group of groupModelsByOrigin(allModels)) {
      expect(group.models.length).toBeGreaterThan(0);
    }
  });

  it('groups in the declared origin order', () => {
    const rendered = groupModelsByOrigin(allModels).map((g) => g.origin);
    expect(rendered).toEqual(originOrder.filter((o) => rendered.includes(o)));
  });
});
