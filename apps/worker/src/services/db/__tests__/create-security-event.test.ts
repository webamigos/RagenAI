// The last function to leave knex (ADR-40 step 4). It had no test of its query:
// `sanitize-documents.test.ts` mocks `db.createSecurityEvent` wholesale, so it
// passed whatever the insert did.
//
// The behaviour worth pinning is that it never throws. It writes an audit row
// on a path that is already handling a suspicious upload; an audit failure
// there must not also fail the ingest.

/* eslint-disable no-var */
var mockCreate: jest.Mock;
var mockWarn: jest.Mock;
/* eslint-enable no-var */

jest.mock('../prisma', () => {
  mockCreate = jest.fn();
  return { getPrisma: () => ({ securityEvent: { create: mockCreate } }) };
});

jest.mock('../../logger', () => {
  mockWarn = jest.fn();
  return { logger: { warn: mockWarn, info: jest.fn(), error: jest.fn() } };
});

import { db } from '../db';

const EVENT = {
  eventType: 'UPLOAD_SUSPICIOUS_CONTENT',
  severity: 'info',
  source: 'upload',
  organizationId: 'org-1',
} as const;

beforeEach(() => {
  mockCreate.mockReset().mockResolvedValue({ publicId: 'sec-1' });
  mockWarn.mockReset();
});

describe('createSecurityEvent', () => {
  it('returns the public id of the row it wrote', async () => {
    await expect(db.createSecurityEvent({ ...EVENT })).resolves.toEqual({
      publicId: 'sec-1',
    });
  });

  it('writes the event with the schema field names', async () => {
    await db.createSecurityEvent({ ...EVENT, userId: 'user-1' });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        eventType: 'UPLOAD_SUSPICIOUS_CONTENT',
        severity: 'info',
        source: 'upload',
        organizationId: 'org-1',
        userId: 'user-1',
        ipAddress: null,
        userAgent: null,
        requestId: null,
        metadata: {},
      },
      select: { publicId: true },
    });
  });

  // `public_id` has `@default(uuid())`, so Prisma supplies it — the knex
  // version generated one by hand.
  it('lets Prisma supply the public id', async () => {
    await db.createSecurityEvent({ ...EVENT });

    expect(mockCreate.mock.calls[0][0].data).not.toHaveProperty('publicId');
  });

  // The column is non-nullable with a `{}` default, so absence is an empty
  // object — not `Prisma.DbNull`, which is what the nullable Json columns get.
  it('writes an empty object when there is no metadata', async () => {
    await db.createSecurityEvent({ ...EVENT });

    expect(mockCreate.mock.calls[0][0].data.metadata).toEqual({});
  });

  it('passes metadata through as an object', async () => {
    await db.createSecurityEvent({
      ...EVENT,
      metadata: { fileId: 'file-1', patterns: ['script'] },
    });

    expect(mockCreate.mock.calls[0][0].data.metadata).toEqual({
      fileId: 'file-1',
      patterns: ['script'],
    });
  });

  // An audit failure must not fail the ingest it is auditing.
  it('returns null instead of throwing when the insert fails', async () => {
    mockCreate.mockRejectedValue(new Error('connection lost'));

    await expect(db.createSecurityEvent({ ...EVENT })).resolves.toBeNull();
    expect(mockWarn).toHaveBeenCalled();
  });
});
