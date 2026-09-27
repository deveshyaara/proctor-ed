import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Routes that require teacher authentication
const PROTECTED_PREFIXES = ["/dashboard", "/tests"];
const TEACHER_API_PREFIXES = ["/api/tests", "/api/health"];

const SESSION_COOKIE_CANDIDATES = [
  "neon-auth-session",
  "__neon_session",
  "better-auth.session_token",
  "__session",
];

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

  const isTeacherApi = TEACHER_API_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );

  if (isProtected) {
    return neonMiddleware(request);
  }

  if (isTeacherApi) {
    const hasSessionCookie = SESSION_COOKIE_CANDIDATES.some((name) =>
      request.cookies.has(name)
    );
    const hasAuthHeader = request.headers.get("authorization")?.startsWith("Bearer ") ?? false;

    if (!hasSessionCookie && !hasAuthHeader) {
      return NextResponse.json(
        { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/tests",
    "/tests/:path*",
    "/api/:path*", // Include API routes for the API check
  ],
};
