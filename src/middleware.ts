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
    '/api/threads/(.*)',
    '/api/settings/',
    '/api/settings/api-key',
    '/api/settings/temperature',
    '/api/settings/model',
    '/api/settings/prompt',
    '/api/upload/(.*)',
    '/:locale/admin/manage-knowledge',
  ],
};

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    const url = request.nextUrl.pathname;
    const localePrefixRegex = /^\/(pl|en)/;

    if (url.startsWith('/api')) {
      return NextResponse.next();
    }

    const isAdminRoute = localePrefixRegex.test(url) && url.includes('/admin');

    if (isAdminRoute) {
      const session = auth();

      if (!session.userId) {
        return NextResponse.redirect(new URL('/sign-in', request.url));
      }

      const user = await clerkClient().users.getUser(session.userId);

      const orgMemberships =
        await clerkClient().users.getOrganizationMembershipList({
          userId: user.id,
        });

      const admin = orgMemberships.data.some(
        (membership) => membership.role === 'org:admin'
      );

      const onboardingComplete = user.publicMetadata.onboardingComplete;

      if (!admin && url.includes('manage-knowledge') && !onboardingComplete) {
        return NextResponse.next();
      }

      if (!admin) {
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
