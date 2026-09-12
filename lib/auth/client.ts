"use client";

import { createAuthClient } from "@neondatabase/auth/next";

export const authClient = createAuthClient();

export async function provisionTeacherAccount(): Promise<{ error?: string }> {
	const response = await fetch("/api/auth/provision", {
		method: "POST",
		headers: { "content-type": "application/json" },
	});

	if (response.ok) return {};

	const body = (await response.json().catch(() => null)) as {
		error?: { message?: string };
	} | null;

	return { error: body?.error?.message || "Unable to prepare your teacher account." };
}
