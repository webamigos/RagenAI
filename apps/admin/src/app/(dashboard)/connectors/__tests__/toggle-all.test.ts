/**
 * The org form renders only the connectors the app-level defaults carry, but
 * an organization can legitimately hold a grant outside that list — the
 * catalogue is what the save action validates against, not the defaults. The
 * bulk checkbox used to replace the whole selection, so it dropped that grant
 * with no control ever having shown it.
 */
import { describe, expect, it } from 'vitest';

import { withVisibleToggled } from '../OrgConnectorsForm';

const visible = ['SLACK', 'notion'];

describe('withVisibleToggled', () => {
  it('selects every visible connector', () => {
    expect(withVisibleToggled(new Set(), visible, true)).toEqual(
      new Set(['SLACK', 'notion']),
    );
  });

  it('clears every visible connector', () => {
    expect(withVisibleToggled(new Set(visible), visible, false)).toEqual(
      new Set(),
    );
  });

  it('keeps a grant the form renders no checkbox for', () => {
    // 'hubspot' is in the catalogue but not in the app defaults, so it is not
    // among the visible values. Selecting all must not silently revoke it.
    expect(withVisibleToggled(new Set(['hubspot']), visible, true)).toEqual(
      new Set(['hubspot', 'SLACK', 'notion']),
    );
  });

  it('keeps it when clearing, too', () => {
    expect(
      withVisibleToggled(new Set(['hubspot', 'SLACK']), visible, false),
    ).toEqual(new Set(['hubspot']));
  });

  it('leaves the set it was given alone', () => {
    const selected = new Set(['hubspot']);

    withVisibleToggled(selected, visible, true);

    expect(selected).toEqual(new Set(['hubspot']));
  });
});
