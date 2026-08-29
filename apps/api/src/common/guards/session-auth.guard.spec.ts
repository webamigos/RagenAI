/* eslint-disable @typescript-eslint/unbound-method */
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard.js';
import { SessionAuthService } from '../services/session-auth.service.js';
import { SESSION_AUTH_CONTEXT_KEY } from '../types/session-auth-context.js';

describe('SessionAuthGuard', () => {
  let guard: SessionAuthGuard;
  let sessionAuthService: jest.Mocked<SessionAuthService>;

  function createMockContext(headers: Record<string, string> = {}): {
    context: ExecutionContext;
    request: Record<string, unknown>;
  } {
    const request: Record<string, unknown> = { headers };
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
    return { context, request };
  }

  beforeEach(() => {
    sessionAuthService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<SessionAuthService>;
    guard = new SessionAuthGuard(sessionAuthService);
  });

  it('should throw when Authorization header is missing', () => {
    const { context } = createMockContext();
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw when Authorization header has no Bearer prefix', () => {
    const { context } = createMockContext({ authorization: 'token123' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw when the token fails verification', () => {
    sessionAuthService.verify.mockReturnValue(null);
    const { context } = createMockContext({
      authorization: 'Bearer invalid-token',
    });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should attach the session auth context and allow the request through', () => {
    const sessionAuthContext = { userId: 'user_1', orgId: 'org_1' };
    sessionAuthService.verify.mockReturnValue(sessionAuthContext as never);
    const { context, request } = createMockContext({
      authorization: 'Bearer valid-token',
    });

    expect(guard.canActivate(context)).toBe(true);
    expect(sessionAuthService.verify).toHaveBeenCalledWith('valid-token');
    expect(request[SESSION_AUTH_CONTEXT_KEY]).toBe(sessionAuthContext);
  });
});
