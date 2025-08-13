import { NextRequest, NextResponse } from 'next/server';

import { getApiContext } from '../../__logic__/context/api.context';
import { ApiDbService } from '../../__logic__/services/api-db.service';
import { ApiErrorService } from '../../__logic__/services/api-errors.service';
import { updateThreadSchema } from '../../__logic__/dtos/update-thread.dto';
import { StatusCodes } from 'http-status-codes';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { updateProjectSchema } from '../../__logic__/dtos/project.dto';

export const dynamic = 'force-dynamic';

export type Params = {
  params: Promise<{ publicId: string }>;
};

export const GET = async (request: NextRequest, { params }: Params) => {
  const { publicId } = await params;
  try {
    setSentryServiceTag('api.assistants.id.get');
    const apiContext = await getApiContext(request);
    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    const record = await apiDbService.getUserProject(publicId);

    if (!record) {
      return ApiErrorService.notFound();
    }
    return NextResponse.json(record, { status: 200 });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};

export const PATCH = async (request: NextRequest, { params }: Params) => {
  const { publicId } = await params;
  try {
    setSentryServiceTag('api.assistants.id.patch');
    const body = await request.json();
    const parsedData = updateProjectSchema.parse(body);

    const apiContext = await getApiContext(request);
    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    const record = await apiDbService.updateUserProject(publicId, parsedData);

    return NextResponse.json(record, { status: StatusCodes.ACCEPTED });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
