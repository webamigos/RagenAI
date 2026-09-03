import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import { ExportButton } from '../ExportButton';

/**
 * The whole component is one URL. Getting it wrong means the file silently
 * covers a different slice than the table the reader is looking at.
 */
function hrefOf(markup: string): string {
  return /href="([^"]*)"/.exec(markup)?.[1] ?? '';
}

function render(props: Parameters<typeof ExportButton>[0]): string {
  return renderToStaticMarkup(<ExportButton {...props} />);
}

describe('ExportButton', () => {
  it('points at the dataset route with no query when there are no filters', () => {
    expect(hrefOf(render({ dataset: 'disk-usage' }))).toBe(
      '/api/export/disk-usage',
    );
  });

  it('carries the filters it was given', () => {
    const href = hrefOf(
      render({
        dataset: 'activity-log',
        extraParams: { days: '7', orgId: 'org-1' },
      }),
    );

    expect(href).toContain('/api/export/activity-log?');
    expect(href).toContain('days=7');
    expect(href).toContain('orgId=org-1');
  });

  // An undefined filter must not become `orgId=undefined`, which would match
  // no organization and silently export nothing.
  it('omits undefined and empty filters rather than sending them', () => {
    const href = hrefOf(
      render({
        dataset: 'incidents',
        extraParams: { days: '30', orgId: undefined, severity: '' },
      }),
    );

    expect(href).not.toContain('orgId');
    expect(href).not.toContain('severity');
    expect(href).toContain('days=30');
  });

  it('encodes a value that would otherwise break the query string', () => {
    const href = hrefOf(
      render({
        dataset: 'activity-log',
        extraParams: { search: 'a&b=c d' },
      }),
    );

    expect(href).toContain('search=a%26b%3Dc+d');
  });

  it('renders a download link, so the browser handles it rather than the router', () => {
    const markup = render({ dataset: 'ai-usage' });

    expect(markup).toContain('download');
    expect(markup).toContain('<a ');
  });
});
