import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Writes the built-in catalogue entries from
 * `prisma/catalog/built-in-connectors.json`.
 *
 * The migration seeds the same rows, so a deployment that only runs
 * `prisma migrate deploy` has them. This runs from `npm run db:seed` as well,
 * which covers a developer database created before the migration existed and a
 * built-in added to the projection after it.
 *
 * It reads JSON rather than importing `PROVIDER_LIST`: that pulls in every
 * manifest, and `shared-config.ts` plus the HubSpot and Slack manifests read
 * server URLs and OAuth client secrets from `process.env` at module load. A
 * seed runner has no business loading either.
 */
export type BuiltInCatalogRow = {
  slug: string;
  label: string;
  description: string;
  icon: string;
  lucideIcon: string;
  authType: string;
  authPath: string | null;
  scopes: string[];
  useUserScope: boolean;
  systemPrompt: string | null;
};

/** The subset of a Prisma client this seed needs, so it binds to any app's. */
type CatalogueWriter = {
  mcpCatalogEntry: {
    upsert: (args: {
      where: { slug: string };
      create: Record<string, unknown>;
      update: Record<string, unknown>;
    }) => Promise<unknown>;
  };
};

export function readBuiltInCatalogue(): BuiltInCatalogRow[] {
  const here = dirname(fileURLToPath(import.meta.url));
  return JSON.parse(
    readFileSync(resolve(here, 'built-in-connectors.json'), 'utf8'),
  ) as BuiltInCatalogRow[];
}

/**
 * `update` deliberately carries only the fields a manifest owns. `enabled`,
 * `allowsPrivateAddress` and `mcpServerUrl` are the operator's, and a seed run
 * that reset them would undo an administrator's decision on every deploy.
 */
export async function seedBuiltInCatalogue(
  prisma: CatalogueWriter,
): Promise<number> {
  const entries = readBuiltInCatalogue();

  for (const entry of entries) {
    const fromManifest = {
      label: entry.label,
      description: entry.description,
      icon: entry.icon,
      lucideIcon: entry.lucideIcon,
      authType: entry.authType,
      authPath: entry.authPath,
      scopes: entry.scopes,
      useUserScope: entry.useUserScope,
      systemPrompt: entry.systemPrompt,
    };

    await prisma.mcpCatalogEntry.upsert({
      where: { slug: entry.slug },
      create: { slug: entry.slug, isBuiltIn: true, ...fromManifest },
      update: fromManifest,
    });
  }

  return entries.length;
}
