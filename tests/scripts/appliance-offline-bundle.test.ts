import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * The offline bundle (appliance spec, C2): `build-bundle.sh` on a connected
 * machine, `install-offline.sh` on the one with no network.
 *
 * Neither script can run for real here — there is no Docker daemon in CI's
 * test job, let alone a 20 GB model pull. So the scripts run against a
 * `docker` that is a shell script on PATH: it records every call and keeps
 * just enough state (which image a tag names, which models are on the
 * volume, what the migrate job exited with) for the scripts' own decisions to
 * be real. What these tests prove is the order and the refusals:
 *
 * - nothing is asked of Docker before every checksum has been verified;
 * - the previous images are given their rollback names before `docker load`
 *   can move a tag off them;
 * - the migrate job runs alone and the apps start only if it exits 0;
 * - nothing is ever pulled or built on the offline side.
 *
 * What they cannot prove is that Docker does what the stub does. That is the
 * untested surface, and the spec says so.
 *
 * Linux only, like the scripts: they use GNU `sed -i`, `sha256sum` and
 * `xargs -d`, and so does install-spark.sh, which the installer calls.
 */

const LINUX = process.platform === 'linux';

const REPO = path.resolve(import.meta.dirname, '../..');
const BUNDLE_DIR = path.join(REPO, 'infra/appliance/bundle');
const LIB = path.join(BUNDLE_DIR, 'lib.sh');
const COMPOSE_FILES = [
  'docker-compose.yml',
  'docker-compose.fullapp.yml',
  'docker-compose.appliance.yml',
];

const read = (file: string) => readFileSync(path.join(REPO, file), 'utf8');

type Service = { image?: string; profiles?: string[] };

/** The appliance stack's images, read from the compose files themselves. */
function stackImages(version: string): string[] {
  const images = new Set<string>();
  const profiled = new Set<string>();
  for (const file of COMPOSE_FILES) {
    const { services } = parseYaml(read(file), { merge: true }) as {
      services: Record<string, Service>;
    };
    for (const [name, service] of Object.entries(services)) {
      if ((service.profiles ?? []).length > 0) {
        profiled.add(name);
      }
      if (service.image && !profiled.has(name)) {
        images.add(service.image.replace('${RAGEN_VERSION:-latest}', version));
      }
    }
  }
  return [...images].sort();
}

function defaultModels(): string[] {
  const match = /APPLIANCE_MODELS:\s*\$\{APPLIANCE_MODELS:-([^}]*)\}/.exec(
    read('docker-compose.appliance.yml'),
  );
  return match![1]!.trim().split(/\s+/);
}

/** Runs a snippet with lib.sh sourced. */
function lib(snippet: string, input?: string) {
  return spawnSync(
    'bash',
    ['-c', `set -euo pipefail; . "${LIB}"; ${snippet}`],
    {
      encoding: 'utf8',
      input,
    },
  );
}

// --- The stand-in for docker ----------------------------------------------------

const DOCKER_STUB = String.raw`#!/usr/bin/env bash
# A docker that records what it was asked and remembers which image a tag
# names. State lives under $STUB.
set -u
S="$STUB"
{ printf 'docker'; printf ' %s' "$@"; printf '\n'; } >>"$S/log"
enc() { printf '%s' "$1" | sed -e 's|/|_S_|g' -e 's|:|_C_|g'; }
dotenv() { grep -E "^$1=" .env 2>/dev/null | tail -n1 | cut -d= -f2-; }
arch="\${STUB_ARCH:-arm64}"
last="\${!#}"
case "$1" in
  info)
    case "$*" in
      *Architecture*) if [ "$arch" = arm64 ]; then echo aarch64; else echo x86_64; fi ;;
      *DockerRootDir*) echo "$S" ;;
    esac
    exit 0 ;;
  pull)
    platform=""
    while [ $# -gt 0 ]; do
      if [ "$1" = --platform ]; then platform="$2"; fi
      shift
    done
    platform="\${STUB_REGISTRY_PLATFORM:-$platform}"
    id="sha256:$(printf '%s' "$last $platform \${STUB_GEN:-1}" | sha256sum | cut -c1-16)"
    printf '%s|%s\n' "$id" "$platform" >"$S/images/$(enc "$last")"
    exit 0 ;;
  image)
    f="$S/images/$(enc "$last")"
    [ -f "$f" ] || exit 1
    case "$*" in
      *.Os*) cut -d'|' -f2 "$f" ;;
      *.Id*) cut -d'|' -f1 "$f" ;;
    esac
    exit 0 ;;
  save)
    out="$3"; shift 3
    for ref in "$@"; do printf '%s|%s\n' "$ref" "$(cat "$S/images/$(enc "$ref")")" >>"$out"; done
    exit 0 ;;
  load)
    while IFS='|' read -r ref id platform; do
      printf '%s|%s\n' "$id" "$platform" >"$S/images/$(enc "$ref")"
    done <"$3"
    exit 0 ;;
  tag)
    [ -f "$S/images/$(enc "$2")" ] || exit 1
    cp "$S/images/$(enc "$2")" "$S/images/$(enc "$3")"
    exit 0 ;;
  rmi) rm -f "$S/images/$(enc "$last")"; exit 0 ;;
  inspect)
    case "$*" in
      # What the install's containers run: "name<TAB>image id" per line.
      *Config.Image*) [ ! -f "$S/containers" ] || cat "$S/containers"; exit 0 ;;
    esac
    if [ "$last" = c-migrate ]; then echo "\${STUB_MIGRATE_EXIT:-0}"; else echo 0; fi
    exit 0 ;;
  volume) exit 0 ;;
  run) echo "GPU 0: stub"; exit 0 ;;
  compose) shift ;;
  *) exit 0 ;;
esac

while [ $# -gt 0 ]; do
  case "$1" in
    --env-file | --profile) shift 2 ;;
    *) break ;;
  esac
done
sub="\${1:-}"
[ $# -gt 0 ] && shift
version="\${RAGEN_VERSION:-$(dotenv RAGEN_VERSION)}"
project="\${COMPOSE_PROJECT_NAME:-$(dotenv COMPOSE_PROJECT_NAME)}"
models="\${APPLIANCE_MODELS:-$(dotenv APPLIANCE_MODELS)}"
case "$sub" in
  version) echo 2.30.0 ;;
  config)
    case "$*" in
      *--images*)
        if [ "$last" = ollama ]; then
          grep '^ollama/' "$S/images.tmpl"
        else
          sed "s/__V__/\${version:-latest}/" "$S/images.tmpl"
        fi ;;
      *json*)
        printf '{\n  "name": "%s",\n  "services": {\n    "ollama-models": {\n      "environment": {\n        "APPLIANCE_MODELS": "%s",\n        "OLLAMA_HOST": "http://ollama:11434"\n      }\n    }\n  }\n}\n' \
          "\${project:-$(basename "$PWD")}" "\${models:-$STUB_MODELS}" ;;
      *) echo "name: \${project:-$(basename "$PWD")}" ;;
    esac ;;
  ps) echo "c-$last" ;;
  exec)
    case "$*" in
      *"ollama show"*) [ -f "$S/models/$(enc "$last")" ] || exit 1 ;;
      *"-cf -"*) for m in $STUB_MODELS; do echo "$m"; done ;;
      *"-xf -"*) while IFS= read -r m; do : >"$S/models/$(enc "$m")"; done ;;
    esac ;;
  *) ;;
esac
exit 0
`.replaceAll('\\${', '${');

const STUB_MODELS = defaultModels().join(' ');

let root: string;
let bin: string;
let fixtureRepo: string;

function sh(cwd: string, command: string, args: string[]) {
  execFileSync(command, args, { cwd, stdio: 'pipe' });
}

/** A machine: its own Docker state, and so its own log of calls. */
function machine(name: string, arch: 'arm64' | 'amd64') {
  const stub = path.join(root, name);
  mkdirSync(path.join(stub, 'images'), { recursive: true });
  mkdirSync(path.join(stub, 'models'), { recursive: true });
  writeFileSync(path.join(stub, 'log'), '');
  writeFileSync(
    path.join(stub, 'images.tmpl'),
    // Twice, as Compose prints an image once per service that uses it.
    [
      ...stackImages('__V__'),
      ...stackImages('__V__').filter((image) => image.startsWith('ollama/')),
    ].join('\n') + '\n',
  );
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    STUB: stub,
    STUB_ARCH: arch,
    STUB_MODELS,
    RAGEN_WEB_WAIT_TRIES: '1',
    RAGEN_WEB_WAIT_SLEEP: '0',
    RAGEN_VERSION: undefined,
    COMPOSE_FILE: undefined,
    COMPOSE_PROJECT_NAME: undefined,
    APPLIANCE_MODELS: undefined,
  } as NodeJS.ProcessEnv;
  return {
    stub,
    dir: path.join(stub, 'opt-ragen'),
    run(script: string, args: string[], extra: Record<string, string> = {}) {
      return spawnSync('bash', [script, ...args], {
        encoding: 'utf8',
        env: { ...env, ...extra },
        cwd: stub,
      });
    },
    log: () =>
      readFileSync(path.join(stub, 'log'), 'utf8').split('\n').filter(Boolean),
    clearLog: () => writeFileSync(path.join(stub, 'log'), ''),
    image: (ref: string) =>
      readFileSync(
        path.join(
          stub,
          'images',
          ref.replaceAll('/', '_S_').replaceAll(':', '_C_'),
        ),
        'utf8',
      ).trim(),
  };
}

function build(
  builder: ReturnType<typeof machine>,
  version: string,
  args: string[] = [],
  extra: Record<string, string> = {},
) {
  const out = path.join(
    root,
    `bundle-${version}-${Math.random().toString(36).slice(2, 8)}`,
  );
  const result = builder.run(
    path.join(BUNDLE_DIR, 'build-bundle.sh'),
    [
      '--version',
      version,
      '--platform',
      'linux/arm64',
      '--repo',
      fixtureRepo,
      '--out',
      out,
      ...args,
    ],
    extra,
  );
  return { out, result };
}

function install(
  target: ReturnType<typeof machine>,
  bundle: string,
  args: string[] = [],
  extra: Record<string, string> = {},
) {
  return target.run(
    path.join(bundle, 'install-offline.sh'),
    ['--dir', target.dir, ...args],
    extra,
  );
}

const dotenv = (file: string, key: string) =>
  new RegExp(`^${key}=(.*)$`, 'm').exec(readFileSync(file, 'utf8'))?.[1];

beforeAll(() => {
  if (!LINUX) {
    return;
  }
  root = mkdtempSync(path.join(tmpdir(), 'ragen-bundle-test-'));
  bin = path.join(root, 'bin');
  mkdirSync(bin);
  writeFileSync(path.join(bin, 'docker'), DOCKER_STUB);
  // install-spark.sh checks the disk and the installer waits for web; neither
  // is what these tests are about.
  writeFileSync(
    path.join(bin, 'df'),
    '#!/bin/sh\necho "Filesystem 1024-blocks Used Available Capacity Mounted on"\necho "/dev/stub 900000000 1 800000000 1% /"\n',
  );
  writeFileSync(path.join(bin, 'curl'), '#!/bin/sh\nprintf 200\n');
  for (const tool of ['docker', 'df', 'curl']) {
    chmodSync(path.join(bin, tool), 0o755);
  }

  // The release being bundled: this working tree's appliance files, as a
  // repository with two tagged releases. A bundle is built from a tag, so the
  // scripts under test have to be in one.
  fixtureRepo = path.join(root, 'repo');
  mkdirSync(fixtureRepo);
  for (const entry of [
    ...COMPOSE_FILES,
    'docker-compose.appliance.gpu.yml',
    'infra/appliance',
    'infra/llm-gateway',
  ]) {
    cpSync(path.join(REPO, entry), path.join(fixtureRepo, entry), {
      recursive: true,
    });
  }
  mkdirSync(path.join(fixtureRepo, 'apps/admin'), { recursive: true });
  writeFileSync(path.join(fixtureRepo, 'apps/admin/.gitkeep'), '');
  const git = (...args: string[]) =>
    sh(fixtureRepo, 'git', [
      '-c',
      'user.name=test',
      '-c',
      'user.email=test@example.com',
      '-c',
      'commit.gpgsign=false',
      '-c',
      'tag.gpgsign=false',
      '-c',
      'core.hooksPath=/dev/null',
      ...args,
    ]);
  git('init', '--quiet', '--initial-branch=main');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'release 9.9.9');
  git('tag', 'v9.9.9');
  writeFileSync(path.join(fixtureRepo, 'RELEASE'), '9.9.10\n');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'release 9.9.10');
  git('tag', 'v9.9.10');
});

afterAll(() => {
  if (!LINUX) {
    return;
  }
  rmSync(root, { recursive: true, force: true });
});

// --- lib.sh ---------------------------------------------------------------------

describe.skipIf(!LINUX)('lib.sh', () => {
  it('names an architecture the way an image does', () => {
    expect(lib('normalize_arch aarch64').stdout).toBe('arm64');
    expect(lib('normalize_arch x86_64').stdout).toBe('amd64');
    expect(lib('platform_arch linux/arm64').stdout).toBe('arm64');
  });

  it('lists each image once', () => {
    const out = lib('unique_images', 'b:1\na:2  \n\nb:1\n').stdout;
    expect(out).toBe('a:2\nb:1\n');
  });

  it('reads the models out of the config JSON, not the folded YAML', () => {
    const json = [
      '{',
      '  "name": "ragen",',
      '      "environment": {',
      '        "APPLIANCE_MODELS": "SpeakLeash/bielik:Q4_K_M qwen2.5:7b  bge-m3",',
      '        "OLLAMA_HOST": "http://ollama:11434"',
      '    "APPLIANCE_MODELS": "something else"',
      '}',
    ].join('\n');
    expect(lib('compose_json_models', json).stdout).toBe(
      'SpeakLeash/bielik:Q4_K_M\nqwen2.5:7b\nbge-m3\n',
    );
    expect(lib('compose_json_project', json).stdout).toBe('ragen\n');
  });

  it('gives every image a rollback name that is a valid reference', () => {
    const name = (image: string) => lib(`rollback_ref '${image}' 1.4.0`).stdout;
    expect(name('ghcr.io/webamigos/ragen-web:1.4.0')).toBe(
      'ragen-rollback/ghcr.io/webamigos/ragen-web:1.4.0--1.4.0',
    );
    expect(name('postgres:16')).toBe('ragen-rollback/postgres:16--1.4.0');
    expect(name('ragen-basal')).toBe(
      'ragen-rollback/ragen-basal:latest--1.4.0',
    );
    expect(name('localhost:5000/Team/app:2')).toBe(
      'ragen-rollback/localhost-5000/team/app:2--1.4.0',
    );
    // A digest cannot move, so there is nothing to keep.
    expect(lib("rollback_ref 'postgres@sha256:abc' 1.4.0").status).toBe(1);
    for (const image of stackImages('1.4.0')) {
      expect(name(image)).toMatch(
        /^ragen-rollback\/[a-z0-9._/-]+:[\w.-]{1,128}$/,
      );
    }
  });

  it('refuses values that are not a version, an image or a model', () => {
    expect(lib('valid_version 1.4.0').status).toBe(0);
    expect(lib("valid_version '1.4.0|x'").status).toBe(1);
    expect(lib("valid_image_ref 'postgres:16; rm -rf /'").status).toBe(1);
    expect(lib("valid_model '$(id)'").status).toBe(1);
    expect(lib('valid_platform linux/arm64').status).toBe(0);
    expect(lib('valid_platform windows/amd64').status).toBe(1);
    for (const model of defaultModels()) {
      expect(lib(`valid_model '${model}'`).status).toBe(0);
    }
  });

  it('finds the files edited since a release put them there', () => {
    const dir = mkdtempSync(path.join(root, 'changed-'));
    writeFileSync(path.join(dir, 'a.yml'), 'a\n');
    writeFileSync(path.join(dir, 'b.yml'), 'b\n');
    writeFileSync(path.join(dir, 'c.yml'), 'c\n');
    execFileSync('bash', ['-c', 'sha256sum a.yml b.yml c.yml > sums'], {
      cwd: dir,
    });
    writeFileSync(path.join(dir, 'b.yml'), 'edited\n');
    rmSync(path.join(dir, 'c.yml'));

    expect(lib(`changed_files '${dir}' '${dir}/sums'`).stdout).toBe('b.yml\n');
  });
});

const dockerCompose = spawnSync('docker', ['compose', 'version'], {
  encoding: 'utf8',
});

describe.skipIf(!LINUX || dockerCompose.status !== 0)(
  'lib.sh against the real Compose (no daemon needed)',
  () => {
    const config = (...args: string[]) =>
      execFileSync(
        'docker',
        ['compose', '--env-file', '/dev/null', 'config', ...args],
        {
          cwd: REPO,
          encoding: 'utf8',
          env: {
            ...process.env,
            COMPOSE_FILE: COMPOSE_FILES.join(':'),
            COMPOSE_PROFILES: '',
            COMPOSE_PROJECT_NAME: 'ragen-test',
            RAGEN_VERSION: '9.9.9',
            APPLIANCE_MODELS: '',
          },
        },
      );

    it('derives the image list Compose resolves for the appliance files', () => {
      const out = lib('unique_images', config('--images')).stdout;
      expect(out.trim().split('\n')).toEqual(stackImages('9.9.9'));
    });

    it('reads the model list and the project from the JSON form', () => {
      const json = config('--format', 'json');
      expect(
        lib('compose_json_models', json).stdout.trim().split('\n'),
      ).toEqual(defaultModels());
      expect(lib('compose_json_project', json).stdout).toBe('ragen-test\n');
    });
  },
);

// --- build-bundle.sh ------------------------------------------------------------

describe.skipIf(!LINUX)('build-bundle.sh', () => {
  it("writes a bundle whose images and models are the stack's own", () => {
    const builder = machine('builder-ok', 'amd64');
    const { out, result } = build(builder, '9.9.9');
    expect(result.stderr + result.stdout).toContain('Paczka gotowa');
    expect(result.status).toBe(0);

    const images = readFileSync(path.join(out, 'images.tsv'), 'utf8')
      .trim()
      .split('\n')
      .map((line) => line.split('\t'));
    expect(images.map(([ref]) => ref)).toEqual(stackImages('9.9.9'));
    expect(new Set(images.map(([, , platform]) => platform))).toEqual(
      new Set(['linux/arm64']),
    );
    expect(
      readFileSync(path.join(out, 'models.txt'), 'utf8').trim().split('\n'),
    ).toEqual(defaultModels());

    const manifest = path.join(out, 'manifest.env');
    expect(dotenv(manifest, 'RAGEN_VERSION')).toBe('9.9.9');
    expect(dotenv(manifest, 'PLATFORM')).toBe('linux/arm64');
    expect(dotenv(manifest, 'GIT_REF')).toBe('v9.9.9');
    expect(dotenv(manifest, 'GPU_CHECK_IMAGE')).toMatch(/^ollama\/ollama:/);

    // Every file is in SHA256SUMS, and the sums hold.
    execFileSync(
      'sha256sum',
      ['--check', '--strict', '--quiet', 'SHA256SUMS'],
      {
        cwd: out,
      },
    );
    const listed = readFileSync(path.join(out, 'SHA256SUMS'), 'utf8');
    for (const file of [
      'images.tar',
      'checkout.tar.gz',
      'ollama-models.tar',
      'manifest.env',
      'images.tsv',
      'models.txt',
      'checkout.sha256',
      'install-offline.sh',
      'lib.sh',
    ]) {
      expect(listed).toMatch(
        new RegExp(`^[0-9a-f]{64} [ *]${file.replace('.', '\\.')}$`, 'm'),
      );
    }
    expect(result.stdout).toContain(
      execFileSync('sha256sum', ['SHA256SUMS'], {
        cwd: out,
        encoding: 'utf8',
      }).slice(0, 64),
    );

    // The model pull runs this machine's Ollama, so it comes before the pull
    // that may move the tag to another architecture.
    const log = builder.log();
    const modelsUp = log.findIndex((line) =>
      line.includes('up -d ollama ollama-models'),
    );
    const firstPull = log.findIndex((line) => line.startsWith('docker pull '));
    expect(modelsUp).toBeGreaterThan(-1);
    expect(firstPull).toBeGreaterThan(modelsUp);
    expect(log.filter((line) => line.startsWith('docker pull '))).toHaveLength(
      images.length,
    );
    for (const line of log.filter((entry) =>
      entry.startsWith('docker pull '),
    )) {
      expect(line).toContain('--platform linux/arm64');
    }
  });

  it('refuses `latest` and a release that is not tagged', () => {
    const builder = machine('builder-refuse', 'amd64');
    expect(build(builder, 'latest').result.status).toBe(1);
    const untagged = build(builder, '1.0.0');
    expect(untagged.result.status).toBe(1);
    expect(untagged.result.stderr).toContain('v1.0.0');
    expect(
      builder.log().filter((line) => line.startsWith('docker pull')),
    ).toEqual([]);
  });

  it('refuses an image the registry returned for another architecture', () => {
    const builder = machine('builder-arch', 'amd64');
    const { out, result } = build(builder, '9.9.9', [], {
      STUB_REGISTRY_PLATFORM: 'linux/amd64',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('linux/amd64');
    expect(existsSync(path.join(out, 'SHA256SUMS'))).toBe(false);
  });

  it('leaves the weights out with --no-models, and says so in the manifest', () => {
    const builder = machine('builder-nomodels', 'arm64');
    const { out, result } = build(builder, '9.9.9', ['--no-models']);
    expect(result.status).toBe(0);
    expect(existsSync(path.join(out, 'ollama-models.tar'))).toBe(false);
    expect(readFileSync(path.join(out, 'models.txt'), 'utf8')).toBe('');
    expect(dotenv(path.join(out, 'manifest.env'), 'MODELS_INCLUDED')).toBe('0');
    expect(builder.log().some((line) => line.includes('ollama-models'))).toBe(
      false,
    );
  });
});

// --- install-offline.sh ---------------------------------------------------------

describe.skipIf(!LINUX)('install-offline.sh', () => {
  let bundle: string;
  let upgradeBundle: string;

  beforeAll(() => {
    const builder = machine('builder-main', 'amd64');
    bundle = build(builder, '9.9.9').out;
    upgradeBundle = build(builder, '9.9.10', [], { STUB_GEN: '2' }).out;
    expect(existsSync(path.join(upgradeBundle, 'SHA256SUMS'))).toBe(true);
  });

  const copyOf = (source: string) => {
    const copy = mkdtempSync(path.join(root, 'copy-'));
    cpSync(source, copy, { recursive: true });
    return copy;
  };

  it('asks Docker for nothing when a checksum does not match', () => {
    const target = machine('target-tampered', 'arm64');
    const tampered = copyOf(bundle);
    appendFileSync(path.join(tampered, 'images.tar'), 'x');

    const result = install(target, tampered);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('images.tar');
    expect(target.log()).toEqual([]);
    expect(existsSync(target.dir)).toBe(false);
  });

  it('refuses a bundle whose SHA256SUMS is not the one the builder announced', () => {
    const target = machine('target-expect', 'arm64');
    const result = install(target, bundle, ['--expect-sha256', '0'.repeat(64)]);
    expect(result.status).toBe(1);
    expect(target.log()).toEqual([]);

    const digest = execFileSync('sha256sum', ['SHA256SUMS'], {
      cwd: bundle,
      encoding: 'utf8',
    }).slice(0, 64);
    const ok = install(target, bundle, [
      '--expect-sha256',
      digest,
      '--verify-only',
    ]);
    expect(ok.status).toBe(0);
    expect(target.log()).toEqual([]);
  });

  it('refuses a bundle whose sums file leaves out a file it will read', () => {
    const target = machine('target-unlisted', 'arm64');
    const partial = copyOf(bundle);
    const sums = path.join(partial, 'SHA256SUMS');
    writeFileSync(
      sums,
      readFileSync(sums, 'utf8')
        .split('\n')
        .filter((line) => !line.endsWith(' images.tar'))
        .join('\n'),
    );
    const result = install(target, partial);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('images.tar');
    expect(target.log()).toEqual([]);
  });

  it('refuses a manifest value that is not what it claims to be', () => {
    const target = machine('target-manifest', 'arm64');
    const odd = copyOf(bundle);
    appendFileSync(
      path.join(odd, 'images.tsv'),
      'postgres:16;reboot\tsha256:x\tlinux/arm64\n',
    );
    execFileSync('bash', ['-c', `. "${LIB}"; write_sums "${odd}" >/dev/null`]);
    const result = install(target, odd);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('images.tsv');
    expect(target.log()).toEqual([]);
  });

  it('refuses a bundle built for another architecture before loading it', () => {
    const target = machine('target-arch', 'amd64');
    const result = install(target, bundle);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('linux/amd64');
    expect(target.log().some((line) => line.startsWith('docker load'))).toBe(
      false,
    );
  });

  it('does not start the apps when the migrate job fails', () => {
    const target = machine('target-migrate', 'arm64');
    const result = install(target, bundle, ['--cpu'], {
      STUB_MIGRATE_EXIT: '1',
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('migrate');

    const log = target.log();
    expect(log.some((line) => line.endsWith('--force-recreate migrate'))).toBe(
      true,
    );
    expect(log).not.toContain('docker compose up -d --pull never --no-build');
    expect(existsSync(path.join(target.dir, '.ragen-bundle/state.env'))).toBe(
      false,
    );
  });

  it('refuses to start when a model the install needs is not in the bundle', () => {
    const builder = machine('builder-nomodels-2', 'arm64');
    const bare = build(builder, '9.9.9', ['--no-models']).out;
    const target = machine('target-nomodels', 'arm64');
    const result = install(target, bare, ['--cpu']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bge-m3');
    expect(
      target.log().some((line) => line.endsWith('--force-recreate migrate')),
    ).toBe(false);
  });

  describe('a fresh install, an upgrade and the way back', () => {
    const target = () => shared;
    let shared: ReturnType<typeof machine>;
    let secret: string | undefined;

    beforeAll(() => {
      shared = machine('target-main', 'arm64');
    });

    it('installs: verify, load, environment, models, migrate, then the apps', () => {
      const result = install(target(), bundle, ['--host', 'ragen.internal']);
      expect(result.stderr + result.stdout).toContain('Ragen 9.9.9');
      expect(result.status).toBe(0);

      const log = target().log();
      const at = (needle: string) =>
        log.findIndex((line) => line.includes(needle));
      expect(at('docker load -i')).toBeGreaterThan(-1);
      expect(at('--wait ollama')).toBeGreaterThan(at('docker load -i'));
      expect(at('-xf -')).toBeGreaterThan(at('--wait ollama'));
      expect(at('--force-recreate migrate')).toBeGreaterThan(at('-xf -'));
      expect(
        log.indexOf('docker compose up -d --pull never --no-build'),
      ).toBeGreaterThan(at('--force-recreate migrate'));

      // Nothing is pulled and nothing is built, on any call.
      expect(
        log.filter((line) => /^docker (compose )?pull\b/.test(line)),
      ).toEqual([]);
      for (const line of log.filter((entry) => entry.includes('compose up '))) {
        expect(line).toContain('--pull never --no-build');
      }
      for (const line of log.filter((entry) =>
        entry.startsWith('docker run '),
      )) {
        expect(line).toContain('--pull never');
      }

      const env = path.join(target().dir, '.env');
      expect(dotenv(env, 'RAGEN_VERSION')).toBe('9.9.9');
      expect(dotenv(env, 'COMPOSE_FILE')).toBe(
        [...COMPOSE_FILES, 'docker-compose.appliance.gpu.yml'].join(':'),
      );
      const local = path.join(target().dir, '.env.local');
      secret = dotenv(local, 'BETTER_AUTH_SECRET');
      expect(secret).toMatch(/^[0-9a-f]{64}$/);
      expect(dotenv(local, 'APP_URL')).toBe('http://ragen.internal:3000');
      expect(
        dotenv(
          path.join(target().dir, 'apps/admin/.env.local'),
          'INTERNAL_API_SECRET',
        ),
      ).toBe(dotenv(local, 'INTERNAL_API_SECRET'));

      const state = path.join(target().dir, '.ragen-bundle/state.env');
      expect(dotenv(state, 'CURRENT_VERSION')).toBe('9.9.9');
      expect(dotenv(state, 'PREVIOUS_VERSION')).toBeUndefined();
    });

    it('re-runs without restoring the models again or inventing a way back', () => {
      target().clearLog();
      const result = install(target(), bundle);
      expect(result.status).toBe(0);
      expect(
        target()
          .log()
          .some((line) => line.includes('-xf -')),
      ).toBe(false);
      expect(
        existsSync(
          path.join(target().dir, '.ragen-bundle/rollback-images.tsv'),
        ),
      ).toBe(false);
      expect(
        dotenv(path.join(target().dir, '.env.local'), 'BETTER_AUTH_SECRET'),
      ).toBe(secret);
      expect(dotenv(path.join(target().dir, '.env.local'), 'APP_URL')).toBe(
        'http://ragen.internal:3000',
      );
    });

    it('refuses to overwrite a file edited on the machine until told which stays', () => {
      const routes = path.join(
        target().dir,
        'infra/llm-gateway/routes.appliance.yaml',
      );
      appendFileSync(routes, '# a swapped model\n');
      // The operator added the PII overlay by hand; an upgrade must keep it.
      const env = path.join(target().dir, '.env');
      writeFileSync(
        env,
        readFileSync(env, 'utf8').replace(
          /^(COMPOSE_FILE=.*)$/m,
          '$1:docker-compose.pii.yml',
        ),
      );
      target().clearLog();

      const result = install(target(), upgradeBundle);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'infra/llm-gateway/routes.appliance.yaml',
      );
      expect(result.stderr).toContain('--local-changes');
      expect(
        target()
          .log()
          .some((line) => line.startsWith('docker load')),
      ).toBe(false);
      expect(
        target()
          .log()
          .some((line) => line.startsWith('docker tag')),
      ).toBe(false);
      expect(dotenv(env, 'RAGEN_VERSION')).toBe('9.9.9');
    });

    it('upgrades: the old images get their rollback names before the load', () => {
      const oldPostgres = target().image('postgres:16');
      target().clearLog();

      const result = install(target(), upgradeBundle, [
        '--local-changes',
        'keep',
      ]);
      expect(result.stderr + result.stdout).toContain('Ragen 9.9.10');
      expect(result.status).toBe(0);

      const log = target().log();
      const load = log.findIndex((line) => line.startsWith('docker load'));
      const tags = log
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => line.startsWith('docker tag '));
      expect(tags.length).toBe(stackImages('9.9.9').length);
      for (const { index } of tags) {
        expect(index).toBeLessThan(load);
      }
      // The moving tag moved, and the old image is still reachable.
      expect(target().image('postgres:16')).not.toBe(oldPostgres);
      expect(target().image('ragen-rollback/postgres:16--9.9.9')).toBe(
        oldPostgres,
      );

      const dir = target().dir;
      expect(dotenv(path.join(dir, '.env'), 'RAGEN_VERSION')).toBe('9.9.10');
      expect(dotenv(path.join(dir, '.env'), 'COMPOSE_FILE')).toContain(
        'docker-compose.pii.yml',
      );
      expect(dotenv(path.join(dir, '.env.local'), 'BETTER_AUTH_SECRET')).toBe(
        secret,
      );
      expect(readFileSync(path.join(dir, 'RELEASE'), 'utf8')).toBe('9.9.10\n');

      const routes = path.join(dir, 'infra/llm-gateway/routes.appliance.yaml');
      expect(readFileSync(routes, 'utf8')).toContain('# a swapped model');
      expect(readFileSync(`${routes}.release-9.9.10`, 'utf8')).not.toContain(
        '# a swapped model',
      );

      const state = path.join(dir, '.ragen-bundle/state.env');
      expect(dotenv(state, 'CURRENT_VERSION')).toBe('9.9.10');
      expect(dotenv(state, 'PREVIOUS_VERSION')).toBe('9.9.9');
      expect(
        existsSync(path.join(dir, '.ragen-bundle/checkout-9.9.9.tar.gz')),
      ).toBe(true);
      // Models were already on the volume: an upgrade restores nothing.
      expect(log.some((line) => line.includes('-xf -'))).toBe(false);
      expect(
        log.indexOf('docker compose up -d --pull never --no-build'),
      ).toBeGreaterThan(
        log.findIndex((line) => line.endsWith('--force-recreate migrate')),
      );
    });

    it('re-runs the upgrade without re-pointing the rollback names at the new images', () => {
      const kept = target().image('ragen-rollback/postgres:16--9.9.9');
      target().clearLog();
      const result = install(target(), upgradeBundle, [
        '--local-changes',
        'keep',
      ]);
      expect(result.status).toBe(0);
      expect(
        target()
          .log()
          .some((line) => line.startsWith('docker tag ')),
      ).toBe(false);
      expect(target().image('ragen-rollback/postgres:16--9.9.9')).toBe(kept);
      expect(
        dotenv(
          path.join(target().dir, '.ragen-bundle/state.env'),
          'PREVIOUS_VERSION',
        ),
      ).toBe('9.9.9');
    });

    it('rolls back: re-tags, puts the files back, migrates, restarts', () => {
      const kept = target().image('ragen-rollback/postgres:16--9.9.9');
      target().clearLog();
      const result = target().run(
        path.join(target().dir, 'infra/appliance/bundle/install-offline.sh'),
        ['--dir', target().dir, '--rollback'],
      );
      expect(result.status).toBe(0);

      const dir = target().dir;
      expect(target().image('postgres:16')).toBe(kept);
      expect(dotenv(path.join(dir, '.env'), 'RAGEN_VERSION')).toBe('9.9.9');
      expect(dotenv(path.join(dir, '.env.local'), 'BETTER_AUTH_SECRET')).toBe(
        secret,
      );
      const log = target().log();
      expect(log.filter((line) => line.startsWith('docker load'))).toEqual([]);
      expect(log).toContain('docker compose up -d --pull never --no-build');
      const state = path.join(dir, '.ragen-bundle/state.env');
      expect(dotenv(state, 'CURRENT_VERSION')).toBe('9.9.9');
      expect(dotenv(state, 'PREVIOUS_VERSION')).toBe('');

      // One step back is all that is kept.
      const again = target().run(
        path.join(dir, 'infra/appliance/bundle/install-offline.sh'),
        ['--dir', dir, '--rollback'],
      );
      expect(again.status).toBe(1);
    });
  });

  // The installer unpacks either archive when it finds it. One dropped into a
  // bundle built without it is not under the checksums, so it must not pass.
  it('refuses a models archive that the sums file does not list', () => {
    const builder = machine('builder-nomodels', 'amd64');
    const slim = build(builder, '9.9.9', ['--no-models']).out;
    expect(existsSync(path.join(slim, 'ollama-models.tar'))).toBe(false);
    writeFileSync(path.join(slim, 'ollama-models.tar'), 'not what was built');
    const target = machine('target-planted', 'arm64');

    const result = install(target, slim);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ollama-models.tar');
    expect(target.log()).toEqual([]);
  });

  it('keeps the ports an install was moved to through an upgrade', () => {
    const target = machine('target-ports', 'arm64');
    expect(install(target, bundle, ['--cpu']).status).toBe(0);
    const env = path.join(target.dir, '.env');
    writeFileSync(
      env,
      readFileSync(env, 'utf8')
        .replace(/^WEB_PORT=.*$/m, 'WEB_PORT=8080')
        .replace(/^ADMIN_PORT=.*$/m, 'ADMIN_PORT=8200'),
    );

    expect(install(target, upgradeBundle, [], { STUB_GEN: '2' }).status).toBe(
      0,
    );

    expect(dotenv(env, 'WEB_PORT')).toBe('8080');
    expect(dotenv(env, 'ADMIN_PORT')).toBe('8200');
  });

  // An online install that failed between its pull and its recreate leaves a
  // tag pointing past the container that still runs the earlier image.
  it('keeps the image a container runs, not the one its tag has moved to', () => {
    const target = machine('target-moved-tag', 'arm64');
    expect(install(target, bundle, ['--cpu']).status).toBe(0);
    const running = 'sha256:therunningone';
    writeFileSync(
      path.join(target.stub, 'images', 'sha256_C_therunningone'),
      `${running}|linux/arm64\n`,
    );
    writeFileSync(
      path.join(target.stub, 'containers'),
      `postgres:16\t${running}\n`,
    );
    expect(target.image('postgres:16')).not.toContain(running);

    expect(install(target, upgradeBundle, [], { STUB_GEN: '2' }).status).toBe(
      0,
    );

    expect(target.image('ragen-rollback/postgres:16--9.9.9')).toContain(
      running,
    );
    // A service with no container falls back to what its name points at.
    expect(target.image('ragen-rollback/redis:7-alpine--9.9.9')).toBeTruthy();
  });

  it('keeps the way back when the rolled-back stack fails to start', () => {
    const target = machine('target-rollback-retry', 'arm64');
    expect(install(target, bundle, ['--cpu']).status).toBe(0);
    expect(install(target, upgradeBundle, [], { STUB_GEN: '2' }).status).toBe(
      0,
    );
    const installer = path.join(
      target.dir,
      'infra/appliance/bundle/install-offline.sh',
    );
    const state = path.join(target.dir, '.ragen-bundle/state.env');

    const failed = target.run(installer, ['--dir', target.dir, '--rollback'], {
      STUB_MIGRATE_EXIT: '1',
    });
    expect(failed.status).toBe(1);
    expect(dotenv(state, 'PREVIOUS_VERSION')).toBe('9.9.9');
    expect(dotenv(state, 'CURRENT_VERSION')).toBe('9.9.10');

    const retried = target.run(installer, ['--dir', target.dir, '--rollback']);
    expect(retried.status).toBe(0);
    expect(dotenv(state, 'CURRENT_VERSION')).toBe('9.9.9');
    expect(dotenv(state, 'PREVIOUS_VERSION')).toBe('');
  });

  // --env-only pulls nothing. Without a check image named from outside, the
  // GPU check would run the default one, which Docker pulls when missing.
  it('runs no container from install-spark.sh --env-only without a check image', () => {
    const target = machine('target-env-only', 'arm64');
    expect(install(target, bundle, ['--cpu']).status).toBe(0);
    target.clearLog();

    const result = target.run(
      path.join(target.dir, 'infra/appliance/install-spark.sh'),
      ['--env-only', '--version', '9.9.9'],
    );

    expect(result.status).toBe(0);
    expect(target.log().some((line) => line.startsWith('docker run'))).toBe(
      false,
    );
  });

  it('will not roll back onto an image that has been pruned', () => {
    const target = machine('target-pruned', 'arm64');
    expect(install(target, bundle, ['--cpu']).status).toBe(0);
    expect(install(target, upgradeBundle, [], { STUB_GEN: '2' }).status).toBe(
      0,
    );
    rmSync(
      path.join(target.stub, 'images', 'ragen-rollback_S_postgres_C_16--9.9.9'),
    );
    target.clearLog();

    const result = target.run(
      path.join(target.dir, 'infra/appliance/bundle/install-offline.sh'),
      ['--dir', target.dir, '--rollback'],
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ragen-rollback/postgres:16--9.9.9');
    expect(target.log().some((line) => line.startsWith('docker tag'))).toBe(
      false,
    );
    expect(dotenv(path.join(target.dir, '.env'), 'RAGEN_VERSION')).toBe(
      '9.9.10',
    );
    // A CPU install stays one through an upgrade that did not say --cpu.
    expect(dotenv(path.join(target.dir, '.env'), 'COMPOSE_FILE')).toBe(
      COMPOSE_FILES.join(':'),
    );
  });
});
