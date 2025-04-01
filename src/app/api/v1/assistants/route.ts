import { NextRequest, NextResponse } from 'next/server';

import { getApiContext } from '../__logic__/context/api.context';
import { ApiDbService } from '../__logic__/services/api-db.service';
import { ApiErrorService } from '../__logic__/services/api-errors.service';
import { StatusCodes } from 'http-status-codes';
import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';
import { createProjectSchema } from '../__logic__/dtos/project.dto';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  try {
    setSentryServiceTag('api.assistants.get');
    const apiContext = await getApiContext(request);
    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    const projects = await apiDbService.getUserProjects();

    return NextResponse.json(projects, { status: StatusCodes.OK });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};

export const POST = async (request: NextRequest) => {
  try {
    const body = await request.json();
    const parsedData = createProjectSchema.parse(body);

    setSentryServiceTag('api.assistants.post');
    const apiContext = await getApiContext(request);
    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    const project = await apiDbService.createUserProject(parsedData);

    return NextResponse.json(project, { status: StatusCodes.CREATED });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
