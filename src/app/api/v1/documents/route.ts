import { NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getApiContext } from '../__logic__/context/api.context';
import { ApiDbService } from '../__logic__/services/api-db.service';
import { ApiErrorService } from '../__logic__/services/api-errors.service';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    const documents = await apiDbService.getDocuments();

    return NextResponse.json(documents, { status: StatusCodes.OK });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
