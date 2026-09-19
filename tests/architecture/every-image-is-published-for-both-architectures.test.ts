import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse } from 'yaml';
import { describe, expect, it } from 'vitest';

/**
 * A published image has to run on both architectures, and nothing else says so.
 *
 * `publish-images.yml` built `linux/amd64` alone until 2026-09-19. Nothing was
 * broken by that in any environment CI touches — an arm64 host pulls the amd64
 * variant and runs it under emulation, so the failure surfaces on somebody
 * else's laptop as a native module that segfaults, or as nothing at all except
 * a slow container. There is no job that goes red.
 *
 * The workflow is a fan-out and a join: `build` pushes one image per
 * (app, architecture) by digest and pushes no tag, and `merge` joins the
 * digests into one manifest list per tag. That shape has two ways to fail
 * quietly, and both are asserted here.
 *
 * 1. **The two `app:` matrices drift.** They are separate lists that must hold
 *    the same names. Adding an app to `build` alone publishes no tag for it;
 *    adding it to `merge` alone fails the join with no digests, which at least
 *    goes red — but only after a release has already been cut.
 * 2. **An architecture stops being built natively.** The point of the arm64
 *    runner is that neither architecture is emulated; a `runs-on` edit back to
 *    `ubuntu-latest` for both would still produce correct images, several
 *    times more slowly, and the only evidence would be the job duration.
 *
 * The manifest itself is checked by the workflow's own last step, against the
 * registry, because that is the only place the truth lives once it is pushed.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const PUBLISH = join(ROOT, '.github', 'workflows', 'publish-images.yml');

/** Runner labels that provide each architecture natively, as GitHub names them. */
const NATIVE_RUNNERS: Record<string, RegExp> = {
  amd64: /^ubuntu-(latest|\d\d\.\d\d)$/,
  arm64: /^ubuntu-\d\d\.\d\d-arm$/,
};

type Workflow = {
  jobs: Record<
    string,
    {
      'runs-on': string;
      strategy?: {
        matrix?: {
          app?: string[];
          platform?: { arch: string; runner: string }[];
        };
      };
      steps: { uses?: string; with?: Record<string, string> }[];
    }
  >;
};

const workflow = parse(readFileSync(PUBLISH, 'utf8')) as Workflow;

describe('every image is published for both architectures', () => {
  it('builds and merges the same set of apps', () => {
    const built = workflow.jobs.build?.strategy?.matrix?.app;
    const merged = workflow.jobs.merge?.strategy?.matrix?.app;

    expect(built, 'the `build` job has no `app` matrix').toBeDefined();
    expect(merged, 'the `merge` job has no `app` matrix').toBeDefined();

    expect(
      [...merged!].sort(),
      'the two `app` matrices disagree — an app built but not merged is published under no tag at all',
    ).toEqual([...built!].sort());
  });

  it('builds each architecture on a runner that provides it', () => {
    const platforms = workflow.jobs.build?.strategy?.matrix?.platform ?? [];

    expect(
      platforms.map((entry) => entry.arch).sort(),
      'an architecture left the build matrix — an image that omits one is pulled and emulated on that host, which nothing here would notice',
    ).toEqual(['amd64', 'arm64']);

    // Checked before the runners themselves, because it is what makes
    // checking them mean anything: a matrix can name `ubuntu-24.04-arm` while
    // `runs-on` sends every job to the same amd64 host, and then the entries
    // below are documentation rather than configuration.
    expect(
      /^\$\{\{\s*matrix\.platform\.runner\s*\}\}$/.test(
        workflow.jobs.build?.['runs-on'] ?? '',
      ),
      '`build` does not run on `matrix.platform.runner` — whatever the matrix says, both architectures then land on one host and the second is a cross-build under QEMU',
    ).toBe(true);

    for (const { arch, runner } of platforms) {
      expect(
        NATIVE_RUNNERS[arch]?.test(runner),
        `linux/${arch} is being built on \`${runner}\`, which does not provide it natively — that is a cross-build under QEMU, and the only symptom is the clock`,
      ).toBe(true);
    }
  });

  it('pushes no tag from a per-architecture build', () => {
    const build = workflow.jobs.build?.steps.find((step) =>
      step.uses?.startsWith('docker/build-push-action'),
    );

    expect(build, 'the `build` job no longer builds an image').toBeDefined();

    expect(
      build!.with?.tags,
      'a per-architecture build is applying a tag — the two architectures then race for it, and the loser is a single-architecture image sitting under a tag that claims to be both',
    ).toBeUndefined();

    expect(
      build!.with?.outputs,
      'the per-architecture build no longer pushes by digest, so `merge` has nothing to join',
    ).toContain('push-by-digest=true');
  });
});
