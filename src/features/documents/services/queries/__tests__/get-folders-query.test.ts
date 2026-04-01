import { describe, it, expect } from 'vitest';
import { buildFolderTree } from '../../../utils/folder-tree';
import type { DocumentFolderItem } from '../../../contracts/document.types';

const makeFolder = (
  overrides: Partial<DocumentFolderItem> & { id: number },
): DocumentFolderItem => ({
  publicId: `pub-${overrides.id}`,
  name: `Folder ${overrides.id}`,
  teamId: null,
  teamName: null,
  parentId: null,
  path: '/',
  ownerId: null,
  ownerName: null,
  fileCount: 0,
  ...overrides,
});

describe('buildFolderTree', () => {
  it('returns empty array for empty input', () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  it('returns flat list as roots when no parents', () => {
    const folders = [makeFolder({ id: 1 }), makeFolder({ id: 2 })];
    const tree = buildFolderTree(folders);

    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe(1);
    expect(tree[1].id).toBe(2);
  });

  it('nests children under parents', () => {
    const folders = [
      makeFolder({ id: 1 }),
      makeFolder({ id: 2, parentId: 1 }),
      makeFolder({ id: 3, parentId: 1 }),
    ];
    const tree = buildFolderTree(folders);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(1);
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children![0].id).toBe(2);
    expect(tree[0].children![1].id).toBe(3);
  });

  it('handles deep nesting', () => {
    const folders = [
      makeFolder({ id: 1 }),
      makeFolder({ id: 2, parentId: 1 }),
      makeFolder({ id: 3, parentId: 2 }),
    ];
    const tree = buildFolderTree(folders);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].children).toHaveLength(1);
    expect(tree[0].children![0].children![0].id).toBe(3);
  });

  it('treats folders with missing parents as roots', () => {
    const folders = [
      makeFolder({ id: 2, parentId: 999 }), // parent not in list
      makeFolder({ id: 3, parentId: 1 }),
      makeFolder({ id: 1 }),
    ];
    const tree = buildFolderTree(folders);

    // Folder 2 becomes root (parent 999 missing), folder 1 is root, folder 3 nests under 1
    expect(tree).toHaveLength(2);
    const rootIds = tree.map((f) => f.id);
    expect(rootIds).toContain(1);
    expect(rootIds).toContain(2);

    const folder1 = tree.find((f) => f.id === 1)!;
    expect(folder1.children).toHaveLength(1);
    expect(folder1.children![0].id).toBe(3);
  });
});
