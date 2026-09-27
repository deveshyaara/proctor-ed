# ProctorED MCP Server

A production-ready Model Context Protocol (MCP) server that empowers AI clients (like Claude Desktop or Cursor) to securely generate, validate, and publish exam papers for ProctorED.

## Features

- **Safe AI Orchestration**: Generates questions via OpenAI Structured Outputs.
- **Defense in Depth**: Every AI-generated question is programmatically and semantically validated.
- **Duplicate Prevention**: Rejects near-duplicate questions using TF-IDF / Cosine Similarity.
- **Transactional Consistency**: Never generates "half a paper". Always creates questions in bulk.
- **Privileged Publishing**: `generate_exam_paper` only creates DRAFTs. A separate `publish_test` tool requires explicit confirmation to make exams live.

## Quick Start

1. Install dependencies:
   ```bash
   cd mcp-server
   npm install
   ```

2. Copy the environment template:
   ```bash
   cp .env.example .env
   ```
   Fill in your `OPENAI_API_KEY`. The `PROCTOR_ED_API_URL` defaults to `http://localhost:3000`.

3. Generate a Service Token:
   - Make sure your local ProctorED server is running (`npm run dev`).
   - Use the UI or API (`POST /api/auth/tokens`) to generate an MCP token for your teacher account.
   - Set `PROCTOR_ED_SERVICE_TOKEN` in `.env` to this value.

4. Build the server:
   ```bash
   npm run build
   ```

## MCP Client Configuration

### Claude Desktop
Add the following to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "proctored": {
      "command": "node",
      "args": ["/path/to/proctor-ed/mcp-server/dist/index.js"],
      "env": {
        "OPENAI_API_KEY": "sk-proj-...",
        "PROCTOR_ED_SERVICE_TOKEN": "your_generated_teacher_token",
        "PROCTOR_ED_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Remote / HTTP Transport

The server supports remote deployments via HTTP (e.g. deployed on Railway or Render alongside the main app).

```bash
# Start in HTTP mode (defaults to port 3001)
npm run start:http
```

Configure `MCP_AUTH_SECRET` to secure the HTTP endpoint.

## API Documentation

The MCP Server relies on the following ProctorED REST APIs:

### `POST /api/auth/tokens`
Generates a new MCP token.
- **Auth**: Requires standard Next.js Session (Teacher)
- **Body**: `{ "name": "Claude Desktop" }`
- **Response**: `{ "id": "...", "token": "<raw_token>" }`

### `GET /api/auth/tokens`
Lists active MCP tokens.

### `DELETE /api/auth/tokens?id=...`
Revokes an MCP token.

### `GET /api/tests/:id/questions`
Retrieves all questions for a test.

### `POST /api/tests/:id/questions/bulk`
Inserts multiple questions transactionally.
- **Auth**: Bearer `<MCP_TOKEN>`
- **Body**: `{ "questions": [ { ... } ] }`

### `POST /api/tests/:id/publish`
Publishes a draft test.

## Security Model & Auditability

1. **User-Scoped Tokens**: Every MCP action runs under the identity of the teacher who generated the token. The AI cannot access or modify tests belonging to other teachers.
2. **Read-Only Scopes**: `validate_exam_paper` and `preview_paper` only read data.
3. **Draft-First Policy**: All generations are `DRAFT`. An explicit `confirmPublish=true` flag is required to publish.
4. **Audit Log**: Every tool call, generation attempt, and validation failure is logged as structured JSON to `stderr` (which Claude Desktop ignores as errors, but logs in the backend).

## Error Codes

The MCP server translates complex errors into readable, actionable JSON for the AI client. If an error is `retryable`, the AI will automatically retry.

- `AUTHENTICATION_FAILED`: Token is invalid or expired.
- `FORBIDDEN`: Teacher does not own this test.
- `TEST_NOT_FOUND`: The specified Test ID does not exist.
- `TEST_NOT_EDITABLE`: Cannot modify a Published or Closed test.
- `GENERATION_FAILED`: OpenAI API error or prompt engineering failure.
- `PAPER_VALIDATION_FAILED`: The generated questions violated the exam constraints.
- `IDEMPOTENCY_CONFLICT`: A test with this idempotency key was already created.

## Development

```bash
# Run with tsx (auto-reloads if configured)
npm run dev

# Run tests
npm test
```
