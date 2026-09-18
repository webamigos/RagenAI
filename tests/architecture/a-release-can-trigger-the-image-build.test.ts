import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The release has to be created by a token that can start another workflow.
 *
 * GitHub does not run workflows for events created with the default
 * `GITHUB_TOKEN`. That is a deliberate loop-breaker, and it means
 * `publish-images.yml` — which triggers on `release: published` — runs only
 * because `release.yml` hands semantic-release a personal access token
 * instead.
 *
 * Swap that secret for `secrets.GITHUB_TOKEN` and everything still looks
 * right: the release is cut, the notes are written, the tag exists, and no
 * image is ever built. No job fails, because no job starts. It is the same
 * fail-open shape as a path filter that matches nothing — the failure is an
 * *absence*, and absences are what nobody notices.
 *
 * So the coupling is asserted rather than left in a comment. If the token ever
 * has to change, this test is the place that explains what else has to change
 * with it.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const RELEASE = join(ROOT, '.github', 'workflows', 'release.yml');
const PUBLISH = join(ROOT, '.github', 'workflows', 'publish-images.yml');

describe('a release can trigger the image build', () => {
  it('creates the release with a token that is not the default one', () => {
    const release = readFileSync(RELEASE, 'utf8');

    expect(
      /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.GITHUB_TOKEN\s*\}\}/.test(release),
      'semantic-release is being given the default GITHUB_TOKEN — the release it creates will start no workflow, so no image would ever be published',
    ).toBe(false);

    expect(
      /GITHUB_TOKEN:\s*\$\{\{\s*secrets\.\w+\s*\}\}/.test(release),
      'release.yml passes no token to semantic-release at all',
    ).toBe(true);
  });

  it('builds images on the event that release creates', () => {
    const publish = readFileSync(PUBLISH, 'utf8');

    // If this trigger is ever changed to `push: tags`, the token requirement
    // above still holds — a tag pushed with the default token is just as inert
    // — so the pairing survives that edit rather than silently ceasing to
    // apply.
    expect(
      /release:\s*\n\s*types:\s*\[published\]/.test(publish),
      'publish-images.yml no longer listens for a published release',
    ).toBe(true);
  });

  it('publishes an image for every app that has no build arguments', () => {
    /**
     * The rule that decided the matrix, kept as a check rather than as prose.
     *
     * A Dockerfile with `ARG NEXT_PUBLIC_*` bakes those values into the
     * client bundle, so one published image cannot serve two installs. `web`
     * has ten of them and is excluded for exactly that reason; if another app
     * grows one, publishing it becomes the same mistake, and if `web` loses
     * them it becomes publishable and should be added.
     */
    const publish = readFileSync(PUBLISH, 'utf8');
    const matrix = /app:\s*\[([^\]]+)\]/.exec(publish);

    expect(
      matrix,
      'publish-images.yml has no `app: [...]` matrix',
    ).not.toBeNull();

    const published = matrix![1].split(',').map((entry) => entry.trim());

    const bakedIn = published.filter((app) =>
      /^ARG NEXT_PUBLIC_/m.test(
        readFileSync(join(ROOT, 'apps', app, 'Dockerfile'), 'utf8'),
      ),
    );

    expect(
      bakedIn,
      'an app whose Dockerfile takes NEXT_PUBLIC_* build arguments cannot be published as one image — Next inlines them, so every install would run the publisher’s values',
    ).toEqual([]);
  });
});
