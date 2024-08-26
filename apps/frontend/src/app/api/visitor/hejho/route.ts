import { NextResponse } from 'next/server';
import { clearVisitorMessages } from '../../../lib/services/visitor';
import { StatusCodes } from 'http-status-codes';

export const dynamic = 'force-dynamic';

export const POST = async (_request: Request) => {
  try {
    await clearVisitorMessages();

    return NextResponse.json({});
  } catch (error) {
    return NextResponse.json({
      error: 'Error during clear visitor messages stats',
      status: StatusCodes.BAD_REQUEST,
    });
  }
};
