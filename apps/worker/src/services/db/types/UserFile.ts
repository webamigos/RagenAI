/**
 * The row shapes and enums for `user_files`, re-exported from the client
 * Prisma generates out of `prisma/schema.prisma`.
 *
 * They used to be written out by hand here — and again, differently, in
 * `src/types/UserFile.ts`, which carried its own copy of the same three
 * enums. Two hand-maintained mirrors of one schema, and nothing to keep either
 * in step with it: a column added to the schema simply would not appear, and a
 * new `FileType` member would be missing from both while the database happily
 * accepted it.
 *
 * That is the second source of truth [ADR-40](../../../../../docs/adrs/40-worker-uses-prisma-not-knex.md)
 * set out to remove, and removing it is the part of that migration that pays.
 *
 * Note the field names are camelCase now, matching the schema's Prisma field
 * names rather than the database's column names.
 */
export {
  EmbeddingStatus,
  FileType,
  ParsingStatus,
} from '../../../../generated/prisma';

export type { UserFile } from '../../../../generated/prisma';
