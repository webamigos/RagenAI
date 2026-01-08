import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from './src/i18n/routing';

const IS_API_MODE = process.env.IS_API_MODE === '1';

// Create i18n middleware handler OUTSIDE the middleware function
const handleI18nRouting = createMiddleware(routing);

const LOCALE_PREFIX_REGEX = /^\/(pl|en)/;
const SIGN_IN_PATH = '/sign-in';

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};

export default async function middleware(request: NextRequest) {
  // Ignore all below setup for API instance
  if (IS_API_MODE) {
    return NextResponse.next();
  }

  const url = request.nextUrl.pathname;

  // Skip auth checks for API routes - early return
  if (url.startsWith('/api')) {
    return NextResponse.next();
  }

  // Check if session cookie exists (lightweight check without DB query)
  const sessionCookie = request.cookies.get('better-auth.session_token');

  // Public routes whitelist - allow unauthenticated access
  const publicRoutes = [
    '/sign-in',
    '/sign-up',
    '/verify-email',
    '/forgot-password',
    '/reset-password',
    '/public',
    '/account-configuration',
  ];
  const isPublic = publicRoutes.some((route) => url.includes(route));

  // Run i18n middleware FIRST before auth checks
  const response = await handleI18nRouting(request);

  // If it's public route, return i18n response immediately
  if (isPublic) {
    return response;
  }

  // Protected routes - require session cookie to exist
  // (actual authentication will be verified in Server Components/layouts)
  if (!sessionCookie) {
    // Extract locale from current URL
    const localeMatch = url.match(LOCALE_PREFIX_REGEX);
    const locale = localeMatch ? localeMatch[1] : 'en';
    const signInUrl = `/${locale}${SIGN_IN_PATH}`;
    return NextResponse.redirect(new URL(signInUrl, request.url));
  }

  // Session cookie exists, return i18n response
  return response;
}
