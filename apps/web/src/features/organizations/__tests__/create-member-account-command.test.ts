import { describe, it, expect, vi, beforeEach } from 'vitest';

const canAddMember = vi.hoisted(() => vi.fn());
const signUpEmail = vi.hoisted(() => vi.fn());
const dbMock = vi.hoisted(() => ({
  // `delete` is declared here, not assigned per test: the rollback path uses
  // it, and leaving it off the shape hid that from the type checker.
  user: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  member: { findFirst: vi.fn(), create: vi.fn() },
  invitation: {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  $transaction: vi.fn(),
}));

vi.mock('@ragenai/prisma-client', () => ({ default: dbMock }));
vi.mock('@/lib/auth', () => ({ auth: { api: { signUpEmail } } }));
vi.mock('@/app/lib/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock(
  '@/features/organizations/services/queries/can-add-member-query',
  () => ({ canAddMemberQuery: canAddMember }),
);

import { createMemberAccountCommand } from '../services/commands/create-member-account-command';

const input = {
  email: 'Ada@Example.com ',
  name: 'Ada Lovelace',
  role: 'member' as const,
  organizationId: 'org_1',
};

describe('createMemberAccountCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canAddMember.mockResolvedValue({
      allowed: true,
      inviterId: 'admin_1',
      inviterName: 'Admin',
    });
    dbMock.user.findUnique.mockResolvedValue(null);
    dbMock.invitation.findUnique.mockResolvedValue(null);
    dbMock.invitation.create.mockResolvedValue({});
    dbMock.invitation.delete.mockResolvedValue({});
    dbMock.$transaction.mockResolvedValue([]);
    signUpEmail.mockResolvedValue({ user: { id: 'user_1' } });
  });

  it('creates the account and returns credentials to hand over', async () => {
    const result = await createMemberAccountCommand(input);

    expect(result.success).toBe(true);
    // OperationResult is not a discriminated union — `success` does not narrow
    // `data` — so the test asserts on the payload it actually uses.
    const { data } = result;
    if (!data) {
      throw new Error('expected the command to return the created account');
    }
    expect(data.email).toBe('ada@example.com');
    expect(data.temporaryPassword).toHaveLength(24);

    // The generated password is what the account is actually created with —
    // otherwise the credentials shown to the admin would not work.
    expect(signUpEmail).toHaveBeenCalledWith({
      body: {
        email: 'ada@example.com',
        password: data.temporaryPassword,
        name: 'Ada Lovelace',
      },
    });
  });

  it('never passes request headers to sign-up', async () => {
    await createMemberAccountCommand(input);

    // Passing them would swap the administrator's own session for the new
    // account's, signing them out of their own browser.
    expect(signUpEmail.mock.calls[0][0]).not.toHaveProperty('headers');
  });

  it('generates a different password each time', async () => {
    const first = await createMemberAccountCommand(input);
    const second = await createMemberAccountCommand(input);

    expect(first.success && second.success).toBe(true);
    if (!first.data || !second.data) {
      throw new Error('expected both commands to return an account');
    }
    expect(first.data.temporaryPassword).not.toBe(
      second.data.temporaryPassword,
    );
  });

  it('creates the pending invitation before the account', async () => {
    await createMemberAccountCommand(input);

    // The user-creation hook reads this row to decide whether to provision a
    // personal organization; created after the fact, it would be too late.
    expect(dbMock.invitation.create.mock.invocationCallOrder[0]).toBeLessThan(
      signUpEmail.mock.invocationCallOrder[0],
    );
  });

  it('refuses when the caller may not add members', async () => {
    canAddMember.mockResolvedValue({ allowed: false, error: 'Brak uprawnień' });

    const result = await createMemberAccountCommand(input);

    expect(result).toEqual({ success: false, error: 'Brak uprawnień' });
    expect(signUpEmail).not.toHaveBeenCalled();
    expect(dbMock.invitation.create).not.toHaveBeenCalled();
  });

  it('distinguishes an existing member from an existing account elsewhere', async () => {
    dbMock.user.findUnique.mockResolvedValue({ id: 'user_9' });
    dbMock.member.findFirst.mockResolvedValue({ id: 'member_9' });
    await expect(createMemberAccountCommand(input)).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('już jest członkiem'),
    });

    dbMock.member.findFirst.mockResolvedValue(null);
    await expect(createMemberAccountCommand(input)).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining('już istnieje'),
    });
  });

  it('refuses rather than colliding with a live invitation', async () => {
    dbMock.invitation.findUnique.mockResolvedValue({
      id: 'inv_1',
      status: 'pending',
    });

    const result = await createMemberAccountCommand(input);

    expect(result.success).toBe(false);
    expect(dbMock.invitation.create).not.toHaveBeenCalled();
    expect(signUpEmail).not.toHaveBeenCalled();
  });

  it('reuses a stale invitation row instead of dead-ending on it', async () => {
    // Accepted and canceled rows keep occupying the unique (org, email) slot.
    // Refusing on those would permanently block an address whose invitation is
    // no longer visible anywhere the admin could cancel it.
    dbMock.invitation.findUnique.mockResolvedValue({
      id: 'inv_old',
      status: 'accepted',
    });
    dbMock.invitation.update.mockResolvedValue({});

    const result = await createMemberAccountCommand(input);

    expect(result.success).toBe(true);
    expect(dbMock.invitation.create).not.toHaveBeenCalled();
    expect(dbMock.invitation.update).toHaveBeenCalledWith({
      where: { id: 'inv_old' },
      data: expect.objectContaining({ status: 'pending', role: 'member' }),
    });
  });

  it('deletes the account it created when the transaction fails', async () => {
    dbMock.$transaction.mockRejectedValue(new Error('constraint'));
    dbMock.user.delete = vi.fn().mockResolvedValue({});

    const result = await createMemberAccountCommand(input);

    expect(result.success).toBe(false);
    // Otherwise: an account with a password nobody saw, no membership, and a
    // retry that fails as "already exists".
    expect(dbMock.user.delete).toHaveBeenCalledWith({
      where: { id: 'user_1' },
    });
    expect(dbMock.invitation.delete).toHaveBeenCalled();
  });

  it('restores a reused invitation to its previous status on failure', async () => {
    dbMock.invitation.findUnique.mockResolvedValue({
      id: 'inv_old',
      status: 'canceled',
    });
    dbMock.invitation.update.mockResolvedValue({});
    dbMock.$transaction.mockRejectedValue(new Error('constraint'));
    dbMock.user.delete = vi.fn().mockResolvedValue({});

    await createMemberAccountCommand(input);

    // Deleting it would destroy a row this command did not create.
    expect(dbMock.invitation.delete).not.toHaveBeenCalled();
    expect(dbMock.invitation.update).toHaveBeenLastCalledWith({
      where: { id: 'inv_old' },
      data: { status: 'canceled' },
    });
  });

  it('reports an error instead of rejecting when a pre-check throws', async () => {
    // These run before the account exists and outside the old try block, so a
    // rejection here reached the dialog as an unhandled promise with no
    // message shown at all.
    dbMock.user.findUnique.mockRejectedValue(new Error('connection lost'));

    await expect(createMemberAccountCommand(input)).resolves.toMatchObject({
      success: false,
    });
  });

  it('removes the invitation it created when sign-up fails', async () => {
    signUpEmail.mockRejectedValue(new Error('boom'));

    const result = await createMemberAccountCommand(input);

    expect(result.success).toBe(false);
    // Left behind, it would block the admin from retrying the same address.
    expect(dbMock.invitation.delete).toHaveBeenCalledWith({
      where: { id: dbMock.invitation.create.mock.calls[0][0].data.id },
    });
  });

  it('cleans up when sign-up succeeds but returns no user', async () => {
    signUpEmail.mockResolvedValue({});

    const result = await createMemberAccountCommand(input);

    expect(result.success).toBe(false);
    expect(dbMock.invitation.delete).toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });
});
