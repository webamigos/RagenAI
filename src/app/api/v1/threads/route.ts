import { NextRequest, NextResponse } from 'next/server';
import { UnauthorizedException } from '../logic/guards/api-key.guard';
import { LimitExceededException } from '../logic/guards/rate-limit.guard';
import { verifyRequest } from '../logic/guards/verify-request';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const { orgId, projectId, keyId } = await verifyRequest(request);

    return NextResponse.json({ orgId, projectId, keyId });
  } catch (err) {
    if (err instanceof LimitExceededException) {
      return NextResponse.json(
        { message: 'Too many requests' },
        { status: 429 }
      );
    }
    if (err instanceof UnauthorizedException) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
  }
};
