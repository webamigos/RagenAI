import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * The third-party services in the standard stack do not call home.
 *
 * `npm run appliance:egress-check` found Qdrant reporting to
 * telemetry.qdrant.io, Docling asking huggingface.co and sending onnxruntime
 * telemetry, and Gradio's analytics — in every install, not only the offline
 * one. The switches live in the base compose file, so the appliance overlay
 * inherits them; this fails if one is dropped there. A comment cannot hold
 * that: the overlay used to carry them, and nothing said the base did not.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const read = (path: string) => readFileSync(join(REPO_ROOT, path), 'utf8');

type Compose = {
  services: Record<string, { environment?: Record<string, string | number> }>;
};

const SWITCHES: Record<string, Record<string, string>> = {
  qdrant: { QDRANT__TELEMETRY_DISABLED: 'true' },
  docling: {
    HF_HUB_OFFLINE: '1',
    HF_HUB_DISABLE_TELEMETRY: '1',
    ORT_DISABLE_TELEMETRY: '1',
    GRADIO_ANALYTICS_ENABLED: 'False',
  },
};

const PRISMA_APPS = ['migrate', 'web', 'api', 'worker', 'admin'];

/** The images whose base stage every Prisma-running stage inherits from. */
const PRISMA_IMAGES = ['web', 'api', 'worker', 'admin'];

describe('third-party telemetry in the standard stack', () => {
  const base = parse(read('docker-compose.yml')) as Compose;

  for (const [service, switches] of Object.entries(SWITCHES)) {
    it(`is off for ${service} in docker-compose.yml`, () => {
      const env = base.services[service]?.environment ?? {};
      for (const [name, value] of Object.entries(switches)) {
        expect(String(env[name]), `${service}.${name}`).toBe(value);
      }
    });
  }

  it("keeps Docling's UI off unless an operator turns it on", () => {
    expect(base.services.docling?.environment?.DOCLING_SERVE_ENABLE_UI).toBe(
      '${DOCLING_SERVE_ENABLE_UI:-false}',
    );
  });

  it("is off for Prisma's checkpoint in every app container", () => {
    const fullapp = parse(read('docker-compose.fullapp.yml')) as Compose;
    for (const app of PRISMA_APPS) {
      expect(
        String(fullapp.services[app]?.environment?.CHECKPOINT_DISABLE),
        app,
      ).toBe('1');
    }
  });

  it("is off for Prisma's checkpoint in every app image, not only in compose", () => {
    // A deploy that runs the published images directly — Railway, a plain
    // `docker run` — never reads docker-compose.fullapp.yml.
    for (const app of PRISMA_IMAGES) {
      const dockerfile = read(`apps/${app}/Dockerfile`);
      const base = dockerfile.slice(
        dockerfile.indexOf(' AS base'),
        dockerfile.indexOf('\nFROM ', dockerfile.indexOf(' AS base')),
      );
      expect(base, `apps/${app}/Dockerfile base stage`).toMatch(
        /^ENV CHECKPOINT_DISABLE=1$/m,
      );
    }
  });
});
