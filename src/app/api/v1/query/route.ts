import { StatusCodes } from 'http-status-codes';
import { NextRequest, NextResponse } from 'next/server';

import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

import { getApiContext } from '../__logic__/context/api.context';
import { ApiDbService } from '../__logic__/services/api-db.service';
import { ApiErrorService } from '../__logic__/services/api-errors.service';
import { querySchema } from '../__logic__/dtos/query.dto';

export const dynamic = 'force-dynamic';

export const POST = async (request: NextRequest) => {
  try {
    setSentryServiceTag('api.query.post');
    const body = await request.json();
    const parsedData = querySchema.parse(body);

    const apiContext = await getApiContext(request);
    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    const result = await apiDbService.query(parsedData);

    return NextResponse.json({ response: result }, { status: StatusCodes.OK });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
