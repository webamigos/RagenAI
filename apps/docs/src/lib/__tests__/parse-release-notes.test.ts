import { describe, expect, it } from 'vitest';

import { parseReleaseNotes } from '../parse-release-notes';

/** The body of v1.155.0, copied from the API rather than written by hand. */
const REAL_BODY = `# [1.155.0](https://github.com/webamigos/RagenAI/compare/v1.154.0...v1.155.0) (2026-09-10)


### Features

* **search:** the palette can act, and can ask ([#1041](https://github.com/webamigos/RagenAI/issues/1041)) ([e026d0a](https://github.com/webamigos/RagenAI/commit/e026d0a1739e51be416236337c88040a7b6faeeb))
* **settings:** one rail, two sections ([#1039](https://github.com/webamigos/RagenAI/issues/1039)) ([5e3db3a](https://github.com/webamigos/RagenAI/commit/5e3db3ae44ada5f47fcfb69173c7650f61227a4f))
`;

describe('parseReleaseNotes', () => {
  it('reads a real release body into one section of two entries', () => {
    const sections = parseReleaseNotes(REAL_BODY);

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Features');
    expect(sections[0].entries).toHaveLength(2);
    expect(sections[0].entries[0]).toEqual({
      scope: 'search',
      summary: 'the palette can act, and can ask',
      pullRequest: {
        number: 1041,
        url: 'https://github.com/webamigos/RagenAI/issues/1041',
      },
      commit: {
        shortSha: 'e026d0a',
        url: 'https://github.com/webamigos/RagenAI/commit/e026d0a1739e51be416236337c88040a7b6faeeb',
      },
    });
  });

  it('drops the version heading, which the API already gives us as fields', () => {
    const sections = parseReleaseNotes(REAL_BODY);

    expect(sections.some((section) => section.title.includes('1.155.0'))).toBe(
      false,
    );
    expect(
      sections.flatMap((section) => section.notes).join(' '),
    ).not.toContain('1.155.0');
  });

  it('reads the `##` heading a patch release uses', () => {
    const sections = parseReleaseNotes(
      `## [1.151.2](https://example.test/compare) (2026-09-09)\n\n### Bug Fixes\n\n* **web:** the rail keeps its width ([#900](https://example.test/900)) ([abc1234](https://example.test/abc1234))\n`,
    );

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Bug Fixes');
    expect(sections[0].entries[0].scope).toBe('web');
  });

  it('keeps an entry that has no scope', () => {
    const sections = parseReleaseNotes(
      '### Features\n\n* something without a scope ([#12](https://example.test/12))\n',
    );

    expect(sections[0].entries[0]).toEqual({
      summary: 'something without a scope',
      pullRequest: { number: 12, url: 'https://example.test/12' },
    });
  });

  it('keeps a bullet that carries neither a pull request nor a commit', () => {
    const sections = parseReleaseNotes('### Features\n\n* a bare subject\n');

    expect(sections[0].entries[0]).toEqual({ summary: 'a bare subject' });
  });

  it('keeps a line it cannot parse instead of dropping it', () => {
    const sections = parseReleaseNotes(
      '### BREAKING CHANGES\n\nThe `/v1/chat` endpoint now requires an assistant id.\n',
    );

    expect(sections[0].title).toBe('BREAKING CHANGES');
    expect(sections[0].entries).toHaveLength(0);
    expect(sections[0].notes).toEqual([
      'The `/v1/chat` endpoint now requires an assistant id.',
    ]);
  });

  it('keeps bullets that appear before any heading, under no title', () => {
    const sections = parseReleaseNotes('* an entry with no section\n');

    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('');
    expect(sections[0].entries[0].summary).toBe('an entry with no section');
  });

  it('unwraps a link left inside a subject', () => {
    const sections = parseReleaseNotes(
      '### Features\n\n* see [the runbook](https://example.test/runbook) first ([#7](https://example.test/7))\n',
    );

    expect(sections[0].entries[0].summary).toBe('see the runbook first');
  });

  it('returns nothing for an empty body rather than an empty section', () => {
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes('\n\n  \n')).toEqual([]);
  });

  it('separates sections that follow one another', () => {
    const sections = parseReleaseNotes(
      '### Features\n\n* one ([#1](https://example.test/1))\n\n### Bug Fixes\n\n* two ([#2](https://example.test/2))\n',
    );

    expect(sections.map((section) => section.title)).toEqual([
      'Features',
      'Bug Fixes',
    ]);
    expect(sections[1].entries[0].summary).toBe('two');
  });
});
