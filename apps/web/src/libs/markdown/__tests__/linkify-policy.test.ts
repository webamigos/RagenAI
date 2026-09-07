import { describe, expect, it } from 'vitest';
import MarkdownIt from 'markdown-it';

import { applyLinkifyPolicy } from '../linkify-policy';

function render(markdown: string, withPolicy: boolean) {
  const md = new MarkdownIt({ linkify: true });
  if (withPolicy) {
    applyLinkifyPolicy(md);
  }
  return md.render(markdown);
}

describe('applyLinkifyPolicy', () => {
  /**
   * The reported bug. `.md` is Moldova's ccTLD, so linkify-it read a knowledge
   * base filename as a hostname and a citation inside an answer became an
   * external link.
   */
  it('leaves a knowledge base filename as text', () => {
    expect(
      render("According to 'Sample FAQ — availability.md', …", true),
    ).not.toContain('<a');
  });

  it('is fixing a real problem, not a hypothetical one', () => {
    // Without the policy the same input links. If this ever stops being true,
    // markdown-it changed and the policy may no longer be needed.
    expect(render('see availability.md', false)).toContain('<a');
  });

  it.each(['notes.pl', 'deploy.sh', 'archive.zip', 'clip.mov', 'script.py'])(
    'leaves %s alone — every one of those extensions is also a TLD',
    (filename) => {
      expect(render(`the file ${filename} explains it`, true)).not.toContain(
        '<a',
      );
    },
  );

  it('still links a URL that names its scheme', () => {
    const html = render('see https://example.com/docs for more', true);

    expect(html).toContain('<a');
    expect(html).toContain('https://example.com/docs');
  });

  it('still renders an ordinary markdown link', () => {
    expect(render('[the docs](https://example.com)', true)).toContain(
      'href="https://example.com"',
    );
  });

  it('still links a bare email address', () => {
    // Left on deliberately: no filename looks like an address.
    expect(render('write to info@example.com', true)).toContain('mailto:');
  });
});
