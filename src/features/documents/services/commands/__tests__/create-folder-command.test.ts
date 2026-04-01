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
      id: 1,
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
      id: 5,
      path: '/',
      organizationId: ORG_ID,
    });
    mockCreate.mockResolvedValue({
      id: 10,
      name: 'Subfolder',
      path: '/5/',
    });

    await createFolderCommand({
      name: 'Subfolder',
      organizationId: ORG_ID,
      parentId: 5,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Subfolder',
        path: '/5/',
        parentId: 5,
      }),
    });
  });

  it('creates a deeply nested folder with correct path', async () => {
    // Parent is at path /1/5/
    mockFindFirst.mockResolvedValue({
      id: 12,
      path: '/1/5/',
      organizationId: ORG_ID,
    });
    mockCreate.mockResolvedValue({
      id: 20,
      name: 'Deep Folder',
      path: '/1/5/12/',
    });

    await createFolderCommand({
      name: 'Deep Folder',
      organizationId: ORG_ID,
      parentId: 12,
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        path: '/1/5/12/',
        parentId: 12,
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
        parentId: 999,
      }),
    ).rejects.toThrow('Parent folder not found');
  });

  it('sets ownerId when provided', async () => {
    mockCreate.mockResolvedValue({ id: 1 });

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
