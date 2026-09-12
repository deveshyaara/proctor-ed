import { auth } from "@/lib/auth/server";
import { NextResponse } from "next/server";
import { LogEvents, logger } from "@/lib/utils/logger";

const { GET, POST: neonAuthPost } = auth.handler();

export { GET };

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> }
) {
  const requestUrl = new URL(request.url);
  const shouldLogSignInFailure = requestUrl.pathname.endsWith("/api/auth/sign-in/email");
  const requestForLogging = shouldLogSignInFailure ? request.clone() : null;

  try {
    const response = await neonAuthPost(request, context);

    if (shouldLogSignInFailure && !response.ok) {
      const [requestBody, responseBody] = await Promise.all([
        requestForLogging?.json().catch(() => null),
        response.clone().json().catch(() => null),
      ]);

      const email =
        requestBody &&
        typeof requestBody === "object" &&
        "email" in requestBody &&
        typeof requestBody.email === "string"
          ? requestBody.email.trim().toLowerCase()
          : undefined;

      logger.warn(LogEvents.LOGIN_FAILED, {
        provider: "neon_auth",
        route: "/api/auth/sign-in/email",
        status: response.status,
        code:
          responseBody &&
          typeof responseBody === "object" &&
          "code" in responseBody
            ? responseBody.code
            : undefined,
        message:
          responseBody &&
          typeof responseBody === "object" &&
          "message" in responseBody
            ? responseBody.message
            : undefined,
        email,
      });
    }

    return response;
  } catch (error) {
    const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

    if (shouldLogSignInFailure) {
      logger.error(LogEvents.LOGIN_FAILED, {
        provider: "neon_auth",
        route: "/api/auth/sign-in/email",
        status: 500,
        requestId,
        message: error instanceof Error ? error.message : "Unknown sign-in failure",
      });
    }

    return NextResponse.json(
      {
        message: "Authentication service is temporarily unavailable.",
        code: "AUTH_SERVICE_UNAVAILABLE",
        requestId,
      },
      {
        status: 500,
        headers: { "x-request-id": requestId },
      }
    );
  }
}
