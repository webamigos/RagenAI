import type { DocumentFolderItem } from '../types.js';

/**
 * Ported from ragen-app's src/features/documents/utils/folder-tree.ts. See
 * docs/adrs/21-monorepo-and-api-decoupling.md.
 *
 * Build a nested tree from a flat folder list. Folders without a matching
 * parent in the list become root-level items.
 */
export function buildFolderTree(
  folders: DocumentFolderItem[],
): DocumentFolderItem[] {
  const map = new Map<string, DocumentFolderItem>();
  const roots: DocumentFolderItem[] = [];

  for (const folder of folders) {
    map.set(folder.id, { ...folder, children: [] });
  }

  for (const folder of map.values()) {
    if (folder.parentId !== null && map.has(folder.parentId)) {
      const parent = map.get(folder.parentId)!;
      parent.children = parent.children ?? [];
      parent.children.push(folder);
    } else {
      roots.push(folder);
    }
  }

  return roots;
}
