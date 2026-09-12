import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/server";
import { prisma } from "@/lib/db/client";

export async function POST() {
  const { data: session } = await auth.getSession();
  const neonUser = session?.user;

  if (!neonUser?.id || !neonUser.email) {
    return NextResponse.json(
      { error: { code: "UNAUTHORIZED", message: "Authentication required." } },
      { status: 401 }
    );
  }

  const email = neonUser.email.trim().toLowerCase();
  const existingByIdentity = await prisma.user.findUnique({
    where: { neonAuthUserId: neonUser.id },
  });

  if (existingByIdentity) {
    if (existingByIdentity.role !== "TEACHER" && existingByIdentity.role !== "ADMIN") {
      return NextResponse.json(
        { error: { code: "FORBIDDEN", message: "Teacher privileges required." } },
        { status: 403 }
      );
    }

    return NextResponse.json({ userId: existingByIdentity.id });
  }

  const existingByEmail = await prisma.user.findUnique({ where: { email } });

  if (existingByEmail?.neonAuthUserId && existingByEmail.neonAuthUserId !== neonUser.id) {
    return NextResponse.json(
      { error: { code: "IDENTITY_CONFLICT", message: "This email is linked to another identity." } },
      { status: 409 }
    );
  }

  if (existingByEmail && existingByEmail.role !== "TEACHER" && existingByEmail.role !== "ADMIN") {
    return NextResponse.json(
      { error: { code: "FORBIDDEN", message: "Teacher privileges required." } },
      { status: 403 }
    );
  }

  if (existingByEmail) {
    const updated = await prisma.user.updateMany({
      where: { id: existingByEmail.id, neonAuthUserId: null },
      data: { neonAuthUserId: neonUser.id },
    });

    if (updated.count !== 1) {
      return NextResponse.json(
        { error: { code: "IDENTITY_CONFLICT", message: "This account changed during provisioning." } },
        { status: 409 }
      );
    }

    return NextResponse.json({ userId: existingByEmail.id }, { status: 201 });
  }

  const created = await prisma.user.create({
    data: {
      name: neonUser.name?.trim() || email.split("@")[0],
      email,
      neonAuthUserId: neonUser.id,
      role: "TEACHER",
    },
  });

  return NextResponse.json({ userId: created.id }, { status: 201 });
}