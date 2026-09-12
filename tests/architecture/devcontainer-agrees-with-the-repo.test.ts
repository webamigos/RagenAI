import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The dev container is a second description of how this repository runs, and
 * a second description drifts. These guards pin it to the first one.
 *
 * It is deliberately thin — it layers `docker-compose.yml` rather than
 * restating any service — so most of what can go wrong is a reference that
 * stops resolving: a service renamed, a workspace added, a Node major bumped
 * in `.nvmrc` and nowhere else. None of those fail loudly. A contributor
 * would get a container that builds and then behaves unlike CI, which is the
 * one thing a dev container exists to prevent.
 *
 * Scope: static agreement only. Nothing here starts Docker.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const DEVCONTAINER = join(REPO_ROOT, '.devcontainer');

interface DevcontainerConfig {
  dockerComposeFile: string[];
  service: string;
  runServices: string[];
  forwardPorts: number[];
  workspaceFolder: string;
  features: Record<string, unknown>;
}

function readDevcontainerJson(): DevcontainerConfig {
  const raw = readFileSync(join(DEVCONTAINER, 'devcontainer.json'), 'utf8');

  // The spec allows comments (it is JSONC). This repository keeps the file
  // comment-free anyway — the prose lives in .devcontainer/README.md — so
  // that every consumer, this test included, can read it with JSON.parse.
  let parsed: DevcontainerConfig;
  try {
    parsed = JSON.parse(raw) as DevcontainerConfig;
  } catch (error) {
    throw new Error(
      `.devcontainer/devcontainer.json is not plain JSON (${String(error)}). ` +
        'Move the comment into .devcontainer/README.md.',
    );
  }
  return parsed;
}

/** Top-level service names in a Compose file, read as text. */
function composeServices(path: string): string[] {
  const source = readFileSync(path, 'utf8');
  const servicesBlock = source.split(/^services:$/m)[1] ?? '';
  const upToNextTopLevel = servicesBlock.split(/^[a-z]+:$/m)[0] as string;
  return [...upToNextTopLevel.matchAll(/^ {2}([a-z0-9-]+):$/gm)].map(
    (match) => match[1] as string,
  );
}

/** Workspaces that produce a build output, as `packages/rag-core` paths. */
function buildableWorkspaces(): string[] {
  const found: string[] = [];
  for (const parent of ['packages', 'apps']) {
    for (const entry of readdirSync(join(REPO_ROOT, parent), {
      withFileTypes: true,
    })) {
      const packageJson = join(REPO_ROOT, parent, entry.name, 'package.json');
      if (!entry.isDirectory() || !existsSync(packageJson)) {
        continue;
      }
      const declared = JSON.parse(readFileSync(packageJson, 'utf8')) as {
        scripts?: Record<string, string>;
      };
      if (declared.scripts?.build) {
        found.push(`${parent}/${entry.name}`);
      }
    }
  }
  return found.sort();
}

describe('devcontainer.json agrees with the repository', () => {
  const config = readDevcontainerJson();

  it('layers the repository docker-compose.yml rather than copying services', () => {
    expect(
      config.dockerComposeFile[0],
      "The repository compose file must come first: Compose resolves every relative path in every layer against the *first* file's directory, and docker-compose.yml uses paths like ./infra/litellm relative to the repository root.",
    ).toBe('../docker-compose.yml');
  });

  it('references compose files that exist, or are generated and ignored', () => {
    const generated = 'docker-compose.volumes.yml';

    for (const file of config.dockerComposeFile) {
      if (file.endsWith(generated)) {
        expect(
          existsSync(join(DEVCONTAINER, 'scripts/generate-compose-volumes.sh')),
          `${generated} is generated, but its generator is missing.`,
        ).toBe(true);
        expect(
          readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8'),
          `${generated} is generated on every container start and must not be committed.`,
        ).toContain(generated);
        continue;
      }

      expect(
        existsSync(join(DEVCONTAINER, file)),
        `devcontainer.json references ${file}, which does not exist.`,
      ).toBe(true);
    }
  });

  it('names a workspace service the override actually declares', () => {
    const declared = composeServices(
      join(DEVCONTAINER, 'docker-compose.devcontainer.yml'),
    );

    expect(
      declared,
      `devcontainer.json attaches to the "${config.service}" service, which docker-compose.devcontainer.yml does not declare. The container would never be created.`,
    ).toContain(config.service);
  });

  it('starts only services docker-compose.yml actually declares', () => {
    const declared = composeServices(join(REPO_ROOT, 'docker-compose.yml'));

    expect(
      declared.length,
      'No services parsed out of docker-compose.yml — this test reads it as text and needs updating alongside it.',
    ).toBeGreaterThan(5);

    for (const service of config.runServices) {
      expect(
        declared,
        `runServices names "${service}", which docker-compose.yml does not declare. A renamed service silently stops being started, and the container comes up without it.`,
      ).toContain(service);
    }
  });

  it('forwards the dev port of every app that has one', () => {
    // web 3000, api 3001, admin 3200, docs 3400 — the ports each app pins in
    // its own dev script, listed in AGENTS.md's "Local Development".
    for (const port of [3000, 3001, 3200, 3400]) {
      expect(
        config.forwardPorts,
        `Port ${port} is not forwarded, so that app is unreachable from a browser in a Codespace.`,
      ).toContain(port);
    }
  });

  it('pins the same Node major as .nvmrc', () => {
    const nvmrc = readFileSync(join(REPO_ROOT, '.nvmrc'), 'utf8').trim();
    const compose = readFileSync(
      join(DEVCONTAINER, 'docker-compose.devcontainer.yml'),
      'utf8',
    );

    const image = /image:\s*(\S+)/.exec(compose)?.[1];
    expect(image, 'No image found for the workspace service.').toBeDefined();
    expect(
      image,
      `.nvmrc asks for Node ${nvmrc}, but the dev container image is ${image}. A container on a different major is the drift this whole directory exists to remove.`,
    ).toContain(`:${nvmrc}-`);
  });

  it('pins every feature to a digest', () => {
    // Same reasoning docker-compose.yml spells out for image tags: a floating
    // tag lets two machines resolve different builds, and a rollback does not
    // restore the previous one. The lock file is written by the dev container
    // CLI when the container is built.
    const lock = JSON.parse(
      readFileSync(join(DEVCONTAINER, 'devcontainer-lock.json'), 'utf8'),
    ) as { features: Record<string, { resolved?: string }> };

    for (const feature of Object.keys(config.features)) {
      expect(
        lock.features[feature]?.resolved,
        `${feature} is declared in devcontainer.json but not pinned in devcontainer-lock.json. Rebuild the container to regenerate the lock, and commit it.`,
      ).toMatch(/@sha256:[0-9a-f]{64}$/);
    }
  });

  it('mounts the repository root, not .devcontainer', () => {
    const compose = readFileSync(
      join(DEVCONTAINER, 'docker-compose.devcontainer.yml'),
      'utf8',
    );

    expect(
      compose,
      "The workspace bind must be `.` — relative paths resolve against the first compose file's directory (the repository root), so `..` would mount the directory above the repository.",
    ).toContain(`- .:${config.workspaceFolder}:cached`);
  });
});

describe('the generated volume override covers every workspace', () => {
  const output = join(
    mkdtempSync(join(tmpdir(), 'ragen-devcontainer-')),
    'docker-compose.volumes.yml',
  );
  const log = execFileSync(
    'bash',
    [join(DEVCONTAINER, 'scripts/generate-compose-volumes.sh'), output],
    { encoding: 'utf8' },
  );
  const generated = readFileSync(output, 'utf8');

  it('knows where every buildable workspace writes its output', () => {
    expect(
      log,
      `generate-compose-volumes.sh could not map a workspace to an output directory:\n${log}\nAdd its build tool to build_output_dir().`,
    ).not.toContain('WARNING');
  });

  it.each(buildableWorkspaces())(
    '%s has a named volume for its build output',
    (workspace) => {
      expect(
        generated,
        `${workspace} builds, but nothing in the generated override covers it — its output would land on the bind mount, where an empty host directory shadows what the container built.`,
      ).toContain(`:/workspace/${workspace}/`);
    },
  );

  it('gives each mount its own volume, never two workspaces one volume', () => {
    const mounts = [...generated.matchAll(/^ +- (ws_\w+):/gm)].map(
      (match) => match[1] as string,
    );

    expect(
      mounts.length,
      'No mounts parsed out of the generated file.',
    ).toBeGreaterThan(5);
    expect(
      new Set(mounts).size,
      "Two mounts share a volume name, so two workspaces would overwrite each other's build output.",
    ).toBe(mounts.length);
  });

  it('keeps node_modules off the bind mount', () => {
    expect(generated).toContain(':/workspace/node_modules');
  });
});
