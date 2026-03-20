import { type NextRequest, NextResponse } from 'next/server';

const publicPaths = ['/login', '/api/auth'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths (exact match or segment prefix)
  if (
    publicPaths.some(
      (path) => pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return NextResponse.next();
  }

  // Check for session cookie (better-auth cookie with custom prefix)
  // Over HTTPS, better-auth prefixes cookies with __Secure-
  const sessionCookie =
    request.cookies.get('__Secure-ragen-admin.session_token') ||
    request.cookies.get('ragen-admin.session_token');
  if (!sessionCookie) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('callbackUrl', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
