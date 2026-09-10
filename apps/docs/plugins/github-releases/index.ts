import type { LoadContext, Plugin } from '@docusaurus/types';

import {
  parseReleaseNotes,
  type ReleaseSection,
} from '../../src/lib/parse-release-notes';

/**
 * Builds the changelog page's content from GitHub Releases, at build time.
 *
 * There is no `CHANGELOG.md` in this repository and deliberately so. The
 * release notes already exist, written by `@semantic-release/release-notes-generator`
 * on every merge to `main`; the two ways to also have them as a file are to
 * let a bot commit to `main` on every release, which means handing it a
 * bypass around branch protection, or to maintain the file by hand, which
 * means it drifts. Reading the notes at build time keeps one source of truth
 * and adds no commits.
 *
 * The cost is a network call during the build, so the failure path matters
 * more than the happy one. See `loadContent`.
 */

export type ChangelogRelease = {
  /** The tag, `v1.155.0`. */
  version: string;
  url: string;
  /** ISO 8601, for the `datetime` attribute. */
  publishedAt: string;
  /**
   * Rendered here rather than in the component. `Intl` in a component runs
   * once in Node and again in the browser, and the two disagree whenever the
   * reader's locale or time zone differs from the build machine's, which
   * React reports as a hydration mismatch. A string decided at build time
   * cannot disagree with itself.
   */
  displayDate: string;
  /** `September 2026`, for the separators between months. */
  monthLabel: string;
  sections: ReleaseSection[];
};

export type ChangelogContent = {
  releases: ChangelogRelease[];
  /**
   * Why the list is empty or short, in a sentence the page shows the reader.
   * Absent when the fetch succeeded, which is what the page tests.
   */
  unavailable?: string;
  /** True when there are older releases than the ones fetched. */
  truncated: boolean;
  releasesUrl: string;
};

export type GithubReleasesOptions = {
  owner: string;
  repo: string;
};

type GithubRelease = {
  tag_name: string;
  html_url: string;
  published_at: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
};

const PAGE_SIZE = 100;
/**
 * Five pages is around five hundred releases. This repository releases on
 * every merge, so that is months of history and the page still links to
 * GitHub for anything older. The cap exists so the build does not grow a
 * request per hundred releases forever.
 */
const MAX_PAGES = 5;
const REQUEST_TIMEOUT_MS = 10_000;

const monthFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const dayFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  timeZone: 'UTC',
});

function authHeaders(): Record<string, string> {
  // Unauthenticated is 60 requests an hour per IP, which is fine for a build
  // that makes at most five. CI has a token anyway and a token raises the
  // limit, so use one when it is there and never require it: a contributor
  // running `npm run docs:build` locally has none.
  const token = process.env.DOCS_GITHUB_TOKEN ?? process.env.GITHUB_TOKEN;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function fetchReleases(
  options: GithubReleasesOptions,
): Promise<{ releases: GithubRelease[]; truncated: boolean }> {
  const collected: GithubRelease[] = [];

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${options.owner}/${options.repo}/releases?per_page=${PAGE_SIZE}&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...authHeaders(),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub answered ${response.status} ${response.statusText} for ${url}`,
      );
    }

    const batch = (await response.json()) as GithubRelease[];
    collected.push(...batch);

    if (batch.length < PAGE_SIZE) {
      return { releases: collected, truncated: false };
    }
  }

  return { releases: collected, truncated: true };
}

function toChangelogRelease(release: GithubRelease): ChangelogRelease {
  const publishedAt = release.published_at ?? '';
  const published = publishedAt ? new Date(publishedAt) : undefined;

  return {
    version: release.tag_name,
    url: release.html_url,
    publishedAt,
    displayDate: published ? dayFormat.format(published) : '',
    monthLabel: published ? monthFormat.format(published) : '',
    sections: parseReleaseNotes(release.body ?? ''),
  };
}

export default function githubReleasesPlugin(
  _context: LoadContext,
  options: GithubReleasesOptions,
): Plugin<ChangelogContent> {
  const releasesUrl = `https://github.com/${options.owner}/${options.repo}/releases`;

  return {
    name: 'ragen-github-releases',

    async loadContent(): Promise<ChangelogContent> {
      try {
        const { releases, truncated } = await fetchReleases(options);

        return {
          releases: releases
            .filter((release) => !release.draft && !release.prerelease)
            .map(toChangelogRelease),
          truncated,
          releasesUrl,
        };
      } catch (error) {
        // Deliberately not a thrown error. GitHub being slow, rate limited or
        // down would otherwise fail a documentation deploy that has nothing
        // else wrong with it. The reader is told plainly that the list could
        // not be loaded and is given the link, which is better than a page
        // that looks complete and is empty.
        const reason = error instanceof Error ? error.message : String(error);
        /* The page degrades quietly by design, so the build log is the only
         * place a maintainer can find out that it did. */
        // eslint-disable-next-line no-console
        console.warn(`[changelog] could not read GitHub releases: ${reason}`);

        return {
          releases: [],
          truncated: false,
          releasesUrl,
          unavailable: reason,
        };
      }
    },

    contentLoaded({ content, actions }) {
      actions.setGlobalData(content);
    },
  };
}
