import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseYaml } from 'yaml';

import { describe, expect, it } from 'vitest';

import { routeFileJsonSchema } from '../../packages/llm-gateway/src/json-schema';
import { loadRouteTable } from '../../packages/llm-gateway/src/route-table';

/**
 * `infra/llm-gateway/routes.yaml` is configuration, so nothing typechecks it —
 * a typo in a provider name is a runtime failure on the first turn that picks
 * that model, which is exactly what the schema exists to turn into a boot
 * failure. This runs the schema against the file we actually ship.
 *
 * It also compares the file with `infra/litellm/config.yaml` while both exist.
 * Phase B keeps the proxy reachable behind `LLM_GATEWAY` so the two paths can
 * be compared, and that comparison is meaningless if they serve different
 * models. The proxy config goes away at B6 and this half goes with it.
 */
describe('the shipped LLM route table', () => {
  const root = process.cwd();
  const routeFile = parseYaml(
    readFileSync(join(root, 'infra/llm-gateway/routes.yaml'), 'utf8'),
  ) as unknown;

  it('satisfies its own schema', () => {
    expect(() => loadRouteTable(routeFile)).not.toThrow();
  });

  it('serves exactly the models the proxy serves', () => {
    const yaml = readFileSync(join(root, 'infra/litellm/config.yaml'), 'utf8');
    // Anchored per line so commented-out entries do not count. The proxy config
    // keeps eleven of them — models that were provisioned once and are not
    // registered now, `cohere-rerank-v3-5` among them — and a first attempt at
    // this test read all of them as live and failed against a correct file.
    const proxyModels = [...yaml.matchAll(/^\s*-\s*model_name:\s*(\S+)/gm)]
      .map((match) => match[1])
      .sort();

    const gatewayModels = Object.keys(loadRouteTable(routeFile)).sort();

    expect(gatewayModels).toEqual(proxyModels);
  });

  /**
   * Model names agreeing is not the same as the two paths serving the same
   * thing. The proxy pins `gemini-3-flash-preview` to `vertex_location: global`
   * on that one entry, because Google serves preview models from the global
   * endpoint only — and the route table, which had no per-route location at
   * all, sent it to `VERTEX_LOCATION` and got a 404. The name check above
   * passed throughout. Found by actually running the gateway arm of the B2
   * measurement, which is the thing a guard is supposed to spare you.
   */
  it('pins the same Vertex location the proxy pins, per model', () => {
    const yaml = readFileSync(join(root, 'infra/litellm/config.yaml'), 'utf8');

    // Each live `- model_name:` block up to the next one, so a commented-out
    // entry contributes nothing.
    const blocks = [
      ...yaml.matchAll(
        /^ {2}- model_name:\s*(\S+)\n((?: {4}.*\n|\n(?= {4}))*)/gm,
      ),
    ];
    expect(blocks.length).toBeGreaterThan(0);

    const routes = loadRouteTable(routeFile);

    for (const [, modelName, body] of blocks) {
      const route = routes[modelName!];
      if (route?.provider !== 'vertex') {
        continue;
      }

      const location = body!.match(/vertex_location:\s*(\S+)/)?.[1];
      // `os.environ/VERTEX_LOCATION` means "the deployment's default", which is
      // exactly what a route with no location of its own resolves to.
      const pinned = location?.startsWith('os.environ/') ? undefined : location;

      expect(route.location, `${modelName} location`).toBe(pinned);
    }
  });

  it('names a connection for every openai-compatible route', () => {
    // The provider covers Scaleway, vLLM, Ollama, TGI and a LiteLLM proxy, so
    // "which upstream" is not inferable. The credential source refuses a route
    // without one; catching it here means the file, not the first request.
    for (const [id, route] of Object.entries(loadRouteTable(routeFile))) {
      if (route.provider === 'openai-compatible') {
        expect(route.connection, `${id} needs a connection`).toBeTruthy();
      }
    }
  });

  it('is mounted into every app container, not baked into the image', () => {
    // The whole argument for a file over a compiled-in table is that a
    // deployment can change it without the source tree and a rebuild — which
    // is only true while the file is mounted. It is the same shape
    // infra/litellm/config.yaml already uses.
    //
    // Without this, "the route table is configuration" quietly becomes false
    // the first time somebody adds a service and forgets the volume.
    const compose = readFileSync(
      join(root, 'docker-compose.fullapp.yml'),
      'utf8',
    );
    const services = [...compose.matchAll(/^ {2}([a-z][a-z0-9-]*):$/gm)].map(
      (match) => match[1],
    );
    const mounts = compose.match(/\.\/infra\/llm-gateway:/g) ?? [];

    expect(services.length).toBeGreaterThan(0);
    expect(mounts).toHaveLength(services.length);
  });

  it('ships a JSON Schema that still matches the zod schema', () => {
    // The schema file is what an editor reads, and zod is what actually
    // refuses a bad table. Two descriptions of one shape drift, and the one
    // that would drift unnoticed is the editor's — it never fails a build.
    const onDisk = JSON.parse(
      readFileSync(join(root, 'infra/llm-gateway/routes.schema.json'), 'utf8'),
    ) as unknown;

    expect(onDisk).toEqual(routeFileJsonSchema());
  });
});
