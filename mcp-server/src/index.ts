#!/usr/bin/env node
/**
 * index.ts — ProctorED MCP Server entry point.
 *
 * Supports two transports:
 *   stdio   — for Claude Desktop, Cursor, and local MCP clients (default)
 *   http    — Streamable HTTP for remote/web deployment
 *
 * Set MCP_TRANSPORT=http to activate HTTP mode.
 *
 * All tools are registered here. Tool dispatch wraps every call with
 * structured error handling so the client always gets a machine-readable error.
 */

import "dotenv/config";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { McpError, formatError } from "./errors.js";

import { createExamPaperTool } from "./tools/createExamPaper.js";
import { validateExamPaperTool } from "./tools/validateExamPaper.js";
import { addQuestionsToTestTool } from "./tools/addQuestionsToTest.js";
import { previewPaperTool } from "./tools/previewPaper.js";
import { publishTestTool } from "./tools/publishTest.js";
import { listTestsTool } from "./tools/listTests.js";

// ── Tool registry ─────────────────────────────────────────────────────────────

const TOOLS = [
  createExamPaperTool,
  validateExamPaperTool,
  addQuestionsToTestTool,
  previewPaperTool,
  publishTestTool,
  listTestsTool,
];

type ToolDef = (typeof TOOLS)[number];

const toolMap = new Map<string, ToolDef>(TOOLS.map((t) => [t.name, t]));

// ── Server setup ──────────────────────────────────────────────────────────────

const server = new Server(
  { name: "proctor-ed-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// List tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// Call tool
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const requestId = crypto.randomUUID();

  logger.info(`Tool called: ${name}`, { requestId, toolName: name });

  const tool = toolMap.get(name);
  if (!tool) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: "UNKNOWN_TOOL",
              message: `Unknown tool: ${name}. Available: ${TOOLS.map((t) => t.name).join(", ")}`,
              retryable: false,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  try {
    const result = await tool.execute(args, requestId);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (err) {
    const mcpErr = err instanceof McpError
      ? err.toJSON()
      : { code: "INTERNAL_ERROR", message: formatError(err), retryable: false };

    logger.error(`Tool failed: ${name}`, { requestId, toolName: name, error: mcpErr.message });

    return {
      content: [{ type: "text", text: JSON.stringify({ error: mcpErr }) }],
      isError: true,
    };
  }
});

// ── Transport ─────────────────────────────────────────────────────────────────

async function startStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("ProctorED MCP server running on stdio");
}

async function startHttp(port: number): Promise<void> {
  // Streamable HTTP transport — requires @modelcontextprotocol/sdk ≥ 1.9
  // Uses STATELESS mode: one transport instance, connected once, handles all requests.
  try {
    const { StreamableHTTPServerTransport } = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    const { createServer } = await import("node:http");
    const cfg = getConfig();

    // Stateless: sessionIdGenerator = undefined → no session validation, works for remote Claude connectors
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);

    const httpServer = createServer(async (req, res) => {
      // Health check endpoint — required by Render to confirm the service is up
      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "proctor-ed-mcp", version: "1.0.0" }));
        return;
      }

      // Only handle /mcp path
      if (req.url !== "/mcp") {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
        return;
      }

      // Bearer auth guard for HTTP transport
      if (cfg.mcp.authSecret) {
        const auth = req.headers["authorization"] ?? "";
        if (auth !== `Bearer ${cfg.mcp.authSecret}`) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { code: "AUTHENTICATION_FAILED", message: "Invalid MCP auth secret" } }));
          return;
        }
      }

      // GET /mcp → SSE stream; POST /mcp → JSON-RPC request
      if (req.method === "GET") {
        await transport.handleRequest(req, res);
      } else {
        await transport.handleRequest(req, res, await readBody(req));
      }
    });

    httpServer.listen(port, "0.0.0.0", () => {
      logger.info(`ProctorED MCP server running on 0.0.0.0:${port}`);
      logger.info(`Health:  http://0.0.0.0:${port}/health`);
      logger.info(`MCP:     http://0.0.0.0:${port}/mcp`);
    });
  } catch (err) {
    logger.error(`Failed to start HTTP transport: ${formatError(err)}. Falling back to stdio.`);
    await startStdio();
  }
}

async function readBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk: Buffer) => (body += chunk.toString()));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  let cfg: ReturnType<typeof getConfig>;
  try {
    cfg = getConfig();
  } catch (err) {
    // Config errors must be fatal and visible
    process.stderr.write(`FATAL: ${formatError(err)}\n`);
    process.exit(1);
  }

  logger.info("Starting ProctorED MCP server", { transport: cfg.mcp.transport, logLevel: cfg.log.level });

  if (cfg.mcp.transport === "http") {
    await startHttp(cfg.mcp.httpPort);
  } else {
    await startStdio();
  }
}

main().catch((err) => {
  process.stderr.write(`FATAL: ${formatError(err)}\n`);
  process.exit(1);
});
