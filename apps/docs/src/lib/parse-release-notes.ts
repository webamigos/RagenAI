/**
 * Turns one GitHub release body into structured entries.
 *
 * Nobody writes these bodies. `@semantic-release/release-notes-generator`
 * produces them from the conventional-commit subjects on the way to `main`,
 * which is why parsing them is reasonable rather than reckless: the shape is
 * a program's output, not prose, and it has looked the same for 155 releases.
 *
 * The alternative was rendering the markdown and injecting it as HTML. That
 * needs a sanitiser to be safe, and it would hand the page's structure to
 * whatever the generator emits next. Parsing costs a regex or five and gives
 * the page real objects: a scope it can show as a label, a pull request it can
 * link, a commit it can link separately.
 *
 * The rule everywhere below is that nothing is dropped. A line that does not
 * match any pattern here is kept verbatim in `notes`, because a changelog that
 * silently omits an entry is worse than one that shows an odd-looking line.
 */

export type ReleaseEntry = {
  /** The conventional-commit scope, `search` in `feat(search): …`. */
  scope?: string;
  /** The commit subject, with the trailing PR and commit links removed. */
  summary: string;
  pullRequest?: { number: number; url: string };
  commit?: { shortSha: string; url: string };
};

export type ReleaseSection = {
  /** `Features`, `Bug Fixes`, …; empty for bullets that precede any heading. */
  title: string;
  entries: ReleaseEntry[];
  /** Anything in the section that is not a bullet, kept as written. */
  notes: string[];
};

/**
 * `#` and `##` head the version itself (`# [1.155.0](…) (2026-09-10)`), and
 * the API already gives us the version, the date and the URL as fields. Only
 * `###` and deeper name a section.
 */
const VERSION_HEADING = /^#{1,2}\s+/;
const SECTION_HEADING = /^#{3,}\s+(.*\S)\s*$/;
const BULLET = /^[*-]\s+(.*\S)\s*$/;

/** `([e026d0a](https://github.com/…/commit/e026d0a…))`, always last. */
const TRAILING_COMMIT =
  /\s*\(\[([0-9a-f]{7,40})\]\((https?:\/\/[^)\s]+)\)\)\s*$/;
/** `([#1041](https://github.com/…/issues/1041))`, before the commit link. */
const TRAILING_PULL_REQUEST = /\s*\(\[#(\d+)\]\((https?:\/\/[^)\s]+)\)\)\s*$/;
/** `**search:** ` at the start of a subject. Optional: a scope often is. */
const LEADING_SCOPE = /^\*\*(.+?):\*\*\s*/;
/** Any inline `[text](url)` left in the subject, unwrapped to its text. */
const INLINE_LINK = /\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g;

function parseEntry(bullet: string): ReleaseEntry {
  let rest = bullet;

  const commitMatch = rest.match(TRAILING_COMMIT);
  const commit = commitMatch
    ? { shortSha: commitMatch[1], url: commitMatch[2] }
    : undefined;
  if (commitMatch) {
    rest = rest.slice(0, commitMatch.index);
  }

  const pullRequestMatch = rest.match(TRAILING_PULL_REQUEST);
  const pullRequest = pullRequestMatch
    ? { number: Number(pullRequestMatch[1]), url: pullRequestMatch[2] }
    : undefined;
  if (pullRequestMatch) {
    rest = rest.slice(0, pullRequestMatch.index);
  }

  const scopeMatch = rest.match(LEADING_SCOPE);
  const scope = scopeMatch ? scopeMatch[1] : undefined;
  if (scopeMatch) {
    rest = rest.slice(scopeMatch[0].length);
  }

  const summary = rest.replace(INLINE_LINK, '$1').trim();

  return {
    ...(scope ? { scope } : {}),
    summary,
    ...(pullRequest ? { pullRequest } : {}),
    ...(commit ? { commit } : {}),
  };
}

export function parseReleaseNotes(body: string): ReleaseSection[] {
  const sections: ReleaseSection[] = [];

  // Bullets can appear before any `###`, and a body can be a single paragraph
  // with no heading at all. Both land in this one, which the page renders
  // without a heading rather than under an invented one.
  let current: ReleaseSection = { title: '', entries: [], notes: [] };
  sections.push(current);

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim();
    if (line.length === 0) {
      continue;
    }

    const sectionMatch = line.match(SECTION_HEADING);
    if (sectionMatch) {
      current = { title: sectionMatch[1], entries: [], notes: [] };
      sections.push(current);
      continue;
    }

    if (VERSION_HEADING.test(line)) {
      continue;
    }

    const bulletMatch = line.match(BULLET);
    if (bulletMatch) {
      current.entries.push(parseEntry(bulletMatch[1]));
      continue;
    }

    current.notes.push(line);
  }

  return sections.filter(
    (section) => section.entries.length > 0 || section.notes.length > 0,
  );
}
