import { NextRequest, NextResponse } from 'next/server';

import { StatusCodes } from 'http-status-codes';

export const dynamic = 'force-dynamic';

export const GET = async (request: NextRequest) => {
  return NextResponse.json({ status: 'ok' }, { status: StatusCodes.OK });
};
