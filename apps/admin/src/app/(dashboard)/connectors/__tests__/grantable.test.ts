/**
 * Both allowlist forms seed their selection from stored values and render
 * their controls from the catalogue. A slug in the first and not the second
 * therefore stayed selected with no control to clear it — and the save action
 * validates every submitted slug against `McpCatalogEntry`, so the page
 * rejected every save until the row came back.
 */
import { describe, expect, it } from 'vitest';

import { grantable, type GrantableConnector } from '../DefaultConnectorsForm';

const catalogue: GrantableConnector[] = [
  { value: 'SLACK', label: 'Slack', icon: null, enabled: true },
  { value: 'notion', label: 'Notion', icon: null, enabled: false },
];

describe('grantable', () => {
  it('keeps a slug the catalogue carries', () => {
    expect(grantable(catalogue, 'SLACK')).toBe(true);
  });

  it('keeps a disabled entry, which is still a row', () => {
    // Disabled is not deleted: the save action counts rows by slug, so a
    // disabled entry validates. Filtering it out here would silently revoke
    // an organization's grant the moment an operator paused the connector.
    expect(grantable(catalogue, 'notion')).toBe(true);
  });

  it('drops a slug whose entry was deleted', () => {
    expect(grantable(catalogue, 'retired-thing')).toBe(false);
  });

  it('is what the forms filter their stored values through', () => {
    const stored = ['SLACK', 'retired-thing', 'notion'];

    expect(stored.filter((value) => grantable(catalogue, value))).toEqual([
      'SLACK',
      'notion',
    ]);
  });
});
