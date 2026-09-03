import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const eventFindUnique = vi.fn();
const eventUpdate = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    securityEvent: {
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      update: (...a: unknown[]) => eventUpdate(...a),
    },
  },
}));

const { resolveIncidentAction } = await import('../actions');

const PUBLIC_ID = 'evt-public-1';
const ADMIN = { id: 'u1', email: 'admin@example.com', name: 'Admin' };

function formData(publicId?: string) {
  const fd = new FormData();
  if (publicId !== undefined) {
    fd.set('publicId', publicId);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAdmin.mockResolvedValue(ADMIN);
  eventFindUnique.mockResolvedValue({ id: 1, resolvedAt: null });
});

describe('resolveIncidentAction', () => {
  it('marks the event resolved and records who did it', async () => {
    await resolveIncidentAction(formData(PUBLIC_ID));

    const call = eventUpdate.mock.calls[0][0];
    expect(call.where).toEqual({ id: 1 });
    expect(call.data.resolvedBy).toBe(ADMIN.email);
    expect(call.data.resolvedAt).toBeInstanceOf(Date);
  });

  it('looks the event up by its public ID, not its internal one', async () => {
    await resolveIncidentAction(formData(PUBLIC_ID));

    expect(eventFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: PUBLIC_ID } }),
    );
  });

  it('trims the submitted public ID', async () => {
    await resolveIncidentAction(formData(`  ${PUBLIC_ID}  `));

    expect(eventFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { publicId: PUBLIC_ID } }),
    );
  });

  /**
   * Two administrators clicking Resolve on the same incident must not
   * overwrite the first one's name and timestamp with the second's.
   */
  it('leaves an already-resolved event untouched', async () => {
    eventFindUnique.mockResolvedValue({ id: 1, resolvedAt: new Date() });

    await resolveIncidentAction(formData(PUBLIC_ID));

    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it('is a no-op for an event that does not exist', async () => {
    eventFindUnique.mockResolvedValue(null);

    await expect(
      resolveIncidentAction(formData(PUBLIC_ID)),
    ).resolves.toBeUndefined();
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', undefined],
    ['an empty field', ''],
    ['whitespace only', '   '],
  ])('is a no-op for %s', async (_label, value) => {
    await resolveIncidentAction(formData(value));

    expect(eventFindUnique).not.toHaveBeenCalled();
    expect(eventUpdate).not.toHaveBeenCalled();
  });

  it('refuses a caller that is not a platform administrator', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(resolveIncidentAction(formData(PUBLIC_ID))).rejects.toThrow(
      /Forbidden/,
    );
    expect(eventUpdate).not.toHaveBeenCalled();
  });
});
