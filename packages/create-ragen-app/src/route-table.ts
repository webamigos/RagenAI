import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Where every app finds the table: `defaultRouteTablePath()` walks up to it. */
export const ROUTE_TABLE_PATH = 'infra/llm-gateway/routes.yaml';

export interface RouteTableEntry {
  /** The id the application asks for — `DEFAULT_MODEL`, `EMBEDDINGS_MODEL`. */
  modelName: string;
  /** A `@ragenai/llm-gateway` provider id. */
  provider: string;
  /** The upstream's own name for the model, which may differ from the id. */
  model: string;
}

/**
 * The route table for a scaffolded installation.
 *
 * Written **over** the table shipped in the repository rather than beside it.
 * Two reasons, and the second is the one that decides it:
 *
 * - The shipped table names Azure, Bedrock, Vertex and Scaleway. A new
 *   installation has credentials for none of them, so every entry in it is a
 *   route to a 401.
 * - `LLM_ROUTES_PATH` would be the alternative, and a *relative* one is a
 *   trap: `routeTableFromEnv` joins it to `process.cwd()`, which is a
 *   different directory for `apps/web`, `apps/api` and `apps/worker`. An
 *   absolute path avoids that and then breaks the moment the directory is
 *   moved. Writing the file where the default lookup already walks to it
 *   needs no variable at all.
 */
export function renderRouteTable(entries: readonly RouteTableEntry[]): string {
  const routes = entries
    .map(
      ({ modelName, provider, model }) =>
        `  ${modelName}:\n    provider: ${provider}\n    model: ${model}\n`,
    )
    .join('');

  return `# Written by create-ragen-app for this installation.
#
# Which upstream serves each model id the application asks for. Ragen calls
# these providers itself, with no proxy in the path.
#
# This replaced the table shipped in the repository, which routes to Azure,
# Bedrock, Vertex and Scaleway. Those entries are not wrong, they are simply
# not yours: nothing here has credentials for them.
#
# To serve another model, add an entry. The key is the id the application asks
# for (DEFAULT_MODEL, EMBEDDINGS_MODEL, REPHRASE_MODEL); \`model\` is the
# upstream's own name for it, which is not always the same string. Credentials
# stay in the environment and never appear here.
version: 1

routes:
${routes}`;
}

export function writeRouteTable(
  targetDir: string,
  entries: readonly RouteTableEntry[],
): void {
  writeFileSync(join(targetDir, ROUTE_TABLE_PATH), renderRouteTable(entries));
}
