'use server';

import db from '@ragenai/prisma-client';

export type BreadcrumbItem = {
  id: number;
  publicId: string;
  name: string;
};

/**
 * Returns the ancestor chain for a folder (from root to the given folder).
 * Uses the materialized path to find all ancestor IDs efficiently.
 */
export async function getFolderBreadcrumbsQuery(
  folderId: number,
  organizationId: string,
): Promise<BreadcrumbItem[]> {
  const folder = await db.documentFolder.findFirst({
    where: { id: folderId, organizationId },
    select: { id: true, publicId: true, name: true, path: true },
  });

  if (!folder) {
    return [];
  }

  // Parse ancestor IDs from materialized path (e.g., "/1/5/" → [1, 5])
  const ancestorIds = folder.path
    .split('/')
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n));

  if (ancestorIds.length === 0) {
    return [{ id: folder.id, publicId: folder.publicId, name: folder.name }];
  }

  const ancestors = await db.documentFolder.findMany({
    where: { id: { in: ancestorIds }, organizationId },
    select: { id: true, publicId: true, name: true },
  });

  // Sort ancestors in path order
  const ancestorMap = new Map(ancestors.map((a) => [a.id, a]));
  const sortedAncestors = ancestorIds
    .map((id) => ancestorMap.get(id))
    .filter(Boolean) as BreadcrumbItem[];

  // Add the current folder at the end
  sortedAncestors.push({
    id: folder.id,
    publicId: folder.publicId,
    name: folder.name,
  });

  return sortedAncestors;
}
