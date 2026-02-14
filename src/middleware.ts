import createMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';

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
    // Explicitly match root path
    '/',
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

  // Manually handle root path redirect to default locale
  // next-intl might not handle this with localePrefix: { mode: 'always' }
  if (url === '/') {
    // Get locale from Accept-Language header or use default
    const locale =
      request.headers
        .get('accept-language')
        ?.split(',')[0]
        ?.split('-')[0]
        ?.toLowerCase() === 'pl'
        ? 'pl'
        : 'en';
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
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
    '/accept-invitation',
    '/initial-account',
  ];
  const isPublic = publicRoutes.some((route) => url.includes(route));

  // Let next-intl handle paths without locale prefix
  const hasLocalePrefix = url.match(LOCALE_PREFIX_REGEX);
  if (!hasLocalePrefix) {
    return handleI18nRouting(request);
  }

  // Handle locale-only paths '/pl' or '/en'
  const isLocaleOnlyPath = url.match(/^\/(pl|en)$/);
  if (isLocaleOnlyPath) {
    // If no session, redirect to sign-in
    if (!sessionCookie) {
      const localeMatch = url.match(LOCALE_PREFIX_REGEX);
      const locale = localeMatch ? localeMatch[1] : 'en';
      const signInUrl = `/${locale}${SIGN_IN_PATH}`;
      return NextResponse.redirect(new URL(signInUrl, request.url));
    }
    // Has session, allow through to panel
    return handleI18nRouting(request);
  }

  // Public routes - call i18n routing directly
  if (isPublic) {
    return handleI18nRouting(request);
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

  // Session cookie exists, allow request through
  return handleI18nRouting(request);
}
