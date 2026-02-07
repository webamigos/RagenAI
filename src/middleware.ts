import createMiddleware from 'next-intl/middleware';
import {
  clerkMiddleware,
  createRouteMatcher,
  clerkClient,
} from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';

const IS_API_MODE = process.env.IS_API_MODE === '1';

const handleI18nRouting = createMiddleware(routing);

const PUBLIC_ROUTES = [
  '/',
  '/pl',
  '/en',
  '/:locale/sign-in',
  '/:locale/sign-up',
  '/:locale/guest-threads/:threadId',
  '/:locale/sso-callback',
  '/:locale/enter-code',
  '/:locale/forgot-password',
  '/:locale/reset-password',
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
    !url.includes('/sso-callback') &&
    !url.includes('/enter-code') &&
    !url.includes('/forgot-password') &&
    !url.includes('/reset-password')
  ) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, request.url));
  }
  return null;
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};

export default clerkMiddleware(
  async (auth, request: NextRequest) => {
    // ignore all below setup for API instance
    if (IS_API_MODE) {
      return NextResponse.next();
    }

    const url = request.nextUrl.pathname;
    const localePrefixRegex = /^\/(pl|en)/;
    const session = await auth();

    // Handle root routes specifically to prevent flashing
    if (LOCALE_PREFIX_REGEX.test(url)) {
      if (!session.userId) {
        if (
          url.includes('/public') ||
          url.includes('/sign-up') ||
          url.includes('/sso-callback') ||
          url.includes('/enter-code') ||
          url.includes('/forgot-password') ||
          url.includes('/reset-password')
        ) {
          return NextResponse.next();
        }
        // If not authenticated, redirect to sign-in immediately
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
      (await auth()).protect();
    } else {
      if (isProtectedRoute(request)) {
        (await auth()).protect();
      } else {
        const redirectResponse = redirectToSignInIfNeeded(url, request);
        if (redirectResponse) return redirectResponse;
      }
    }
    return handleI18nRouting(request);
  },
  { debug: false }
);
