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
    const { SSEServerTransport } = await import("@modelcontextprotocol/sdk/server/sse.js");
    const { createServer } = await import("node:http");
    const cfg = getConfig();

    // Store active transport per session
    let transport: import("@modelcontextprotocol/sdk/server/sse.js").SSEServerTransport | null = null;

    const httpServer = createServer(async (req, res) => {
      // CORS Headers for Claude Web Client
      const headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
      };

      if (req.method === "OPTIONS") {
        res.writeHead(204, headers);
        res.end();
        return;
      }

      // Add CORS to all responses
      Object.entries(headers).forEach(([key, value]) => res.setHeader(key, value));

      // Health check endpoint
      if (req.url === "/health" || req.url === "/") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", server: "proctor-ed-mcp", version: "1.0.0" }));
        return;
      }

      logger.info(`Received request: ${req.method} ${req.url}`);

      // Bearer auth guard for HTTP transport
      if (cfg.mcp.authSecret) {
        const auth = req.headers["authorization"] ?? "";
        if (auth !== `Bearer ${cfg.mcp.authSecret}`) {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { code: "AUTHENTICATION_FAILED", message: "Invalid MCP auth secret" } }));
          return;
        }
      }

      try {
        const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
        
        if (url.pathname === "/mcp" && req.method === "GET") {
          // Initialize SSE connection
          transport = new SSEServerTransport("/mcp/message", res);
          await server.connect(transport);
          await transport.start();
          return;
        }
        
        if (url.pathname === "/mcp/message" && req.method === "POST") {
          // Handle incoming messages
          if (!transport) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Session not initialized" }));
            return;
          }
          await transport.handlePostMessage(req, res, await readBody(req));
          return;
        }

        // Unknown route
        logger.info(`Returning 404 for ${req.url}`);
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      } catch (err) {
        logger.error(`Error in HTTP server: ${err instanceof Error ? err.stack : err}`);
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: err instanceof Error ? err.message : String(err) } }));
        }
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
