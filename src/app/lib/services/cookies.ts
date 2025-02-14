import { cookies } from 'next/headers';

import { visitorCookieName } from '@/app/config';
import { logger } from '../utils/logger';

export const setVisitorCookie = async () => {
  const cookieStore = await cookies();

  let visitorCookie = cookieStore.get(visitorCookieName);

  if (!visitorCookie) {
    const visitorCookieValue = `visitor_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    cookieStore.set(visitorCookieName, visitorCookieValue);
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
