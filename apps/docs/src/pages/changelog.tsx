import type { ReactNode } from 'react';
import Link from '@docusaurus/Link';
import { usePluginData } from '@docusaurus/useGlobalData';
import Layout from '@theme/Layout';

import type {
  ChangelogContent,
  ChangelogRelease,
} from '../../plugins/github-releases';
import type { ReleaseEntry, ReleaseSection } from '../lib/parse-release-notes';

import styles from './changelog.module.css';

function Entry({ entry }: { entry: ReleaseEntry }): ReactNode {
  return (
    <li className={styles.entry}>
      {entry.scope ? <span className={styles.scope}>{entry.scope}</span> : null}
      <span className={styles.summary}>{entry.summary}</span>
      {entry.pullRequest ? (
        <Link className={styles.reference} to={entry.pullRequest.url}>
          #{entry.pullRequest.number}
        </Link>
      ) : null}
    </li>
  );
}

function Section({ section }: { section: ReleaseSection }): ReactNode {
  return (
    <div className={styles.section}>
      {section.title ? (
        <h3 className={styles.sectionTitle}>{section.title}</h3>
      ) : null}
      {section.entries.length > 0 ? (
        <ul className={styles.entries}>
          {section.entries.map((entry, index) => (
            <Entry entry={entry} key={`${entry.summary}-${index}`} />
          ))}
        </ul>
      ) : null}
      {section.notes.map((note, index) => (
        <p className={styles.note} key={`${note}-${index}`}>
          {note}
        </p>
      ))}
    </div>
  );
}

function Release({ release }: { release: ChangelogRelease }): ReactNode {
  return (
    <article className={styles.release}>
      <header className={styles.releaseHeader}>
        <h2 className={styles.version}>
          <Link to={release.url}>{release.version}</Link>
        </h2>
        {release.publishedAt ? (
          <time className={styles.date} dateTime={release.publishedAt}>
            {release.displayDate}
          </time>
        ) : null}
      </header>
      {release.sections.length > 0 ? (
        release.sections.map((section, index) => (
          <Section key={`${section.title}-${index}`} section={section} />
        ))
      ) : (
        <p className={styles.note}>This release carries no notes.</p>
      )}
    </article>
  );
}

export default function Changelog(): ReactNode {
  // Undefined only if the plugin is removed from the config; typing it as
  // optional means that shows up as the unavailable notice rather than a
  // blank page or a crash.
  const content = usePluginData('ragen-github-releases') as
    ChangelogContent | undefined;

  const releases = content?.releases ?? [];
  const releasesUrl =
    content?.releasesUrl ?? 'https://github.com/webamigos/RagenAI/releases';

  let previousMonth = '';

  return (
    <Layout
      title="Changelog"
      description="Every Ragen release, generated from the commits that went into it."
    >
      <main className={`container ${styles.page}`}>
        <h1>Changelog</h1>
        <p className={styles.intro}>
          Ragen releases on every merge to <code>main</code>, so this list is
          long and each entry is small. Version numbers follow{' '}
          <Link to="https://semver.org">semantic versioning</Link> and are
          decided by the commit subjects, not by hand. Each entry links to the
          pull request it came from.
        </p>

        {content?.unavailable ? (
          <div className={styles.unavailable} role="status">
            <strong>
              The release list could not be loaded for this build.
            </strong>{' '}
            Read it on <Link to={releasesUrl}>GitHub Releases</Link> instead.
          </div>
        ) : null}

        {releases.map((release) => {
          const showMonth =
            release.monthLabel !== '' && release.monthLabel !== previousMonth;
          previousMonth = release.monthLabel;

          return (
            <div key={release.version}>
              {showMonth ? (
                <h2 className={styles.month}>{release.monthLabel}</h2>
              ) : null}
              <Release release={release} />
            </div>
          );
        })}

        {content?.truncated ? (
          <p className={styles.older}>
            Older releases are on <Link to={releasesUrl}>GitHub Releases</Link>.
          </p>
        ) : null}
      </main>
    </Layout>
  );
}
