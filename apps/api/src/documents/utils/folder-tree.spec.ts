import { buildFolderTree } from './folder-tree.js';
import type { DocumentFolderItem } from '../types.js';

function folder(overrides: Partial<DocumentFolderItem>): DocumentFolderItem {
  return {
    id: 'id',
    name: 'name',
    teamId: null,
    teamName: null,
    parentId: null,
    path: '/',
    ownerId: null,
    ownerName: null,
    fileCount: 0,
    ...overrides,
  };
}

describe('buildFolderTree', () => {
  it('returns an empty array for an empty list', () => {
    expect(buildFolderTree([])).toEqual([]);
  });

  it('treats folders with no parentId as roots', () => {
    const folders = [folder({ id: 'a' }), folder({ id: 'b' })];
    const result = buildFolderTree(folders);
    expect(result.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('nests children under their parent', () => {
    const folders = [
      folder({ id: 'root' }),
      folder({ id: 'child', parentId: 'root' }),
    ];
    const result = buildFolderTree(folders);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('root');
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children?.[0].id).toBe('child');
  });

  it('treats a folder whose parent is missing from the list as a root', () => {
    const folders = [folder({ id: 'orphan', parentId: 'missing-parent' })];
    const result = buildFolderTree(folders);
    expect(result.map((f) => f.id)).toEqual(['orphan']);
  });

  it('builds multi-level trees', () => {
    const folders = [
      folder({ id: 'root' }),
      folder({ id: 'child', parentId: 'root' }),
      folder({ id: 'grandchild', parentId: 'child' }),
    ];
    const result = buildFolderTree(folders);

    expect(result[0].children?.[0].children?.[0].id).toBe('grandchild');
  });
});
