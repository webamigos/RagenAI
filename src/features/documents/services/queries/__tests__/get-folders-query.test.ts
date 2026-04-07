import { describe, it, expect } from 'vitest';
import { buildFolderTree } from '../../../utils/folder-tree';
import type { DocumentFolderItem } from '../../../contracts/document.types';

const makeFolder = (
  overrides: Partial<DocumentFolderItem> & { id: string },
): DocumentFolderItem => ({
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
    const folders = [makeFolder({ id: 'f-1' }), makeFolder({ id: 'f-2' })];
    const tree = buildFolderTree(folders);

    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe('f-1');
    expect(tree[1].id).toBe('f-2');
  });

  it('nests children under parents', () => {
    const folders = [
      makeFolder({ id: 'f-1' }),
      makeFolder({ id: 'f-2', parentId: 'f-1' }),
      makeFolder({ id: 'f-3', parentId: 'f-1' }),
    ];
    const tree = buildFolderTree(folders);

    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('f-1');
    expect(tree[0].children).toHaveLength(2);
    expect(tree[0].children![0].id).toBe('f-2');
    expect(tree[0].children![1].id).toBe('f-3');
  });

  it('handles deep nesting', () => {
    const folders = [
      makeFolder({ id: 'f-1' }),
      makeFolder({ id: 'f-2', parentId: 'f-1' }),
      makeFolder({ id: 'f-3', parentId: 'f-2' }),
    ];
    const tree = buildFolderTree(folders);

    expect(tree).toHaveLength(1);
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].children).toHaveLength(1);
    expect(tree[0].children![0].children![0].id).toBe('f-3');
  });

  it('treats folders with missing parents as roots', () => {
    const folders = [
      makeFolder({ id: 'f-2', parentId: 'f-999' }), // parent not in list
      makeFolder({ id: 'f-3', parentId: 'f-1' }),
      makeFolder({ id: 'f-1' }),
    ];
    const tree = buildFolderTree(folders);

    // Folder 2 becomes root (parent 999 missing), folder 1 is root, folder 3 nests under 1
    expect(tree).toHaveLength(2);
    const rootIds = tree.map((f) => f.id);
    expect(rootIds).toContain('f-1');
    expect(rootIds).toContain('f-2');

    const folder1 = tree.find((f) => f.id === 'f-1')!;
    expect(folder1.children).toHaveLength(1);
    expect(folder1.children![0].id).toBe('f-3');
  });
});
