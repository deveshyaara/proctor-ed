/**
 * config.ts — Validated environment configuration for the MCP server.
 *
 * All environment variables are read and validated once at startup.
 * If any required variable is missing, the server exits immediately with a
 * clear error message rather than failing silently mid-request.
 */

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

function optionalEnv(name: string, defaultVal: string): string {
  return process.env[name] ?? defaultVal;
}

function intEnv(name: string, defaultVal: number): number {
  const raw = process.env[name];
  if (!raw) return defaultVal;
  const n = parseInt(raw, 10);
  if (isNaN(n)) throw new Error(`Environment variable ${name} must be an integer, got: ${raw}`);
  return n;
}

export type Config = {
  api: {
    baseUrl: string;
    serviceToken: string;
    timeoutMs: number;
  };
  openai: {
    apiKey: string;
    model: string;
    verifierModel: string;
  };
  mcp: {
    transport: "stdio" | "http";
    httpPort: number;
    authSecret: string | null;
  };
  generation: {
    batchSize: number;
    maxRetriesPerQuestion: number;
  };
  log: {
    level: "debug" | "info" | "warn" | "error";
  };
};

let _config: Config | null = null;

export function getConfig(): Config {
  if (_config) return _config;

  const transport = optionalEnv("MCP_TRANSPORT", "stdio");
  if (transport !== "stdio" && transport !== "http") {
    throw new Error(`MCP_TRANSPORT must be "stdio" or "http", got: ${transport}`);
  }

  const logLevel = optionalEnv("LOG_LEVEL", "info");
  if (!["debug", "info", "warn", "error"].includes(logLevel)) {
    throw new Error(`LOG_LEVEL must be debug|info|warn|error, got: ${logLevel}`);
  }

  _config = {
    api: {
      baseUrl: optionalEnv("PROCTOR_ED_API_URL", "http://localhost:3000").replace(/\/$/, ""),
      serviceToken: requireEnv("PROCTOR_ED_SERVICE_TOKEN"),
      timeoutMs: intEnv("API_TIMEOUT_MS", 30_000),
    },
    openai: {
      apiKey: requireEnv("OPENAI_API_KEY"),
      model: optionalEnv("OPENAI_MODEL", "gpt-4o-2024-08-06"),
      verifierModel: optionalEnv("OPENAI_VERIFIER_MODEL", "gpt-4o-mini-2024-07-18"),
    },
    mcp: {
      transport: transport as "stdio" | "http",
      httpPort: intEnv("MCP_HTTP_PORT", intEnv("PORT", 3001)),
      authSecret: process.env["MCP_AUTH_SECRET"] ?? null,
    },
    generation: {
      batchSize: intEnv("BATCH_SIZE", 5),
      maxRetriesPerQuestion: intEnv("MAX_RETRIES_PER_QUESTION", 3),
    },
    log: {
      level: logLevel as Config["log"]["level"],
    },
  };

  return _config;
}
