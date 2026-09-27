import { NextResponse } from "next/server";
import { requireTeacherApi } from "@/lib/auth/helpers";
import { prisma } from "@/lib/db/client";
import crypto from "crypto";

export async function POST(req: Request) {
  try {
    const session = await requireTeacherApi();
    const body = await req.json().catch(() => ({}));
    const name = body.name || "MCP Client";

    // Generate a secure 32-byte token (64 hex characters)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const apiToken = await prisma.apiToken.create({
      data: {
        userId: session.user.id,
        name,
        tokenHash,
      },
    });

    return NextResponse.json({
      id: apiToken.id,
      name: apiToken.name,
      // Provide the raw token ONLY ONCE. It cannot be retrieved again.
      token: rawToken,
      createdAt: apiToken.createdAt,
    });
  } catch (error: any) {
    console.error("Failed to create API token", error);
    if (error.statusCode) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to create API token." } }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await requireTeacherApi();

    const tokens = await prisma.apiToken.findMany({
      where: { userId: session.user.id },
      select: {
        id: true,
        name: true,
        createdAt: true,
        lastUsedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tokens });
  } catch (error: any) {
    if (error.statusCode) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch API tokens." } }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await requireTeacherApi();
    const url = new URL(req.url);
    const tokenId = url.searchParams.get("id");

    if (!tokenId) {
      return NextResponse.json({ error: { code: "INVALID_INPUT", message: "Token ID is required." } }, { status: 400 });
    }

    await prisma.apiToken.deleteMany({
      where: {
        id: tokenId,
        userId: session.user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    if (error.statusCode) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: error.statusCode });
    }
    return NextResponse.json({ error: { code: "INTERNAL_ERROR", message: "Failed to delete API token." } }, { status: 500 });
  }
}
