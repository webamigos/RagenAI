import { describe, expect, it } from 'vitest';

import {
  buildUpdate,
  isPropagationGroup,
  previewOrg,
  type OrgCurrent,
  type ResolvedDefaults,
} from '../propagation';

const DEFAULTS: ResolvedDefaults = {
  limits: {
    storageLimitBytes: 5_000_000_000,
    projectStorageLimitBytes: 1_000_000_000,
    singleFileLimitBytes: 50_000_000,
    monthlyTokenLimit: null,
    monthlyCostLimitCents: 2000,
    monthlyMessageLimit: null,
    monthlyApiRequestLimit: 100,
    maxMembers: null,
  },
  allowedModels: ['gpt-5.4', 'gemini-2.5-flash'],
  rag: {
    multiQueryEnabled: true,
    docSummariesEnabled: true,
    contentModerationEnabled: false,
    rerankingEnabled: true,
  },
};

/** An organization with nothing set — the commonest shape on this page. */
function org(overrides: Partial<OrgCurrent> = {}): OrgCurrent {
  return {
    organizationId: 'org-1',
    organizationName: 'Acme',
    storageLimitBytes: null,
    projectStorageLimitBytes: null,
    singleFileLimitBytes: null,
    monthlyTokenLimit: null,
    monthlyCostLimitCents: null,
    monthlyMessageLimit: null,
    monthlyApiRequestLimit: null,
    maxMembers: null,
    allowedModels: [],
    multiQueryEnabled: null,
    docSummariesEnabled: null,
    contentModerationEnabled: null,
    rerankingEnabled: null,
    ...overrides,
  };
}

describe('isPropagationGroup', () => {
  it('accepts the three groups', () => {
    expect(isPropagationGroup('limits')).toBe(true);
    expect(isPropagationGroup('models')).toBe(true);
    expect(isPropagationGroup('rag')).toBe(true);
  });

  // The value arrives in a query string, so it must not reach the diff
  // unvalidated.
  it.each(['connectors', 'templates', 'constructor', '', null, 7])(
    'rejects %s',
    (value) => {
      expect(isPropagationGroup(value)).toBe(false);
    },
  );
});

describe('previewOrg — limits', () => {
  it('reports every field the default sets on an empty organization', () => {
    const preview = previewOrg('limits', DEFAULTS, org());

    expect(preview.changes.map((change) => change.field)).toEqual([
      'storageLimitBytes',
      'projectStorageLimitBytes',
      'singleFileLimitBytes',
      'monthlyCostLimitCents',
      'monthlyApiRequestLimit',
    ]);
    expect(preview.changes[0]).toEqual({
      field: 'storageLimitBytes',
      before: 'unset',
      after: '5000000000',
    });
  });

  /**
   * The half that was impossible to see before. A default of `null` means
   * "no limit", which cannot be told apart from "leave this alone", so those
   * fields are skipped — and an administrator who has just set a limit back
   * to unlimited needs to know the button will not clear it anywhere.
   */
  it('lists the fields the default leaves unset as skipped', () => {
    const preview = previewOrg('limits', DEFAULTS, org());

    expect(preview.skipped).toEqual([
      'monthlyTokenLimit',
      'monthlyMessageLimit',
      'maxMembers',
    ]);
  });

  it('does not offer to clear a limit the organization has and the default does not', () => {
    const preview = previewOrg(
      'limits',
      DEFAULTS,
      org({ maxMembers: 25, monthlyTokenLimit: 9_000n }),
    );

    const fields = preview.changes.map((change) => change.field);
    expect(fields).not.toContain('maxMembers');
    expect(fields).not.toContain('monthlyTokenLimit');
  });

  // `BigInt` in the column, `number` in the JSON default. Compared naively
  // these are never equal, and every organization would look like it needed
  // a write on every visit.
  it('treats 5000000000n and 5000000000 as equal', () => {
    const preview = previewOrg(
      'limits',
      DEFAULTS,
      org({ storageLimitBytes: 5_000_000_000n }),
    );

    expect(preview.changes.map((change) => change.field)).not.toContain(
      'storageLimitBytes',
    );
  });

  it('reports no changes for an organization that already matches', () => {
    const preview = previewOrg(
      'limits',
      DEFAULTS,
      org({
        storageLimitBytes: 5_000_000_000n,
        projectStorageLimitBytes: 1_000_000_000n,
        singleFileLimitBytes: 50_000_000n,
        monthlyCostLimitCents: 2000,
        monthlyApiRequestLimit: 100,
      }),
    );

    expect(preview.changes).toEqual([]);
  });
});

describe('previewOrg — models', () => {
  it('replaces the list when it differs', () => {
    const preview = previewOrg('models', DEFAULTS, org({ allowedModels: [] }));

    expect(preview.changes).toEqual([
      {
        field: 'allowedModels',
        before: 'no restriction',
        after: 'gpt-5.4, gemini-2.5-flash',
      },
    ]);
  });

  it('ignores ordering, so a reordered list is not a change', () => {
    const preview = previewOrg(
      'models',
      DEFAULTS,
      org({ allowedModels: ['gemini-2.5-flash', 'gpt-5.4'] }),
    );

    expect(preview.changes).toEqual([]);
  });

  it('skips the field entirely when the default is empty', () => {
    const preview = previewOrg(
      'models',
      { ...DEFAULTS, allowedModels: [] },
      org({ allowedModels: ['gpt-5.4'] }),
    );

    // An empty default means "no restriction", which must not be written over
    // an organization's deliberate allow-list.
    expect(preview.changes).toEqual([]);
    expect(preview.skipped).toEqual(['allowedModels']);
  });
});

describe('previewOrg — rag', () => {
  it('fills in an organization that has never had settings', () => {
    const preview = previewOrg('rag', DEFAULTS, org());

    expect(preview.changes).toEqual([
      { field: 'multiQueryEnabled', before: 'unset', after: 'true' },
      { field: 'docSummariesEnabled', before: 'unset', after: 'true' },
      { field: 'contentModerationEnabled', before: 'unset', after: 'false' },
      { field: 'rerankingEnabled', before: 'unset', after: 'true' },
    ]);
  });

  it('reports only the switches that differ', () => {
    const preview = previewOrg(
      'rag',
      DEFAULTS,
      org({
        multiQueryEnabled: true,
        docSummariesEnabled: true,
        contentModerationEnabled: true,
        rerankingEnabled: true,
      }),
    );

    expect(preview.changes).toEqual([
      { field: 'contentModerationEnabled', before: 'true', after: 'false' },
    ]);
  });

  /**
   * The dangerous case. With no `default_rag_pipeline_settings` row, filling
   * the gaps from apps/web's source constants would switch RAG features on or
   * off across every organization on the platform because a row was missing.
   */
  it('changes nothing when no RAG default has been configured', () => {
    const preview = previewOrg('rag', { ...DEFAULTS, rag: null }, org());

    expect(preview.changes).toEqual([]);
    expect(preview.skipped).toEqual([
      'multiQueryEnabled',
      'docSummariesEnabled',
      'contentModerationEnabled',
      'rerankingEnabled',
    ]);
  });
});

describe('buildUpdate', () => {
  it('returns null when nothing would move, so no row is written', () => {
    const preview = previewOrg(
      'models',
      DEFAULTS,
      org({ allowedModels: ['gpt-5.4', 'gemini-2.5-flash'] }),
    );

    expect(buildUpdate('models', DEFAULTS, preview)).toBeNull();
  });

  it('writes the byte columns as BigInt and the rest as numbers', () => {
    const preview = previewOrg('limits', DEFAULTS, org());
    const update = buildUpdate('limits', DEFAULTS, preview)!;

    expect(update.storageLimitBytes).toBe(5_000_000_000n);
    expect(update.projectStorageLimitBytes).toBe(1_000_000_000n);
    expect(update.singleFileLimitBytes).toBe(50_000_000n);
    expect(update.monthlyCostLimitCents).toBe(2000);
    expect(update.monthlyApiRequestLimit).toBe(100);
  });

  it('omits the fields the preview skipped', () => {
    const preview = previewOrg('limits', DEFAULTS, org());
    const update = buildUpdate('limits', DEFAULTS, preview)!;

    expect(update).not.toHaveProperty('monthlyTokenLimit');
    expect(update).not.toHaveProperty('monthlyMessageLimit');
    expect(update).not.toHaveProperty('maxMembers');
  });

  /**
   * The write must contain exactly the fields the preview promised. A field
   * in the update but not in the table on screen is a change nobody
   * consented to.
   */
  it('writes exactly the fields the preview reported', () => {
    for (const group of ['limits', 'models', 'rag'] as const) {
      const preview = previewOrg(group, DEFAULTS, org());
      const update = buildUpdate(group, DEFAULTS, preview);

      expect(Object.keys(update ?? {}).sort()).toEqual(
        preview.changes.map((change) => change.field).sort(),
      );
    }
  });

  it('writes nothing for rag when no default is configured', () => {
    const defaults = { ...DEFAULTS, rag: null };
    const preview = previewOrg('rag', defaults, org());

    expect(buildUpdate('rag', defaults, preview)).toBeNull();
  });
});
