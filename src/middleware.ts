
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Reverting to a simple middleware that doesn't perform authentication checks.
// The settings page will be directly accessible.

export function middleware(request: NextRequest) {
  // No specific authentication checks for now.
  // Future middleware logic can be added here if needed.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
