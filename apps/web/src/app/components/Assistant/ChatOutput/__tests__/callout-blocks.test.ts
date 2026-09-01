/**
 * Renderer-only tests for the `::: callout` admonition syntax added in
 * useChatViewLogic. The React hook wrapping this renderer isn't
 * exercised here — we test the markdown-it plugin directly to keep
 * assertions focused on the HTML shape the sanitizer and CSS expect.
 */
import { describe, expect, it, vi } from 'vitest';

// The logger module branches on window presence and does a runtime
// require('./clientLogger') under jsdom. Stub it like other vitest
// tests do so the hook module can be imported.
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createMarkdownRenderer } from '../useChatViewLogic';

// The UMD build of markdown-it works in jsdom, but hljs tries to do
// auto-detection which is fine for our tests (no code blocks involved).

const md = createMarkdownRenderer();

function render(src: string): string {
  return md.render(src);
}

describe('callout blocks', () => {
  it('renders a summary callout with a title', () => {
    const html = render(
      [
        '::: summary Fit dla VHS: średni (54/100)',
        'Firma raczej średni fit — skala ogranicza wartość projektu.',
        ':::',
      ].join('\n'),
    );
    expect(html).toContain('class="callout callout-summary"');
    expect(html).toContain(
      'class="callout-title">Fit dla VHS: średni (54/100)',
    );
    expect(html).toContain('Firma raczej średni fit');
  });

  it('renders a summary callout without a title', () => {
    const html = render(
      ['::: summary', 'Krótkie podsumowanie.', ':::'].join('\n'),
    );
    expect(html).toContain('class="callout callout-summary"');
    expect(html).not.toContain('callout-title');
  });

  it('supports warning / tip / info / note variants', () => {
    for (const type of ['warning', 'tip', 'info', 'note']) {
      const html = render([`::: ${type}`, `body`, ':::'].join('\n'));
      expect(html).toContain(`class="callout callout-${type}"`);
    }
  });

  it('renders inline markdown inside the callout body', () => {
    const html = render(
      [
        '::: summary Wniosek',
        '**Bold** and [link](https://example.com) and `code`.',
        ':::',
      ].join('\n'),
    );
    expect(html).toContain('<strong>Bold</strong>');
    expect(html).toContain('<a');
    expect(html).toContain('<code>code</code>');
  });

  it('does NOT render an unknown callout type as a callout', () => {
    // `::: danger ...` isn't one of our whitelisted types, so the
    // block parser falls through and treats it as regular text.
    const html = render([':::  danger', 'body', ':::'].join('\n'));
    expect(html).not.toContain('callout-danger');
  });

  it('escapes HTML in the title attribute', () => {
    // Titles go through md.utils.escapeHtml before reaching the DOM,
    // so even a pathological model reply can't inject markup here.
    const html = render(
      ['::: summary <img src=x onerror=alert(1)>', 'body', ':::'].join('\n'),
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img');
  });
});
