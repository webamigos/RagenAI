import createMiddleware from 'next-intl/middleware';
import {
  clerkMiddleware,
  createRouteMatcher,
  clerkClient,
} from '@clerk/nextjs/server';
import { type NextRequest } from 'next/server';

import { locales, defaultLocale } from './app/config';

const intlMiddleware = createMiddleware({
  // A list of all locales that are supported
  locales,

  // Used when no locale matches
  defaultLocale,
});

const publicRoutes = [
  '/',
  '/pl',
  '/en',
  '/:locale/sign-in',
  '/:locale/sign-up',
  '/:locale/threads', // FIXME: temporary
  '/:locale/threads/:publicId', // FIXME: temporary
];
const isProtectedRoute = createRouteMatcher([
  '/:locale/threads/:publicId/user',
]);
const ignoreRoutes = ['assets'];

export const config = {
  // Match only internationalized pathnames
  // matcher: ['/', '/(en|pl)/:path*'],
  matcher: ['/((?!api|trpc|_next|_vercel|monitoring|.*\\..*).*)'], // TODO: what which endpoints which should be run only by authorized users?
  // matcher: ['/((?!api|trpc|_next|_vercel|monitoring|.*\\..*).*)'], // TODO: what which endpoints which should be run only by authorized users?

  // matcher: [
  //   '/((?!.+.[w]+$|_next|assets|monitoring).*)',
  //   '/',
  //   '/(api|trpc)(.*)',
  // ],
};

// export default authMiddleware({
//   beforeAuth: (request: NextRequest) => {
//     return intlMiddleware(request);
//   },
//   publicRoutes,
// });

export default clerkMiddleware(
  (auth, request) => {
    if (isProtectedRoute(request)) {
      auth().protect();
    }

    // return NextResponse.next({ request: { headers } });
    return intlMiddleware(request);
  },
  { debug: false }
);
