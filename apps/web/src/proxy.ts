import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';

import { routing } from './i18n/routing';
import { defaultLocale, locales } from './app/config';

// Create i18n middleware handler OUTSIDE the middleware function
const handleI18nRouting = createMiddleware(routing);

const LOCALE_PREFIX_REGEX = new RegExp(`^/(${locales.join('|')})(?:/|$)`);
const LOCALE_ONLY_PATH_REGEX = new RegExp(`^/(${locales.join('|')})$`);
const SIGN_IN_PATH = '/sign-in';
const PUBLIC_THREAD_RATE_LIMIT = 30;
const WINDOW_SECONDS = 60;

async function checkPublicThreadRateLimit(ip: string): Promise<boolean> {
  try {
    const { getRedisInstance } = await import('@/app/lib/services/redis');
    const redis = getRedisInstance();
    if (!redis) {
      return true;
    }
    const key = `ptl:rl:ip:${ip}`;
    const count = await redis.incrWithExpire(key, WINDOW_SECONDS);
    return count <= PUBLIC_THREAD_RATE_LIMIT;
  } catch {
    return true;
  }
}

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

export default async function proxy(request: NextRequest) {
  const url = request.nextUrl.pathname;

  // Skip auth checks for API routes - early return
  if (url.startsWith('/api')) {
    return NextResponse.next();
  }

  // Manually handle root path redirect to default locale
  // next-intl might not handle this with localePrefix: { mode: 'always' }
  if (url === '/') {
    // Get locale from Accept-Language header or use default. Strip each
    // entry's quality suffix (e.g. ";q=0.8") before normalizing, and walk
    // the list in the order the client sent it until one is supported —
    // taking only the first entry ignored lower-priority entries the app
    // actually does support.
    const acceptedLocales = (request.headers.get('accept-language') ?? '')
      .split(',')
      .map((lang) => lang.split(';')[0]?.trim().split('-')[0]?.toLowerCase())
      .filter((lang): lang is string => Boolean(lang));
    const locale =
      acceptedLocales.find((lang) =>
        (locales as readonly string[]).includes(lang),
      ) ?? defaultLocale;
    return NextResponse.redirect(new URL(`/${locale}`, request.url));
  }

  // Check if session cookie exists (lightweight check without DB query)
  // Better Auth uses __Secure- prefix when baseURL is HTTPS
  const sessionCookie =
    request.cookies.get('better-auth.session_token') ||
    request.cookies.get('__Secure-better-auth.session_token');

  const isPublicThread = /^\/[^/]+\/public\/thread\//.test(url);
  if (isPublicThread) {
    const ip =
      request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      request.headers.get('x-real-ip') ??
      'unknown';
    const allowed = await checkPublicThreadRateLimit(ip);
    if (!allowed) {
      return new NextResponse('Too Many Requests', { status: 429 });
    }
  }

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

  // Handle locale-only paths, e.g. '/pl' or '/en'
  const isLocaleOnlyPath = url.match(LOCALE_ONLY_PATH_REGEX);
  if (isLocaleOnlyPath) {
    // If no session, redirect to sign-in
    if (!sessionCookie) {
      const localeMatch = url.match(LOCALE_PREFIX_REGEX);
      const locale = localeMatch ? localeMatch[1] : defaultLocale;
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
    const locale = localeMatch ? localeMatch[1] : defaultLocale;
    const signInUrl = `/${locale}${SIGN_IN_PATH}`;
    return NextResponse.redirect(new URL(signInUrl, request.url));
  }

  // Session cookie exists, allow request through
  return handleI18nRouting(request);
}
