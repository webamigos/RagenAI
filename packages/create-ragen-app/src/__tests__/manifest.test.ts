import { describe, expect, it } from 'vitest';

import { entriesForTarget, MANIFEST } from '../manifest';

describe('MANIFEST', () => {
  it('gives every entry at least one target', () => {
    for (const entry of MANIFEST) {
      expect(entry.targets.length).toBeGreaterThan(0);
    }
  });

  it('gives every local-default entry a non-empty value', () => {
    for (const entry of MANIFEST) {
      if (entry.strategy === 'local-default') {
        expect(entry.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('never targets the same key twice for the same target', () => {
    for (const target of ['root', 'admin'] as const) {
      const keys = entriesForTarget(target).map((entry) => entry.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('entriesForTarget', () => {
  it('only returns entries whose targets include the given target', () => {
    for (const entry of entriesForTarget('admin')) {
      expect(entry.targets).toContain('admin');
    }
  });
});
