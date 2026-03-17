import { cookies } from 'next/headers';
import crypto from 'node:crypto';

import { visitorCookieName } from '@/app/config';
import { logger } from '../utils/logger';

export const setVisitorCookie = async () => {
  const cookieStore = await cookies();

  let visitorCookie = cookieStore.get(visitorCookieName);

  if (!visitorCookie) {
    const visitorCookieValue = `visitor_${crypto.randomBytes(12).toString('hex')}`;
    cookieStore.set(visitorCookieName, visitorCookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
    visitorCookie = cookieStore.get(visitorCookieName);
  }
};

export const getVisitorIdFromCookie = async () => {
  const cookieStore = await cookies();
  const visitorCookie = cookieStore.get(visitorCookieName);

  if (!visitorCookie) {
    logger.error('Invalid visitor id');
    return null;
  }
  return visitorCookie.value;
};
