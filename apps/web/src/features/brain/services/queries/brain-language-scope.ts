import db from '@ragenai/prisma-client';

import type { Prisma } from '@/generated/prisma/client';

import {
  BRAIN_LANGUAGE_NONE,
  type BrainLanguage,
} from '../../contracts/brain-language.types';
import { extractableFilesWhere } from './get-extractable-documents-query';

/**
 * Brain filtered to one language of its documents (`?lang=`).
 *
 * The language is the document's: `UserFile.language`, an ISO 639-3 code the
 * worker detects with franc at ingest (docs/specs/2026-09-04-document-language-
 * metadata.md), or null when it could not tell — a file older than detection,
 * a very short text, a failed pass. A page has no language of its own, only
 * sources, so a page is in a language when at least one document it cites is:
 * a page quoting a Polish and an English document is under both.
 */
export type BrainLanguageScope = {
  /** Files in the language, across the organization. */
  fileIds: string[];
  /** Pages citing at least one of them. */
  pageIds: number[];
};

function languageWhere(language: BrainLanguage): Prisma.UserFileWhereInput {
  return {
    language: language === BRAIN_LANGUAGE_NONE ? null : language,
  };
}

/** The documents tab's files, narrowed to a language when one is picked. */
export function extractableFilesInLanguage(
  orgId: string,
  language: BrainLanguage | null,
): Prisma.UserFileWhereInput {
  return language
    ? { AND: [extractableFilesWhere(orgId), languageWhere(language)] }
    : extractableFilesWhere(orgId);
}

/** Null for no filter — every tab then queries exactly as before. */
export async function getBrainLanguageScopeQuery(
  orgId: string,
  language: BrainLanguage | null,
): Promise<BrainLanguageScope | null> {
  if (!language) {
    return null;
  }
  const files = await db.userFile.findMany({
    where: { organizationId: orgId, ...languageWhere(language) },
    select: { id: true },
  });
  const fileIds = files.map((f) => f.id);
  if (fileIds.length === 0) {
    return { fileIds, pageIds: [] };
  }
  const sources = await db.knowledgePageSource.findMany({
    where: { organizationId: orgId, fileId: { in: fileIds } },
    select: { pageId: true },
    distinct: ['pageId'],
  });
  return { fileIds, pageIds: sources.map((s) => s.pageId) };
}

/**
 * The languages Brain's documents are in, most documents first; `null` is
 * the ones with no detected language. Offered by the filter — a language no
 * document is in is not a choice.
 */
export async function getBrainLanguagesQuery(
  orgId: string,
): Promise<{ language: string | null; documents: number }[]> {
  const rows = await db.userFile.groupBy({
    by: ['language'],
    where: extractableFilesWhere(orgId),
    _count: { _all: true },
  });
  return rows
    .map((r) => ({ language: r.language, documents: r._count._all }))
    .sort((a, b) => b.documents - a.documents);
}

/** A finding is in the scope when its document is, or any page it names. */
export function findingsInScope(
  scope: BrainLanguageScope,
): Prisma.KnowledgeFindingWhereInput {
  return {
    OR: [
      { fileId: { in: scope.fileIds } },
      { pageIds: { hasSome: scope.pageIds } },
    ],
  };
}
