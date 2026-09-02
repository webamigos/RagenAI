import { describe, expect, it } from 'vitest';
import { MODEL_REGISTRY, selectableModels } from '@ragenai/platform-contracts';

import {
  budgetHasDrifted,
  findOfferableButUnserved,
  findStrandedOrgs,
} from '../analysis';

const SERVED = ['gpt-5.4', 'claude-sonnet-4-6', 'gemini-3-flash-preview'];

describe('findOfferableButUnserved', () => {
  it('reports a user-visible model the proxy does not serve', () => {
    const unserved = findOfferableButUnserved(SERVED);

    expect(unserved.map((m) => m.id)).toContain('gpt-5.4-mini');
    expect(unserved.map((m) => m.id)).not.toContain('gpt-5.4');
  });

  // Internal models are never offered on the allowlist, so reporting them as
  // "offerable but unserved" would be noise an operator has to learn to ignore.
  it('never reports an internal model', () => {
    const internal = Object.entries(MODEL_REGISTRY)
      .filter(([, e]) => !e.visible)
      .map(([id]) => id);

    const reported = findOfferableButUnserved([]).map((m) => m.id);

    for (const id of internal) {
      expect(reported).not.toContain(id);
    }
  });

  it('reports nothing when the proxy serves everything selectable', () => {
    const everything = selectableModels().map((m) => m.value);

    expect(findOfferableButUnserved(everything)).toEqual([]);
  });

  it('carries the display name, so the operator sees what the picker shows', () => {
    const unserved = findOfferableButUnserved(SERVED);
    const mini = unserved.find((m) => m.id === 'gpt-5.4-mini');

    expect(mini?.label).toBe(MODEL_REGISTRY['gpt-5.4-mini'].displayName);
  });
});

describe('findStrandedOrgs', () => {
  it('reports an organization whose allowlist matches nothing served', () => {
    const stranded = findStrandedOrgs(
      [{ id: 'o1', name: 'Acme', allowedModels: ['gpt-5.4-mini'] }],
      SERVED,
    );

    expect(stranded).toEqual([{ id: 'o1', name: 'Acme' }]);
  });

  /**
   * The distinction the whole page turns on: empty means "no restriction", not
   * "nothing allowed". Reporting these would flag every unrestricted
   * organization on the platform.
   */
  it('does not report an organization with an empty allowlist', () => {
    expect(
      findStrandedOrgs([{ id: 'o1', name: 'Acme', allowedModels: [] }], SERVED),
    ).toEqual([]);
  });

  it('does not report an organization with one served model among unserved ones', () => {
    expect(
      findStrandedOrgs(
        [
          {
            id: 'o1',
            name: 'Acme',
            allowedModels: ['gpt-5.4-mini', 'gpt-5.4'],
          },
        ],
        SERVED,
      ),
    ).toEqual([]);
  });

  // The original defect: provider-prefixed IDs match no LiteLLM model.
  it('reports an organization holding provider-prefixed IDs', () => {
    const stranded = findStrandedOrgs(
      [
        {
          id: 'o1',
          name: 'Legacy',
          allowedModels: ['openai/gpt-5.3-chat', 'anthropic/claude-sonnet-4.6'],
        },
      ],
      SERVED,
    );

    expect(stranded).toEqual([{ id: 'o1', name: 'Legacy' }]);
  });

  it('reports every stranded organization, not just the first', () => {
    const stranded = findStrandedOrgs(
      [
        { id: 'o1', name: 'A', allowedModels: ['nope'] },
        { id: 'o2', name: 'B', allowedModels: ['gpt-5.4'] },
        { id: 'o3', name: 'C', allowedModels: ['also-nope'] },
      ],
      SERVED,
    );

    expect(stranded.map((o) => o.id)).toEqual(['o1', 'o3']);
  });

  // A proxy that answered with nothing is an outage, and every restricted
  // organization is stranded by it — which is true, and worth saying.
  it('reports restricted organizations when the proxy serves nothing', () => {
    expect(
      findStrandedOrgs(
        [{ id: 'o1', name: 'Acme', allowedModels: ['gpt-5.4'] }],
        [],
      ),
    ).toHaveLength(1);
  });
});

describe('budgetHasDrifted', () => {
  it('is false when cents and dollars agree', () => {
    expect(budgetHasDrifted(5000, 50)).toBe(false);
  });

  it('is false when both mean unlimited', () => {
    expect(budgetHasDrifted(null, null)).toBe(false);
  });

  it.each([
    ['the proxy never received the limit', 5000, null],
    ['the proxy holds a stale limit', 5000, 25],
    ['the limit was cleared but the proxy still caps', null, 50],
  ])('is true when %s', (_label, cents, proxy) => {
    expect(budgetHasDrifted(cents, proxy)).toBe(true);
  });
});
