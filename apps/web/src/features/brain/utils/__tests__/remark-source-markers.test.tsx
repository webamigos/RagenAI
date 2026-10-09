import { render } from '@testing-library/react';
import ReactMarkdown from 'react-markdown';
import { describe, expect, it } from 'vitest';

import { remarkSourceMarkers } from '../page-body';

const anchors = (n: number) => (n <= 2 ? `source-s${n}` : null);
const html = (markdown: string) =>
  render(
    <ReactMarkdown remarkPlugins={[remarkSourceMarkers(anchors)]}>
      {markdown}
    </ReactMarkdown>,
  ).container.innerHTML;

describe('remarkSourceMarkers', () => {
  it('links each marker in prose to its source', () => {
    const out = html('- Claim one. [1]\n- Claim two. [2]');
    expect(out).toContain('<a href="#source-s1">[1]</a>');
    expect(out).toContain('<a href="#source-s2">[2]</a>');
  });

  it('leaves a marker with no source as text', () => {
    expect(html('Claim. [3]')).toBe('<p>Claim. [3]</p>');
  });

  it('does not rewrite an existing link or code', () => {
    const out = html(
      'See [1](https://example.com), `x[1]` and\n\n```\ny[2]\n```',
    );
    expect(out).toContain('<a href="https://example.com">1</a>');
    expect(out).toContain('<code>x[1]</code>');
    expect(out).toContain('y[2]');
    expect(out).not.toContain('#source-');
  });
});
