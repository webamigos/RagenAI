/**
 * Every public API route this CLI calls, as `METHOD /path` with `:id` for a
 * path parameter.
 *
 * The CLI shares no contract with apps/api — it is published standalone and
 * talks to installations of other versions — so a renamed route would leave
 * every unit test green and every user with a 404. Two tests hold this list
 * in place from both sides:
 *
 * - `src/__tests__/routes.test.ts` runs every command against a recording
 *   fetch and fails if one calls a route missing here, or if a route listed
 *   here is called by nothing.
 * - `tests/architecture/the-cli-calls-routes-the-api-has.test.ts` fails if a
 *   route here is not declared by a controller in apps/api.
 *
 * Removing a route from apps/api that a published CLI calls is still allowed
 * — old clients exist either way — but it has to be done on purpose, here.
 */
export const API_ROUTES = [
  'GET /v1/healthcheck',
  'GET /v1/models',
  'GET /v1/assistants',
  'GET /v1/files',
  'GET /v1/files/:id',
  'POST /v1/files',
  'DELETE /v1/files/:id',
  'POST /v1/search',
  'POST /v1/chat',
  'GET /v1/brain/next',
  'GET /v1/brain/health',
  'GET /v1/brain/findings',
  'GET /v1/brain/pages',
  'GET /v1/brain/graph',
  'GET /v1/brain/export',
] as const;
