#!/usr/bin/env node
/**
 * LeadClaw v2 stdio proxy
 *
 * Claude Desktop (stdio) と v2 HTTP サーバー (StreamableHTTP) を橋渡しする。
 * Claude Desktop は stdio で通信し、このプロキシが HTTP に変換する。
 *
 * claude_desktop_config.json:
 * {
 *   "mcpServers": {
 *     "leadclaw": {
 *       "command": "node",
 *       "args": ["C:\\LeadClaw\\dist\\v2\\proxy.js"],
 *       "env": {
 *         "LEADCLAW_API_KEY": "lc_your_key_here",
 *         "LEADCLAW_SERVER_URL": "http://localhost:4000"
 *       }
 *     }
 *   }
 * }
 */

import { request } from "node:http";
import { createInterface } from "node:readline";

const API_KEY = process.env.LEADCLAW_API_KEY;
const SERVER_URL = process.env.LEADCLAW_SERVER_URL ?? "http://localhost:4000";

if (!API_KEY) {
  process.stderr.write("[leadclaw-proxy] Error: LEADCLAW_API_KEY is not set\n");
  process.exit(1);
}

let sessionId: string | undefined;

/**
 * POST a JSON-RPC message to the v2 HTTP server, return all SSE data lines.
 */
function mcpPost(body: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const url = new URL("/mcp", SERVER_URL);
    const bodyBuf = Buffer.from(body, "utf8");

    const headers: Record<string, string | number> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      "Authorization": `Bearer ${API_KEY}`,
      "Content-Length": bodyBuf.byteLength,
    };
    if (sessionId) headers["mcp-session-id"] = sessionId;

    const opts = {
      method: "POST",
      hostname: url.hostname,
      port: Number(url.port) || 80,
      path: url.pathname,
      headers,
    };

    const req = request(opts, (res) => {
      // Capture session ID from server
      const sid = res.headers["mcp-session-id"];
      if (sid && !sessionId) {
        sessionId = Array.isArray(sid) ? sid[0] : sid;
        process.stderr.write(`[leadclaw-proxy] Session established: ${sessionId}\n`);
      }

      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk: string) => { raw += chunk; });
      res.on("end", () => {
        // Parse SSE: extract "data: <json>" lines
        const messages: string[] = [];
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            const json = trimmed.slice(6).trim();
            if (json) messages.push(json);
          }
        }
        resolve(messages);
      });
    });

    req.on("error", (err) => {
      reject(new Error(`Cannot connect to LeadClaw server at ${SERVER_URL}: ${err.message}`));
    });

    req.write(bodyBuf);
    req.end();
  });
}

// ---- stdin → HTTP → stdout ----

process.stderr.write(`[leadclaw-proxy] Starting. Server: ${SERVER_URL}, Key: ${API_KEY!.slice(0, 10)}...\n`);

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

rl.on("line", async (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const responses = await mcpPost(trimmed);
    for (const msg of responses) {
      process.stdout.write(msg + "\n");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`[leadclaw-proxy] Error: ${msg}\n`);
    // Return a JSON-RPC error to Claude Desktop
    const errResponse = JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32603, message: msg },
      id: null,
    });
    process.stdout.write(errResponse + "\n");
  }
});

rl.on("close", () => {
  process.stderr.write("[leadclaw-proxy] stdin closed, exiting.\n");
  process.exit(0);
});
