import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const findMany = vi.fn();
const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const del = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    assistantTemplate: {
      findMany: (...a: unknown[]) => findMany(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
      create: (...a: unknown[]) => create(...a),
      update: (...a: unknown[]) => update(...a),
      delete: (...a: unknown[]) => del(...a),
    },
  },
}));

const {
  getAssistantTemplatesAction,
  getAssistantTemplateAction,
  createAssistantTemplateAction,
  updateAssistantTemplateAction,
  toggleAssistantTemplateAction,
  deleteAssistantTemplateAction,
} = await import('../actions');

const ID = 'tpl-1';

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue({ id: 'u1', email: 'a@b.c', name: 'A' });
  findMany.mockResolvedValue([]);
  findUnique.mockResolvedValue(null);
});

describe('getAssistantTemplatesAction', () => {
  // The list order is the order users see in the assistant gallery.
  it('lists every template by sort order', async () => {
    await getAssistantTemplatesAction();

    expect(findMany).toHaveBeenCalledWith({ orderBy: { sortOrder: 'asc' } });
  });
});

describe('getAssistantTemplateAction', () => {
  it('reads one template by id', async () => {
    await getAssistantTemplateAction(ID);

    expect(findUnique).toHaveBeenCalledWith({ where: { id: ID } });
  });

  it('returns null for a template that does not exist', async () => {
    await expect(getAssistantTemplateAction(ID)).resolves.toBeNull();
  });
});

describe('createAssistantTemplateAction', () => {
  it('stores name and instructions', async () => {
    await createAssistantTemplateAction({
      name: 'Sales',
      instructions: 'Be helpful.',
    });

    expect(create.mock.calls[0][0].data).toMatchObject({
      name: 'Sales',
      instructions: 'Be helpful.',
    });
  });

  // The columns are nullable; `undefined` would leave Prisma to its own
  // defaults rather than clearing the field.
  it('normalises omitted optional fields to null', async () => {
    await createAssistantTemplateAction({
      name: 'Sales',
      instructions: 'Be helpful.',
    });

    const { data } = create.mock.calls[0][0];
    expect(data.description).toBeNull();
    expect(data.iconUrl).toBeNull();
  });

  it('defaults sortOrder to 0 so a new template lands first', async () => {
    await createAssistantTemplateAction({
      name: 'Sales',
      instructions: 'Be helpful.',
    });

    expect(create.mock.calls[0][0].data.sortOrder).toBe(0);
  });

  it('keeps an explicit sortOrder', async () => {
    await createAssistantTemplateAction({
      name: 'Sales',
      instructions: 'Be helpful.',
      sortOrder: 5,
    });

    expect(create.mock.calls[0][0].data.sortOrder).toBe(5);
  });
});

describe('updateAssistantTemplateAction', () => {
  it('passes a partial update through untouched', async () => {
    await updateAssistantTemplateAction(ID, { isActive: false });

    expect(update).toHaveBeenCalledWith({
      where: { id: ID },
      data: { isActive: false },
    });
  });

  it('can clear a nullable field', async () => {
    await updateAssistantTemplateAction(ID, { iconUrl: null });

    expect(update.mock.calls[0][0].data.iconUrl).toBeNull();
  });
});

describe('toggleAssistantTemplateAction', () => {
  // Retiring a global assistant is a deactivation, never a delete: organizations
  // may already have `allowedTemplates` entries pointing at this id.
  it.each([[true], [false]])(
    'sets isActive to %s and nothing else',
    async (isActive) => {
      await toggleAssistantTemplateAction(ID, isActive);

      expect(update).toHaveBeenCalledWith({
        where: { id: ID },
        data: { isActive },
      });
    },
  );
});

describe('deleteAssistantTemplateAction', () => {
  it('deletes by id', async () => {
    await deleteAssistantTemplateAction(ID);

    expect(del).toHaveBeenCalledWith({ where: { id: ID } });
  });
});

describe('the platform-admin guard', () => {
  it.each([
    ['getAssistantTemplatesAction', () => getAssistantTemplatesAction()],
    ['getAssistantTemplateAction', () => getAssistantTemplateAction(ID)],
    [
      'createAssistantTemplateAction',
      () => createAssistantTemplateAction({ name: 'X', instructions: 'Y' }),
    ],
    [
      'updateAssistantTemplateAction',
      () => updateAssistantTemplateAction(ID, { name: 'X' }),
    ],
    [
      'toggleAssistantTemplateAction',
      () => toggleAssistantTemplateAction(ID, false),
    ],
    ['deleteAssistantTemplateAction', () => deleteAssistantTemplateAction(ID)],
  ])(
    '%s refuses a caller that is not a platform administrator',
    async (_name, call) => {
      requireAdmin.mockRejectedValue(new Error('Forbidden'));

      await expect(call()).rejects.toThrow(/Forbidden/);
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(del).not.toHaveBeenCalled();
      expect(findMany).not.toHaveBeenCalled();
      expect(findUnique).not.toHaveBeenCalled();
    },
  );
});
