import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require teacher authentication
const PROTECTED_PREFIXES = ["/dashboard", "/tests"];

const neonMiddleware = auth.middleware({
  loginUrl: "/login",
});

/**
 * Next.js 16 Proxy layer (official Neon Auth middleware)
 * Protects teacher application routes while keeping student/public routes unaffected.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

  if (!isProtected) {
    return NextResponse.next();
  }

  return neonMiddleware(request);
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/tests",
    "/tests/:path*",
  ],
};
