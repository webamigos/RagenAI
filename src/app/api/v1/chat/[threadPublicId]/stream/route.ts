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
  params: { threadPublicId: string };
};

export const GET = async (request: NextRequest, { params }: Params) => {
  const threadPublicId = params.threadPublicId;
  try {
    setSentryServiceTag('api.chat.threadId.stream.get');
    const apiContext = await getApiContext(request);

    setSentryClerkOrganizationTag(apiContext.orgId);

    const apiDbService = new ApiDbService(apiContext);
    // const result = await apiDbService.createChatMessages(
    //   threadPublicId,
    //   parsedData
    // );

    return NextResponse.json(
      { response: threadPublicId },
      { status: StatusCodes.OK }
    );
  } catch (err) {
    return ApiErrorService.handleErrors(err);
  }
};
