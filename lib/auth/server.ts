import { createNeonAuth } from "@neondatabase/auth/next/server";
import { serverEnv } from "@/lib/config/env";

export const auth = createNeonAuth({
  baseUrl: serverEnv.NEON_AUTH_BASE_URL,
  cookies: {
    secret: serverEnv.NEON_AUTH_COOKIE_SECRET,
    sessionDataTtl: 300,
  },
});
