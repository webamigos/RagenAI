import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { HttpStatusCode } from 'axios';

import { visitorCookieName } from '@/app/config';

export const dynamic = 'force-dynamic';

/**
 * Sets cookie for visitor - needed on start new thread screen and messages list
 */
export const POST = async () => {
  const cookieStore = await cookies();
  let visitorCookie = cookieStore.get(visitorCookieName);
  if (!visitorCookie) {
    const visitorCookieValue = `visitor_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    cookieStore.set(visitorCookieName, visitorCookieValue);
    visitorCookie = cookieStore.get(visitorCookieName);
  }

  return NextResponse.json(
    { status: 'ok' },
    {
      status: HttpStatusCode.Ok,
    }
  );
};
