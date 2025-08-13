import { StatusCodes } from 'http-status-codes';
import { NextRequest, NextResponse } from 'next/server';

import {
  setSentryClerkOrganizationTag,
  setSentryServiceTag,
} from '@/app/lib/services/sentry';

import { getApiContext } from '../../../__logic__/context/api.context';
import { ApiDbService } from '../../../__logic__/services/api-db.service';
import { ApiErrorService } from '../../../__logic__/services/api-errors.service';
import { chatMessagesSchema } from '../../../__logic__/dtos/chat.dto';

export const dynamic = 'force-dynamic';

export type Params = {
  params: Promise<{ publicId: string }>;
};

export const GET = async (request: NextRequest, { params }: Params) => {
  const { publicId } = await params;
  try {
    setSentryServiceTag('api.threads.threadId.messages.get');
    const apiContext = await getApiContext(request);

    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    const messages = await apiDbService.getChatMessages(publicId);

    return NextResponse.json(messages, {
      status: StatusCodes.OK,
    });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};

export const POST = async (request: NextRequest, { params }: Params) => {
  const { publicId } = await params;
  try {
    setSentryServiceTag('api.threads.threadId.messages.post');
    const body = await request.json();
    const parsedData = chatMessagesSchema.parse(body);

    const apiContext = await getApiContext(request);
    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);

    const message = await apiDbService.createChatMessages(publicId, parsedData);

    return NextResponse.json(message, { status: StatusCodes.OK });
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
