import path from 'node:path';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: path.join(import.meta.dirname, 'prisma', 'schema.prisma'),
  datasource: {
    url: process.env.DATABASE_URL ?? '',
    /**
     * A throwaway database Prisma may create, replay the migration folder into
     * and drop again.
     *
     * Optional, and unset in normal work. It is required by
     * `prisma migrate diff --from-migrations`, which is how a migration should
     * be generated here: diffing against the *repository's* history rather
     * than against whatever the local database has drifted into. This one has
     * drifted — it carries migrations that exist nowhere else — so a diff
     * taken from it would carry that drift into the repository.
     *
     *   docker exec ragen-app-postgres-1 psql -U postgres -c 'CREATE DATABASE shadow;'
     *   SHADOW_DATABASE_URL=postgresql://postgres:pass123@localhost:55432/shadow \
     *     npx prisma migrate diff --from-migrations prisma/migrations \
     *       --to-schema prisma/schema.prisma --script
     */
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
  migrations: {
    path: './prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
});
