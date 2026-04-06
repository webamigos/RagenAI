import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFindFirst = vi.fn();
const mockCreate = vi.fn();

vi.mock('@ragenai/prisma-client', () => ({
  default: {
    team: { findFirst: (...args: unknown[]) => mockFindFirst(...args) },
    documentFolder: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
  },
}));

import { createFolderCommand } from '../create-folder-command';

const ORG_ID = 'org-1';

describe('createFolderCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a root folder with path "/"', async () => {
    mockCreate.mockResolvedValue({
      id: 'folder-1',
      name: 'Test Folder',
      path: '/',
    });

    await createFolderCommand({
      name: 'Test Folder',
      organizationId: ORG_ID,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Test Folder',
        organizationId: ORG_ID,
        path: '/',
        parentId: null,
        teamId: null,
        ownerId: null,
      }),
    });
  });

  it('creates a subfolder with computed path', async () => {
    // Mock parent folder lookup
    mockFindFirst.mockResolvedValue({
      id: 'folder-5',
      path: '/',
      organizationId: ORG_ID,
    });
    mockCreate.mockResolvedValue({
      id: 'folder-10',
      name: 'Subfolder',
      path: '/folder-5/',
    });

    await createFolderCommand({
      name: 'Subfolder',
      organizationId: ORG_ID,
      parentId: 'folder-5',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Subfolder',
        path: '/folder-5/',
        parentId: 'folder-5',
      }),
    });
  });

  it('creates a deeply nested folder with correct path', async () => {
    // Parent is at path /folder-1/folder-5/
    mockFindFirst.mockResolvedValue({
      id: 'folder-12',
      path: '/folder-1/folder-5/',
      organizationId: ORG_ID,
    });
    mockCreate.mockResolvedValue({
      id: 'folder-20',
      name: 'Deep Folder',
      path: '/folder-1/folder-5/folder-12/',
    });

    await createFolderCommand({
      name: 'Deep Folder',
      organizationId: ORG_ID,
      parentId: 'folder-12',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        path: '/folder-1/folder-5/folder-12/',
        parentId: 'folder-12',
      }),
    });
  });

  it('throws for invalid folder name', async () => {
    await expect(
      createFolderCommand({ name: '', organizationId: ORG_ID }),
    ).rejects.toThrow('Invalid folder name');

    await expect(
      createFolderCommand({ name: '   ', organizationId: ORG_ID }),
    ).rejects.toThrow('Invalid folder name');
  });

  it('throws when parent folder not found', async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      createFolderCommand({
        name: 'Test',
        organizationId: ORG_ID,
        parentId: 'folder-999',
      }),
    ).rejects.toThrow('Parent folder not found');
  });

  it('sets ownerId when provided', async () => {
    mockCreate.mockResolvedValue({ id: 'folder-1' });

    await createFolderCommand({
      name: 'My Folder',
      organizationId: ORG_ID,
      ownerId: 'user-123',
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ownerId: 'user-123',
      }),
    });
  });
});
