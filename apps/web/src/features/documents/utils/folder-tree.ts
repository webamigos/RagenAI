import type { DocumentFolderItem } from '../contracts/document.types';

/**
 * Build a nested tree from flat folder list.
 * Folders without a matching parent in the list become root-level items.
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
      parent.children = parent.children || [];
      parent.children.push(folder);
    } else {
      roots.push(folder);
    }
  }

  return roots;
}
