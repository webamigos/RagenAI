import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * No app may declare its own copy of an enum the schema already defines.
 *
 * `apps/worker` had two: `FileType`, `EmbeddingStatus` and `ParsingStatus` were
 * written out by hand in `services/db/types/UserFile.ts` *and* again in
 * `src/types/UserFile.ts`, both identical to the schema and neither derived
 * from it. Nothing kept them in step. A value added to the database would have
 * been accepted by Postgres and absent from both copies, and the failure would
 * have surfaced as a value the code could not name rather than as a build
 * error.
 *
 * That is the second source of truth
 * [ADR-40](../../docs/adrs/40-worker-uses-prisma-not-knex.md) set out to
 * remove, and this is what stops it coming back. An app's own enum is fine —
 * `WebsiteLoaderMode` and `NotificationEvent` are not in the schema and never
 * should be. Only names that collide are refused.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..');

const APP_SOURCE_ROOTS = [
  'apps/web/src',
  'apps/api/src',
  'apps/admin/src',
  'apps/worker/src',
].map((p) => join(REPO_ROOT, p));

function schemaEnums(): Set<string> {
  const schema = readFileSync(
    join(REPO_ROOT, 'prisma', 'schema.prisma'),
    'utf8',
  );
  return new Set(
    [...schema.matchAll(/^enum (\w+) \{/gm)].map((match) => match[1]!),
  );
}

function sourceFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      // The generated clients declare these on purpose — they are the source.
      return entry.name === 'generated' ? [] : sourceFiles(full);
    }
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

describe('schema enums are not redeclared', () => {
  const fromSchema = schemaEnums();
  const files = APP_SOURCE_ROOTS.flatMap(sourceFiles);

  it('reads the enum names out of the schema', () => {
    expect(fromSchema.size).toBeGreaterThan(10);
    expect(fromSchema.has('FileType')).toBe(true);
  });

  it('finds app sources, so a moved directory cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('finds no app declaring an enum the schema owns', () => {
    const offenders = files.flatMap((file) => {
      const code = readFileSync(file, 'utf8');
      return [...code.matchAll(/^export enum (\w+) \{/gm)]
        .filter((match) => fromSchema.has(match[1]!))
        .map(
          (match) =>
            `${file.replace(`${REPO_ROOT}/`, '')} declares ${match[1]}, which prisma/schema.prisma owns`,
        );
    });

    expect(offenders).toEqual([]);
  });
});
