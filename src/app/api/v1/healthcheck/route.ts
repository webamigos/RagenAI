import { NextResponse } from 'next/server';

import { StatusCodes } from 'http-status-codes';

export const dynamic = 'force-dynamic';

export const GET = async () => {
  return NextResponse.json({ status: 'ok' }, { status: StatusCodes.OK });
};
