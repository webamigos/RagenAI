import createMiddleware from 'next-intl/middleware';
import {
  clerkMiddleware,
  createRouteMatcher,
  clerkClient,
} from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

const PUBLIC_ROUTES = [
  '/',
  '/pl',
  '/en',
  '/:locale/sign-in',
  '/:locale/sign-up',
  '/:locale/guest-threads/:threadId',
  '/:locale/sso-callback',
];

const PROTECTED_ROUTES = ['/:locale/threads/:threadId', '/admin'];

const isProtectedRoute = createRouteMatcher(PROTECTED_ROUTES);
const LOCALE_PREFIX_REGEX = /^\/(pl|en)/;
const SIGN_IN_PATH = '/sign-in';

// export const config = {
//   matcher: ['/', '/(pl|en)/:path*'],
// };

function isPublicRoute(url: string): boolean {
  return PUBLIC_ROUTES.some((route) =>
    new RegExp(
      route.replace(':locale', '(pl|en)').replace(':threadId', '[^/]+')
    ).test(url)
  );
}

function redirectToSignInIfNeeded(url: string, request: NextRequest) {
  if (
    !isPublicRoute(url) &&
    !url.includes(SIGN_IN_PATH) &&
    !url.includes('/sign-up') &&
    !url.includes('/sso-callback')
  ) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
  }
  return null;
}

export const config = {
  matcher: [
    '/((?!api|trpc|_next|_vercel|monitoring|.*\\..*).*)',
    '/api/threads/(.*)',
    '/api/threads',
    '/api/settings/',
    '/api/settings/api-key',
    '/api/settings/temperature',
    '/api/settings/model',
    '/api/settings/prompt',
    '/api/send',
    '/api/upload/(.*)',
    '/:locale/admin/manage-knowledge',
    '/:locale/sso-callback',
    '/:locale/sign-in',
  ],
};

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    const url = request.nextUrl.pathname;
    const localePrefixRegex = /^\/(pl|en)/;
    const session = auth();

    // Handle root routes specifically to prevent flashing
    if (LOCALE_PREFIX_REGEX) {
      // If not authenticated, redirect to sign-in immediately
      if (!session.userId) {
        // Check if we're not already on the sign-in page to prevent redirect loops
        if (!url.includes(SIGN_IN_PATH)) {
          return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
        }
      }
      // If authenticated, let the request pass through
      return handleI18nRouting(request);
    }

    if (url.startsWith('/api')) {
      return NextResponse.next();
    }

    if (url.includes('/:locale/sso-callback')) {
      return NextResponse.next();
    }

    const isAdminRoute = localePrefixRegex.test(url) && url.includes('/admin');

    if (isAdminRoute) {
      if (!session.userId) {
        // Check if we're not already on the sign-in page
        if (!url.includes(SIGN_IN_PATH)) {
          return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
        }
      }

      const user = await clerkClient().users.getUser(session.userId!);

      const orgMemberships =
        await clerkClient().users.getOrganizationMembershipList({
          userId: user.id,
        });

      const admin = orgMemberships.data.some(
        (membership) => membership.role === 'org:admin'
      );

      // TODO: should it be user metadata or organization metadata?
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
      if (isProtectedRoute(request)) {
        auth().protect();
      } else {
        const redirectResponse = redirectToSignInIfNeeded(url, request);
        if (redirectResponse) return redirectResponse;
      }
    }
    return handleI18nRouting(request);
  },
  { debug: false }
);
