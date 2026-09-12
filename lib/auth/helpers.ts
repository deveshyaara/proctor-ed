import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/client";
import { redirect } from "next/navigation";
import { ApiError } from "@/lib/exam/attemptAuth";
import type { User as ProctorUser } from "@prisma/client";

export type AuthenticatedTeacherSession = {
  user: {
    id: string; // ProctorED User cuid (for test ownership, queries, etc.)
    neonAuthUserId?: string | null;
    name: string;
    email: string;
    role: string;
  };
  session?: unknown;
};

/**
 * Reconciles a Neon Auth authenticated user with an application ProctorED User record.
 * 
 * Algorithm:
 * 1. Search User by neonAuthUserId.
 * 2. If not found, search by normalized email.
 * 3. If a matching email row is found, reject safely. Email is not an
 *    identity proof and must never be used to claim a teacher account.
 * 4. If no matching application User exists: reject safely (return null).
 * 
 * Never automatically grants TEACHER or ADMIN privileges to an unknown Neon Auth account.
 */
export async function findOrReconcileUser(neonUser: {
  id: string;
  email: string;
  name?: string | null;
}): Promise<ProctorUser | null> {
  if (!neonUser?.id) return null;

  // 1. Search by existing linked Neon Auth user ID
  const linkedUser = await prisma.user.findUnique({
    where: { neonAuthUserId: neonUser.id },
  });
  if (linkedUser) return linkedUser;

  // 2. Look up the normalized email only to make the refusal explicit. A Neon
  // account can be created or re-created with an existing address, so linking
  // it here would let that identity inherit the application's teacher role.
  const normalizedEmail = neonUser.email?.toLowerCase().trim();
  if (!normalizedEmail) return null;

  const existingByEmail = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existingByEmail) {
    // Deliberately do not bind or replace identities by email. Bind legacy
    // accounts during the controlled migration, then future logins resolve by
    // neonAuthUserId above. This keeps User.id and all ownership relations
    // stable while preventing account takeover by a matching email address.
    return null;
  }

  // 4. If no matching application User exists: reject safely
  return null;
}

/**
 * Returns current ProctorED session or null without throwing or redirecting.
 * Authenticates via Neon Auth and maps to the ProctorED User identity.
 */
export async function getSession(): Promise<AuthenticatedTeacherSession | null> {
  try {
    const { data: session } = await auth.getSession();
    if (!session?.user?.id) return null;

    const proctorUser = await findOrReconcileUser(session.user);
    if (!proctorUser) return null;

    return {
      user: {
        id: proctorUser.id,
        neonAuthUserId: proctorUser.neonAuthUserId ?? session.user.id,
        email: proctorUser.email,
        name: proctorUser.name,
        role: proctorUser.role,
      },
      session: session.session,
    };
  } catch {
    return null;
  }
}

/**
 * For Server Components & Server Actions:
 * Returns authenticated teacher session. Redirects to /login if missing or unauthorized.
 */
export async function requireTeacherSession(): Promise<AuthenticatedTeacherSession> {
  const session = await getSession();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const role = session.user.role;
  if (role !== "TEACHER" && role !== "ADMIN") {
    redirect("/login");
  }

  return session;
}

// Backwards-compatible alias for Server Components
export const requireTeacher = requireTeacherSession;

/**
 * For API Routes:
 * Returns authenticated teacher session.
 * Throws ApiError(401) if unauthenticated.
 * Throws ApiError(403) if authenticated user has no ProctorED record or lacks teacher privileges.
 * NEVER calls redirect() so JSON APIs return proper HTTP status codes.
 */
export async function requireTeacherApi(): Promise<AuthenticatedTeacherSession> {
  const { data: session } = await auth.getSession();
  if (!session?.user?.id) {
    throw new ApiError(401, "UNAUTHORIZED", "Authentication required.");
  }

  const proctorUser = await findOrReconcileUser(session.user);
  if (!proctorUser) {
    throw new ApiError(403, "FORBIDDEN", "No associated ProctorED account found.");
  }

  if (proctorUser.role !== "TEACHER" && proctorUser.role !== "ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Teacher privileges required.");
  }

  return {
    user: {
      id: proctorUser.id,
      neonAuthUserId: proctorUser.neonAuthUserId ?? session.user.id,
      email: proctorUser.email,
      name: proctorUser.name,
      role: proctorUser.role,
    },
    session: session.session,
  };
}

/**
 * Returns current user ID or null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const session = await getSession();
  return session?.user?.id ?? null;
}
