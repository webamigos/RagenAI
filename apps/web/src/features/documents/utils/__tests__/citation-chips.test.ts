import { describe, expect, it } from 'vitest';

import { markCitationsInHtml } from '../citation-chips';

const options = {
  sourceCount: 3,
  anchorPrefix: 'src-m1',
  label: (n: number) => `Source ${n}`,
};

describe('markCitationsInHtml', () => {
  it('turns a marker into a chip that links to its source', () => {
    const html = markCitationsInHtml('<p>The limit is 50 MB [2].</p>', options);

    expect(html).toContain('href="#src-m1-2"');
    expect(html).toContain('class="citation-chip"');
    expect(html).toContain('data-citation="2"');
    expect(html).toContain('aria-label="Source 2"');
    // The brackets go; the chip carries the number.
    expect(html).not.toContain('[2]');
    expect(html).toContain('The limit is 50 MB ');
  });

  it('makes one chip per number in a run', () => {
    const html = markCitationsInHtml('<p>Both agree [1][3].</p>', options);

    expect(html).toContain('href="#src-m1-1"');
    expect(html).toContain('href="#src-m1-3"');
  });

  it('leaves a number no source could answer for as plain text', () => {
    const html = markCitationsInHtml('<p>Invented [9].</p>', options);

    expect(html).toBe('<p>Invented [9].</p>');
  });

  it('keeps the invalid half of a mixed run while chipping the valid half', () => {
    const html = markCitationsInHtml('<p>Mixed [1][9].</p>', options);

    expect(html).toContain('href="#src-m1-1"');
    expect(html).toContain('[9]');
    expect(html).not.toContain('href="#src-m1-9"');
  });

  it('does not touch a marker inside a code block', () => {
    const html = markCitationsInHtml(
      '<pre><code>const first = items[1];</code></pre>',
      options,
    );

    expect(html).toBe('<pre><code>const first = items[1];</code></pre>');
  });

  it('does not touch a marker inside an inline code span', () => {
    const html = markCitationsInHtml(
      '<p>Use <code>rows[2]</code>.</p>',
      options,
    );

    expect(html).toBe('<p>Use <code>rows[2]</code>.</p>');
  });

  it('does not touch a marker inside a link', () => {
    const html = markCitationsInHtml(
      '<p><a href="https://example.test">see [1]</a></p>',
      options,
    );

    expect(html).toBe('<p><a href="https://example.test">see [1]</a></p>');
  });

  it('rewrites markers inside nested markup', () => {
    const html = markCitationsInHtml(
      '<ul><li>First <strong>point [1]</strong></li></ul>',
      options,
    );

    expect(html).toContain('href="#src-m1-1"');
    expect(html).toContain('<strong>point ');
  });

  it('handles several markers in one text node', () => {
    const html = markCitationsInHtml(
      '<p>One [1] then two [2] then three [3].</p>',
      options,
    );

    expect(html.match(/citation-chip/g)).toHaveLength(3);
    expect(html).toContain('One ');
    expect(html).toContain(' then two ');
    expect(html).toContain(' then three ');
  });

  it('returns the html untouched when nothing was retrieved', () => {
    const html = markCitationsInHtml('<p>Answer [1].</p>', {
      ...options,
      sourceCount: 0,
    });

    expect(html).toBe('<p>Answer [1].</p>');
  });

  it('leaves an answer with no markers alone', () => {
    const html = markCitationsInHtml('<p>Nothing to cite here.</p>', options);

    expect(html).toBe('<p>Nothing to cite here.</p>');
  });

  it('cannot be broken out of by a hostile file name in the label', () => {
    // The label is built from a file name, and a file name is whoever
    // uploaded it. Re-parsing is the assertion that matters: attribute
    // serialisation escapes the quote, so the payload stays a string.
    const html = markCitationsInHtml('<p>Cited [1].</p>', {
      ...options,
      label: () => 'Source 1: "><img src=x onerror=alert(1)>.pdf',
    });

    const parsed = new DOMParser().parseFromString(
      `<div>${html}</div>`,
      'text/html',
    );

    expect(parsed.querySelectorAll('img')).toHaveLength(0);
    expect(
      parsed.querySelector('.citation-chip')?.getAttribute('aria-label'),
    ).toBe('Source 1: "><img src=x onerror=alert(1)>.pdf');
  });

  it('prefixes anchors per message, so two answers do not collide', () => {
    const first = markCitationsInHtml('<p>A [1]</p>', options);
    const second = markCitationsInHtml('<p>B [1]</p>', {
      ...options,
      anchorPrefix: 'src-m2',
    });

    expect(first).toContain('href="#src-m1-1"');
    expect(second).toContain('href="#src-m2-1"');
  });

  it('puts an invalid marker back exactly as written, zeros and all', () => {
    // `Number('0009')` is 9, so reconstructing the text from the parsed
    // number would show the reader `[9]` — a marker the model never wrote.
    const html = markCitationsInHtml('<p>Mixed [1][0009].</p>', options);

    expect(html).toContain('href="#src-m1-1"');
    expect(html).toContain('[0009]');
    expect(html).not.toContain('[9]');
  });

  it('does not rewrite a marker too large to survive being parsed', () => {
    // Past Number.MAX_SAFE_INTEGER the round trip changes the digits.
    const html = markCitationsInHtml(
      '<p>Mixed [2][99999999999999999999].</p>',
      options,
    );

    expect(html).toContain('href="#src-m1-2"');
    expect(html).toContain('[99999999999999999999]');
  });
});
