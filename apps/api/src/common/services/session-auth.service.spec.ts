import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { SessionAuthService } from './session-auth.service.js';

const SECRET = 'test-session-auth-secret';

function buildToken(
  payload: Record<string, unknown>,
  secret: string = SECRET,
): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(payloadB64)
    .digest('hex');
  return `${payloadB64}.${signature}`;
}

describe('SessionAuthService', () => {
  let service: SessionAuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionAuthService,
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue(SECRET),
          },
        },
      ],
    }).compile();

    service = module.get(SessionAuthService);
  });

  it('should verify a well-formed, correctly signed token', () => {
    const token = buildToken({
      userId: 'user_1',
      orgId: 'org_1',
      projectId: 'proj_1',
      exp: Date.now() + 30_000,
    });

    const context = service.verify(token);

    expect(context).toEqual({
      userId: 'user_1',
      orgId: 'org_1',
      projectId: 'proj_1',
    });
  });

  it('should omit projectId when absent from the payload', () => {
    const token = buildToken({
      userId: 'user_1',
      orgId: 'org_1',
      exp: Date.now() + 30_000,
    });

    const context = service.verify(token);

    expect(context).toEqual({ userId: 'user_1', orgId: 'org_1' });
  });

  it('should reject an expired token', () => {
    const token = buildToken({
      userId: 'user_1',
      orgId: 'org_1',
      exp: Date.now() - 1_000,
    });

    expect(service.verify(token)).toBeNull();
  });

  it('should reject a token signed with the wrong secret', () => {
    const token = buildToken(
      { userId: 'user_1', orgId: 'org_1', exp: Date.now() + 30_000 },
      'wrong-secret',
    );

    expect(service.verify(token)).toBeNull();
  });

  it('should reject a tampered payload', () => {
    const token = buildToken({
      userId: 'user_1',
      orgId: 'org_1',
      exp: Date.now() + 30_000,
    });
    const [, signature] = token.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({
        userId: 'attacker',
        orgId: 'org_1',
        exp: Date.now() + 30_000,
      }),
    ).toString('base64url');

    expect(service.verify(`${tamperedPayload}.${signature}`)).toBeNull();
  });

  it('should reject malformed tokens', () => {
    expect(service.verify('not-a-token')).toBeNull();
    expect(service.verify('')).toBeNull();
    expect(service.verify('.signature')).toBeNull();
    expect(service.verify('payload.')).toBeNull();
  });

  it('should reject a token missing required fields', () => {
    const token = buildToken({ orgId: 'org_1', exp: Date.now() + 30_000 });
    expect(service.verify(token)).toBeNull();
  });
});
