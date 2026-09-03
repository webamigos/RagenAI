import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import { type OrgId, type ProjectId, type UserId } from '../types/brand.js';
import { type SessionAuthContext } from '../types/session-auth-context.js';

interface SessionAuthPayload {
  userId: string;
  orgId: string;
  projectId?: string;
  exp: number;
}

/**
 * Verifies short-lived, HMAC-signed tokens apps/web issues after it has
 * already resolved a real Better Auth session server-side (see
 * docs/adrs/21-monorepo-and-api-decoupling.md, Phase A). apps/api never
 * validates a Better Auth session/cookie itself — apps/web remains the
 * only place users sign in; this only lets it vouch for a request it has
 * already authenticated.
 */
@Injectable()
export class SessionAuthService {
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.getOrThrow<string>('SESSION_AUTH_SECRET');
  }

  verify(token: string): SessionAuthContext | null {
    const dotIndex = token.lastIndexOf('.');

    if (dotIndex <= 0 || dotIndex === token.length - 1) {
      return null;
    }

    const payloadB64 = token.slice(0, dotIndex);
    const signature = token.slice(dotIndex + 1);
    const expectedSignature = this.sign(payloadB64);

    const signatureBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (signatureBuf.length !== expectedBuf.length) {
      return null;
    }

    if (!timingSafeEqual(signatureBuf, expectedBuf)) {
      return null;
    }

    let payload: SessionAuthPayload;
    try {
      payload = JSON.parse(
        Buffer.from(payloadB64, 'base64url').toString('utf8'),
      ) as SessionAuthPayload;
    } catch {
      return null;
    }

    if (
      typeof payload.exp !== 'number' ||
      typeof payload.userId !== 'string' ||
      typeof payload.orgId !== 'string' ||
      Date.now() >= payload.exp
    ) {
      return null;
    }

    return {
      userId: payload.userId as UserId,
      orgId: payload.orgId as OrgId,
      ...(payload.projectId
        ? { projectId: payload.projectId as ProjectId }
        : {}),
    };
  }

  private sign(payloadB64: string): string {
    return createHmac('sha256', this.secret).update(payloadB64).digest('hex');
  }
}
