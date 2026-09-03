import { beforeEach, describe, expect, it, vi } from 'vitest';

const requireAdmin = vi.fn();
const eventFindUnique = vi.fn();
const eventUpdateMany = vi.fn();

vi.mock('@/lib/auth-guard', () => ({
  requireAdmin: (...args: unknown[]) => requireAdmin(...args),
}));

// The helper has its own tests in src/lib/__tests__/audit.test.ts; here we only
// care that the action calls it, and with what.
const recordAdminAction = vi.fn();
vi.mock('@/lib/audit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/audit')>()),
  recordAdminAction: (...args: unknown[]) => recordAdminAction(...args),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@/lib/db', () => ({
  prisma: {
    securityEvent: {
      findUnique: (...a: unknown[]) => eventFindUnique(...a),
      updateMany: (...a: unknown[]) => eventUpdateMany(...a),
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
  eventFindUnique.mockResolvedValue({
    id: 1,
    resolvedAt: null,
    organizationId: null,
  });
  eventUpdateMany.mockResolvedValue({ count: 1 });
});

describe('resolveIncidentAction', () => {
  it('marks the event resolved and records who did it', async () => {
    await resolveIncidentAction(formData(PUBLIC_ID));

    const call = eventUpdateMany.mock.calls[0][0];
    // Conditional on still being unresolved, so two administrators clicking
    // Resolve cannot both claim it.
    expect(call.where).toEqual({ id: 1, resolvedAt: null });
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

    expect(eventUpdateMany).not.toHaveBeenCalled();
  });

  /**
   * The race the conditional update closes: the read says unresolved, another
   * administrator resolves it, and this write then matches nothing rather than
   * overwriting their name and timestamp.
   */
  it('does nothing when another administrator claimed it first', async () => {
    eventUpdateMany.mockResolvedValue({ count: 0 });

    await expect(
      resolveIncidentAction(formData(PUBLIC_ID)),
    ).resolves.toBeUndefined();
    expect(eventUpdateMany).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for an event that does not exist', async () => {
    eventFindUnique.mockResolvedValue(null);

    await expect(
      resolveIncidentAction(formData(PUBLIC_ID)),
    ).resolves.toBeUndefined();
    expect(eventUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    ['a missing field', undefined],
    ['an empty field', ''],
    ['whitespace only', '   '],
  ])('is a no-op for %s', async (_label, value) => {
    await resolveIncidentAction(formData(value));

    expect(eventFindUnique).not.toHaveBeenCalled();
    expect(eventUpdateMany).not.toHaveBeenCalled();
  });

  it('refuses a caller that is not a platform administrator', async () => {
    requireAdmin.mockRejectedValue(new Error('Forbidden'));

    await expect(resolveIncidentAction(formData(PUBLIC_ID))).rejects.toThrow(
      /Forbidden/,
    );
    expect(eventUpdateMany).not.toHaveBeenCalled();
  });
});
