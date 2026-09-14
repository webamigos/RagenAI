import { z } from 'zod';

import { ROUTE_FILE_SCHEMA } from './route-table';

/**
 * The JSON Schema for `routes.yaml`, derived from the zod schema that actually
 * validates it.
 *
 * It exists for the editor. A YAML route table is loadable at runtime, which a
 * TypeScript one would not be — that is Q6 — but TypeScript would have given
 * autocomplete and inline errors while writing it. A `$schema` reference plus
 * this file closes that gap: `yaml-language-server` offers the provider names
 * and underlines a typo before anything is deployed.
 *
 * Generated rather than hand-written, and guarded, because two descriptions of
 * the same shape drift — and the one the editor shows would be the one nothing
 * enforces.
 */
export function routeFileJsonSchema(): Record<string, unknown> {
  return {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Ragen LLM gateway route table',
    ...z.toJSONSchema(ROUTE_FILE_SCHEMA, { target: 'draft-7' }),
  };
}
