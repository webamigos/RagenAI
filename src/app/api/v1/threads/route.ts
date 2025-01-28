import { NextRequest, NextResponse } from 'next/server';
import { UnauthorizedException } from '../__logic__/guards/api-key.guard';
import { LimitExceededException } from '../__logic__/guards/rate-limit.guard';
import { getApiContext } from '../__logic__/context/api.context';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const { orgId, userId, projectId, keyId } = await getApiContext(request);

    return NextResponse.json({ orgId, userId, projectId, keyId });
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
    return NextResponse.json({ message: 'Not found' }, { status: 404 });
  }
};
