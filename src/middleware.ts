import createMiddleware from 'next-intl/middleware';
import {
  clerkMiddleware,
  createRouteMatcher,
  clerkClient,
} from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { locales, defaultLocale } from './app/config';

const intlMiddleware = createMiddleware({
  locales,
  defaultLocale,
});

const publicRoutes = [
  '/',
  '/pl',
  '/en',
  '/:locale/sign-in',
  '/:locale/sign-up',
  '/:locale/guest-threads/:threadId',
];

const isProtectedRoute = createRouteMatcher([
  '/:locale/threads/:threadId',
  '/admin',
]);

export const config = {
  matcher: [
    '/((?!api|trpc|_next|_vercel|monitoring|.*\\..*).*)',
    '/api/settings/api-key',
  ],
};

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    const url = request.nextUrl.pathname;

    if (request.nextUrl.pathname.startsWith('/api')) {
      return NextResponse.next();
    }

    if (url.startsWith('/admin')) {
      const session = auth();

      if (!session.userId) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }

      const user = await clerkClient.users.getUser(session.userId);

      const orgMemberships =
        await clerkClient.users.getOrganizationMembershipList({
          userId: user.id,
        });

      const isOwnerOrAdmin = orgMemberships.data.some(
        (membership) => membership.role === 'owner' || 'admin'
      );

      if (!isOwnerOrAdmin) {
        return NextResponse.redirect(new URL('/403', request.url));
      }
    }

    if (isProtectedRoute(request)) {
      auth().protect();
    } else {
      const isPublicRoute = publicRoutes.some((route) =>
        new RegExp(
          route.replace(':locale', '(pl|en)').replace(':threadId', '[^/]+')
        ).test(url)
      );

      if (!isPublicRoute) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }
    }

    return intlMiddleware(request);
  },
  { debug: false }
);
