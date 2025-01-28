import { NextRequest, NextResponse } from 'next/server';

import { getApiContext } from '../../__logic__/context/api.context';
import { ApiDbService } from '../../__logic__/services/api-db.service';
import { ApiErrorService } from '../../__logic__/services/api-errors.service';
import { updateThreadSchema } from '../../__logic__/dtos/update-thread.dto';
import { StatusCodes } from 'http-status-codes';

export const dynamic = 'force-dynamic';

type Params = {
  params: { publicId: string };
};

export const GET = async (request: NextRequest, { params }: Params) => {
  const publicId = params.publicId;
  try {
    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    const record = await apiDbService.getUserThread(publicId);

    if (!record) {
      return ApiErrorService.notFound();
    }
    return NextResponse.json(record, { status: 200 });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};

export const PATCH = async (request: NextRequest, { params }: Params) => {
  const publicId = params.publicId;
  try {
    const body = await request.json();
    const parsedData = updateThreadSchema.parse(body);

    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    const record = await apiDbService.updateUserThread(publicId, parsedData);

    return NextResponse.json(record, { status: StatusCodes.ACCEPTED });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};

export const DELETE = async (request: NextRequest, { params }: Params) => {
  const publicId = params.publicId;
  try {
    const apiContext = await getApiContext(request);
    const apiDbService = new ApiDbService(apiContext);
    await apiDbService.deleteUserThread(publicId);

    return new Response(null, { status: StatusCodes.NO_CONTENT });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
