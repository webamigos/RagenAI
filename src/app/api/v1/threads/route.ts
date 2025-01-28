import { NextRequest, NextResponse } from 'next/server';
import { UnauthorizedException } from '../__logic__/guards/api-key.guard';
import { LimitExceededException } from '../__logic__/guards/rate-limit.guard';
import { getApiContext } from '../__logic__/context/api.context';
import { ApiDbService } from '../__logic__/services/api-db.service';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    const threads = await apiDbService.getUserThreads();

    return NextResponse.json(threads, { status: 200 });
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
