/**
 * tools/listTests.ts — MCP Tool: list_tests
 *
 * Returns paginated list of the authenticated teacher's tests.
 * Never exposes another teacher's data (enforced by ProctorED API + service token scope).
 */

import { z } from "zod";
import { ProctorEdClient } from "../client.js";
import { McpError } from "../errors.js";
import { audit } from "../audit.js";

const InputSchema = z.object({
  status: z.enum(["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"]).optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
  cursor: z.string().optional(),
});

export const listTestsTool = {
  name: "list_tests",
  description: "List your exam papers. Filter by status (DRAFT, PUBLISHED, CLOSED). Supports pagination.",

  inputSchema: {
    type: "object" as const,
    properties: {
      status: { type: "string", enum: ["DRAFT", "PUBLISHED", "CLOSED", "ARCHIVED"], description: "Filter by test status" },
      limit: { type: "number", description: "Number of tests to return (1-50, default: 20)" },
      cursor: { type: "string", description: "Pagination cursor from previous response" },
    },
  },

  async execute(rawInput: unknown, requestId: string): Promise<unknown> {
    audit({ requestId, toolName: "list_tests", action: "TOOL_CALLED", timestamp: new Date().toISOString() });

    const parsed = InputSchema.safeParse(rawInput ?? {});
    if (!parsed.success) {
      throw new McpError({ code: "INVALID_INPUT", message: parsed.error.errors.map((e) => e.message).join("; "), retryable: false });
    }

    const { status, limit, cursor } = parsed.data;
    const client = new ProctorEdClient();

    const result = await client.listTests(status, cursor, limit);

    const tests = result.tests.map((t) => ({
      id: t.id,
      title: t.title,
      subject: t.subject,
      className: t.className,
      testCode: t.testCode,
      status: t.status,
      durationMinutes: Math.round(t.durationSeconds / 60),
      questionCount: t._count?.questions ?? 0,
      attemptCount: t._count?.attempts ?? 0,
      createdAt: t.createdAt,
      publishedAt: t.publishedAt ?? null,
    }));

    return {
      tests,
      count: tests.length,
      nextCursor: result.nextCursor ?? null,
      hasMore: result.nextCursor !== null,
    };
  },
};
