import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * The offline bundle carries the whole appliance stack, and finds out what
 * that is by asking Compose — never from a list of its own.
 *
 * `infra/appliance/bundle/build-bundle.sh` saves the images `docker compose
 * config --images` names for the appliance compose files, and the models the
 * release's own `ollama-models` job pulls. A copy of either list in the
 * script would be right on the day it was written: the next image added to
 * the stack would be missing from every bundle, and the machine that finds
 * out has no network to fetch it with.
 *
 * Deriving the list has one blind spot, which the second test closes: a
 * service with a `build:` and no `image:` gives Compose a name that exists in
 * no registry (`<project>-<service>`), so the builder's pull fails — or, worse,
 * the installer starts it with `--no-build` and it is simply absent.
 *
 * The installer's half of the rule is that it never reaches for a network:
 * no pull, and `--pull never` on every call that could start one.
 *
 * Step C2 of docs/specs/2026-10-17-ragen-as-an-on-premises-appliance.md.
 */

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const LIB = read('infra/appliance/bundle/lib.sh');
const BUILDER = read('infra/appliance/bundle/build-bundle.sh');
const INSTALLER = read('infra/appliance/bundle/install-offline.sh');

/** A script's commands: comment lines carry no behaviour. */
const code = (script: string) =>
  script
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');

const bundleComposeFiles = () =>
  /^BUNDLE_COMPOSE_FILES="([^"]+)"$/m.exec(LIB)?.[1]?.split(':') ?? [];

type Service = { image?: string; build?: unknown; profiles?: string[] };

function stack(): Map<string, Service> {
  const services = new Map<string, Service>();
  for (const file of bundleComposeFiles()) {
    const parsed = parseYaml(read(file), { merge: true }) as {
      services: Record<string, Service>;
    };
    for (const [name, service] of Object.entries(parsed.services)) {
      services.set(name, { ...services.get(name), ...service });
    }
  }
  return services;
}

describe('the offline bundle', () => {
  it('bundles the compose files the appliance installer runs', () => {
    const files = bundleComposeFiles();
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      expect(existsSync(join(ROOT, file)), file).toBe(true);
    }
    // install-spark.sh writes COMPOSE_FILE; the bundle must be the same
    // stack, or it carries images for a stack nobody starts.
    expect(read('infra/appliance/install-spark.sh')).toContain(
      `compose_files="${files.join(':')}"`,
    );
  });

  it('can carry every service the appliance starts: each has a published image', () => {
    const unpublished = [...stack()]
      .filter(([, service]) => (service.profiles ?? []).length === 0)
      .filter(([, service]) => !service.image)
      .map(([name]) => name);

    expect(stack().size).toBeGreaterThan(0);
    expect(unpublished).toEqual([]);
  });

  it('asks Compose for the images and the models instead of listing them', () => {
    expect(BUILDER).toMatch(/config --images \| unique_images/);
    expect(BUILDER).toMatch(/compose_json_models/);

    const images = [...stack().values()]
      .map((service) => service.image)
      .filter((image): image is string => Boolean(image))
      // `postgres:16` -> `postgres:`, which a reference has and the service
      // name the installer waits for (`--wait postgres`) does not.
      .map((image) => `${image.split(':')[0]!}:`);
    const models =
      /APPLIANCE_MODELS:\s*\$\{APPLIANCE_MODELS:-([^}]*)\}/
        .exec(read('docker-compose.appliance.yml'))?.[1]
        ?.trim()
        .split(/\s+/) ?? [];
    expect(images.length).toBeGreaterThan(0);
    expect(models.length).toBeGreaterThan(0);

    for (const script of [LIB, BUILDER, INSTALLER]) {
      for (const name of [...images, ...models]) {
        expect(code(script), name).not.toContain(name);
      }
    }
  });

  it('never pulls or builds on the machine with no network', () => {
    const installer = code(INSTALLER);

    expect(installer).not.toMatch(/\bdocker pull\b/);
    expect(installer).not.toMatch(/\bcompose pull\b/);
    expect(installer).toContain('OFFLINE=(--pull never --no-build)');

    const starts = installer
      .split('\n')
      .filter((line) => /\bcompose up\b/.test(line));
    expect(starts.length).toBeGreaterThan(0);
    for (const line of starts) {
      expect(line, line).toContain('"${OFFLINE[@]}"');
    }

    const runs = installer
      .split('\n')
      .filter((line) => /\bdocker run\b/.test(line));
    for (const line of runs) {
      expect(line, line).toContain('--pull never');
    }
  });

  it('verifies the bundle before it loads anything from it', () => {
    const installer = code(INSTALLER);
    const verify = installer.indexOf('problem="$(verify_bundle');
    const validate = installer.indexOf('problem="$(validate_manifest');
    const load = installer.indexOf('docker load');
    const extract = installer.indexOf('tar -xzf "$BUNDLE/checkout.tar.gz"');

    expect(verify).toBeGreaterThan(-1);
    expect(validate).toBeGreaterThan(verify);
    expect(load).toBeGreaterThan(validate);
    expect(extract).toBeGreaterThan(validate);
  });
});
