/**
 * A connector an operator added has no message key, and next-intl renders the
 * key path when one is missing — so the panel showed `providers.notion.name`
 * where the catalogue's own label belonged.
 */
import { describe, expect, it } from 'vitest';

import { connectorDisplayName } from '../connector-display-name';

const translations: Record<string, string> = {
  'SLACK.name': 'Slack',
};
const has = (key: string) => key in translations;
const translate = (key: string) => translations[key];

describe('connectorDisplayName', () => {
  it('prefers the translation for a built-in', () => {
    expect(
      connectorDisplayName(has, translate, 'SLACK', 'Slack (catalogue)'),
    ).toBe('Slack');
  });

  it('falls back to the catalogue label for an operator entry', () => {
    expect(connectorDisplayName(has, translate, 'notion', 'Notion')).toBe(
      'Notion',
    );
  });

  it('never renders the key path', () => {
    expect(connectorDisplayName(has, translate, 'notion', 'Notion')).not.toBe(
      'notion.name',
    );
  });

  it('shows the slug when the entry has no label either', () => {
    expect(connectorDisplayName(has, translate, 'notion', 'notion')).toBe(
      'notion',
    );
  });
});
