import { NextResponse } from 'next/server';
import { HttpStatusCode } from 'axios';

import { setVisitorCookie } from '@/app/lib/services/cookies';

export const dynamic = 'force-dynamic';

/**
 * Sets cookie for visitor - needed on start new thread screen and messages list
 */
export const POST = async () => {
  await setVisitorCookie();

  return NextResponse.json(
    { status: 'ok' },
    {
      status: HttpStatusCode.Ok,
    }
  );
};
