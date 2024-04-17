import createMiddleware from 'next-intl/middleware';
import { authMiddleware } from '@clerk/nextjs';
import { NextResponse, type NextRequest } from 'next/server';

import { locales, defaultLocale } from './app/config';

const intlMiddleware = createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,
});

const publicRoutes = ['/', '/pl/threads', '/en/threads'];

export const config = {
  // Match only internationalized pathnames
  // matcher: ['/', '/(en|pl)/:path*'],
  // matcher: ['/((?!api|trpc|_next|_vercel|monitoring|.*\\..*).*)'], // TODO: what which endpoints which should be run only by authorized users?

  matcher: ['/((?!.+.[w]+$|_next).*)', '/', '/(api|trpc)(.*)'],
};

export default authMiddleware({
  beforeAuth: (request: NextRequest) => {
    return intlMiddleware(request);
  },
  publicRoutes,
});
