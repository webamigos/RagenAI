import { type NextRequest, NextResponse } from 'next/server';

import { getApiContext } from '../__logic__/context/api.context';
import { ApiDbService } from '../__logic__/services/api-db.service';
import { ApiErrorService } from '../__logic__/services/api-errors.service';
import { StatusCodes } from 'http-status-codes';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const apiContext = await getApiContext(request);

    const apiDbService = new ApiDbService(apiContext);
    const threads = await apiDbService.getUserThreads();

    return NextResponse.json(threads, { status: StatusCodes.OK });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};

// TODO: is using same logic here as from UI makes sense?
export const POST = async (request: NextRequest) => {
  try {
    const apiContext = await getApiContext(request);

    const apiDbService = new ApiDbService(apiContext);
    const thread = await apiDbService.createUserThread();

    return NextResponse.json(thread, { status: StatusCodes.CREATED });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
