import Cookies from 'js-cookie';

import { visitorCookieName } from '@/app/config';
import { api } from './config';

export const getVisitorIdFromBrowserCookie = () => {
  const visitorCookieValue = Cookies.get(visitorCookieName);

  return visitorCookieValue;
};

export const makeVisitorCookieRequest = async () => {
  await api.post('/visitor');
};
