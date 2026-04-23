import { type NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // API routes are excluded — they require LUMA_API_KEY to do anything useful
  if (request.nextUrl.pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Basic ')) {
    const credentials = atob(authHeader.slice(6));
    const colonIndex = credentials.indexOf(':');
    const username = credentials.slice(0, colonIndex);
    const password = credentials.slice(colonIndex + 1);

    if (
      username === process.env.DASHBOARD_USER &&
      password === process.env.DASHBOARD_PASS &&
      username &&
      password
    ) {
      return NextResponse.next();
    }
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Air Events Dashboard"' },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
