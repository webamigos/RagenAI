import { NextResponse } from 'next/server';
import { StatusCodes } from 'http-status-codes';

export const dynamic = 'force-dynamic';

export const POST = async (_request: Request) => {
  try {
    // create user message and return it to display in frontend
    return NextResponse.json({});
  } catch (e) {
    return NextResponse.json(
      { error: 'Problem during processing' },
      { status: StatusCodes.BAD_REQUEST }
    );
  }
};
