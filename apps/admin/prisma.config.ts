import path from 'node:path';
import { defineConfig } from 'prisma/config';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('Missing DATABASE_URL environment variable');
}

export default defineConfig({
  schema: path.join(import.meta.dirname, '..', '..', 'prisma', 'schema.prisma'),
  datasource: {
    url: databaseUrl,
  },
});
