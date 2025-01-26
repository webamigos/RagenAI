import { NextRequest, NextResponse } from 'next/server';

import { getApiContext } from '../__logic__/context/api.context';
import { ApiDbService } from '../__logic__/services/api-db.service';
import { ApiErrorService } from '../__logic__/services/api-errors.service';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    const documents = await apiDbService.fetchDocuments();

    return NextResponse.json(documents, { status: 200 });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
