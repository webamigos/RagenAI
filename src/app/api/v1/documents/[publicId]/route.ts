import { NextRequest, NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getApiContext } from '../../__logic__/context/api.context';
import { ApiDbService } from '../../__logic__/services/api-db.service';
import { ApiErrorService } from '../../__logic__/services/api-errors.service';

export const dynamic = 'force-dynamic';

type Params = {
  params: Promise<{ publicId: string }>;
};

export const GET = async (request: NextRequest, { params }: Params) => {
  const { publicId } = await params;
  try {
    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    const record = await apiDbService.getDocument(publicId);

    if (!record) {
      return ApiErrorService.notFound();
    }

    return NextResponse.json(record, { status: StatusCodes.OK });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
