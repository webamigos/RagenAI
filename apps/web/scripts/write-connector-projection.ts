 
/**
 * Regenerates `prisma/catalog/built-in-connectors.json` from the provider
 * manifests.
 *
 * Run it after changing a built-in manifest's label, description, icon, auth
 * type, scopes or system prompt:
 *
 *   npm run connectors:projection --workspace @ragenai/web
 *
 * `built-in-projection.test.ts` fails until you do.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectBuiltInCatalogue } from '@/features/connectors/providers/built-in-projection';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(
  here,
  '../../../prisma/catalog/built-in-connectors.json',
);

writeFileSync(
  target,
  `${JSON.stringify(projectBuiltInCatalogue(), null, 2)}\n`,
);
console.log(`Wrote ${target}`);
