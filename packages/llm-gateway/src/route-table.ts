import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

import { PROVIDER_IDS, type Route, type RouteTable } from './types';

/**
 * The route table is **configuration, not a constant**, and that is a decision
 * rather than a style preference — see Q6 in
 * `docs/specs/2026-09-14-replace-litellm-with-an-in-process-gateway.md`.
 *
 * Retiring LiteLLM as the default does not end support for running one, and
 * what is actually supported is any OpenAI-compatible endpoint: LiteLLM, vLLM,
 * Ollama, TGI, AI Gateway. That only holds if adding one is a configuration
 * change. A table compiled into this package would make attaching an endpoint
 * a fork of it, which is the failure Q6 exists to prevent.
 *
 * A file today; the shape anticipates a database later, when per-organization
 * and per-team routing arrives. Hence `loadRouteTable` taking the parsed
 * content rather than reading the disk itself — the source is swappable and
 * the validation is not. An application that would rather build the table in
 * code can: `LlmGateway` takes a plain `RouteTable`, which is where anyone
 * wanting types and comments should go. The file exists for the deployment
 * that does not want to touch code at all.
 *
 * YAML rather than JSON, for comments. A route table is the kind of file where
 * "why is this model pointed there" needs saying next to the line, and the
 * proxy config it replaces was YAML too, so an operator reads the same shape.
 */
const routeSchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  model: z.string().min(1),
  connection: z.string().min(1).optional(),
});

/**
 * Exported so the JSON Schema beside the route file can be generated from it
 * rather than written twice. `routes.schema.json` is what gives an editor
 * autocomplete and inline validation over a YAML file — the one real advantage
 * a TypeScript route table would have had — and a guard regenerates it to make
 * sure the two cannot drift.
 */
export const ROUTE_FILE_SCHEMA = z.object({
  /** Bumped only for a breaking change to this file's shape. */
  version: z.literal(1),
  routes: z.record(z.string().min(1), routeSchema),
});

export type RouteFile = z.infer<typeof ROUTE_FILE_SCHEMA>;

export class InvalidRouteTableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRouteTableError';
  }
}

/**
 * Validate an already-parsed route table.
 *
 * Fails loudly and early: a typo in a provider name has to surface at boot,
 * not on the first chat turn that happens to select that model. The proxy it
 * replaces had the same property — a bad `config.yaml` stopped the container.
 */
export function loadRouteTable(parsed: unknown): RouteTable {
  const result = ROUTE_FILE_SCHEMA.safeParse(parsed);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new InvalidRouteTableError(`invalid route table — ${issues}`);
  }

  return Object.freeze({ ...result.data.routes });
}

/** Where the route table lives when nothing says otherwise. */
export const DEFAULT_ROUTE_TABLE_PATH = 'infra/llm-gateway/routes.yaml';

/** Read and validate a route table from a YAML file. */
export function readRouteTableFile(path: string): RouteTable {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new InvalidRouteTableError(
      `cannot read route table at ${path}: ${(cause as Error).message}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(raw) as unknown;
  } catch (cause) {
    throw new InvalidRouteTableError(
      `route table at ${path} is not valid YAML: ${(cause as Error).message}`,
    );
  }

  return loadRouteTable(parsed);
}

/**
 * The route table this process should use.
 *
 * `LLM_ROUTES_PATH` is what makes the shipped file a default rather than a law:
 * the table under `infra/` is Ragen's own installation, and a deployment that
 * runs one provider — or three models, or its own Ollama — points this at its
 * own file instead of editing ours.
 */
export function routeTableFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): RouteTable {
  return readRouteTableFile(env.LLM_ROUTES_PATH || DEFAULT_ROUTE_TABLE_PATH);
}

/**
 * The route for a model id, or `undefined` when it has none.
 *
 * Returning `undefined` rather than throwing is deliberate: "this deployment
 * does not serve that model" is an ordinary answer an allowlist check or a
 * model picker wants to act on, not an exception.
 */
export function findRoute(
  table: RouteTable,
  modelId: string,
): Route | undefined {
  return table[modelId];
}
