import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

import { getLast24hVisitorMessages } from '../../../lib/services/visitor';

type Params = {
  params: { publicId: string };
};

export const dynamic = 'force-dynamic';

export const GET = async (_request: Request, { params }: Params) => {
  const publicId = params.publicId;

  try {
    const visitorMessages = await getLast24hVisitorMessages(publicId);
    return NextResponse.json({ messages: visitorMessages });
  } catch (error) {
    console.error('Error during fetch visitor messages stats');
    return NextResponse.json({
      error: 'Error during fetch visitor messages stats',
      status: StatusCodes.BAD_REQUEST,
    });
  }
};
