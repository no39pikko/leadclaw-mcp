#!/usr/bin/env node
/**
 * LeadClaw v2 — Remote MCP Server (StreamableHTTP)
 *
 * Endpoints:
 *   POST/GET  /mcp        MCP over StreamableHTTP (Bearer auth required)
 *   GET/POST  /admin/*    Founder admin web UI
 *   GET/POST  /portal/*   Customer onboarding portal
 *   GET       /health     Health check
 *
 * Usage:
 *   npm run v2            Start v2 server (default port 4000)
 *
 * Claude Desktop config for remote MCP:
 *   {
 *     "mcpServers": {
 *       "leadclaw": {
 *         "url": "http://localhost:4000/mcp",
 *         "headers": { "Authorization": "Bearer lc_your_key_here" }
 *       }
 *     }
 *   }
 */

import express from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

import { getAccount } from "../db/store.js";
import { apiKeyContext } from "./context.js";
import { adminRouter } from "../admin/web.js";
import { portalRouter } from "../portal/index.js";

import { registerAllTools } from "../tools/register.js";
import { driverSummary } from "../drivers/registry.js";
import { leadWebhookRouter } from "./webhook.js";
import { connectRouter } from "./connect.js";

// ---- Session Store ----

interface Session {
  transport: StreamableHTTPServerTransport;
  api_key: string;
}
const sessions = new Map<string, Session>();

// ---- MCP Server Factory ----

function createMcpServer(): McpServer {
  const server = new McpServer({ name: "leadclaw", version: "0.5.0" });
  registerAllTools(server);
  return server;
}

// ---- Auth Helper ----

function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return null;
  return auth.slice(7).trim();
}

// ---- Express App ----

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "0.5.0",
    sessions: sessions.size,
    drivers: driverSummary(),
    timestamp: new Date().toISOString(),
  });
});

// ---- Lead-form webhook (execution-loop entry point) ----
app.use("/webhook", leadWebhookRouter);

// ---- Ad-account OAuth connect ----
app.use("/connect", connectRouter);

// ---- MCP Endpoint ----

app.all("/mcp", async (req, res) => {
  try {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Reuse existing session
    if (sessionId && sessions.has(sessionId)) {
      const { transport, api_key } = sessions.get(sessionId)!;
      await apiKeyContext.run(api_key, () => transport.handleRequest(req, res, req.body));
      return;
    }

    // New session — authenticate via Bearer token
    const api_key = extractBearerToken(req);
    if (!api_key) {
      res.status(401).json({
        error: "Missing Authorization header",
        hint: "Add 'Authorization: Bearer lc_your_key' to your MCP config headers",
      });
      return;
    }

    const account = getAccount(api_key);
    if (!account) {
      res.status(401).json({ error: "Invalid API key" });
      return;
    }

    // Create transport + server for this session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
        console.error(`[leadclaw] Session closed: ${transport.sessionId} (${account.company_name || api_key})`);
      }
    };

    const server = createMcpServer();
    await server.connect(transport);

    // Handle the request within the api_key context
    await apiKeyContext.run(api_key, () => transport.handleRequest(req, res, req.body));

    // Register session after first request
    if (transport.sessionId) {
      sessions.set(transport.sessionId, { transport, api_key });
      console.error(`[leadclaw] Session created: ${transport.sessionId} → ${account.company_name || api_key} (${account.credits} credits)`);
    }
  } catch (err) {
    console.error("[leadclaw] MCP error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

// ---- Admin UI (password protected) ----

const ADMIN_SECRET = process.env.ADMIN_SECRET;

app.use("/admin", (req, res, next) => {
  // Skip auth if ADMIN_SECRET is not set (local dev convenience)
  if (!ADMIN_SECRET) { next(); return; }

  // Check session cookie
  const cookie = req.headers.cookie ?? "";
  const hasSession = cookie.includes(`admin_auth=${ADMIN_SECRET}`);
  if (hasSession) { next(); return; }

  // Show login form for GET requests that aren't the login POST
  if (req.method === "GET" && req.path !== "/login") {
    res.send(`<!DOCTYPE html>
<html><head><title>Admin Login — LeadClaw</title>
<style>*{box-sizing:border-box;font-family:system-ui,sans-serif}body{background:#1e293b;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{background:white;padding:2.5rem;border-radius:12px;width:340px}.h1{font-size:1.4rem;font-weight:700;margin-bottom:1.5rem;color:#1e293b}input{width:100%;padding:.6rem .8rem;border:1px solid #d1d5db;border-radius:6px;font-size:.9rem;margin-bottom:1rem}button{width:100%;padding:.7rem;background:#4f46e5;color:white;border:none;border-radius:6px;font-size:.95rem;cursor:pointer}</style>
</head><body><div class="card">
<div class="h1">⚡ LeadClaw Admin</div>
<form method="POST" action="/admin/login">
  <input type="password" name="secret" placeholder="Admin password" autofocus>
  <button type="submit">Login</button>
</form></div></body></html>`);
    return;
  }
  next();
});

app.post("/admin/login", (req, res) => {
  const { secret } = req.body as { secret: string };
  if (secret === ADMIN_SECRET) {
    res.setHeader("Set-Cookie", `admin_auth=${ADMIN_SECRET}; Path=/admin; HttpOnly; SameSite=Strict`);
    res.redirect("/admin");
  } else {
    res.redirect("/admin");
  }
});

app.use("/admin", adminRouter);

// Admin redirect
app.get("/", (_req, res) => res.redirect("/admin"));

// Language switcher
app.get("/set-lang", (req, res) => {
  const lang = req.query.lang === "en" ? "en" : "ja";
  const redirect = typeof req.query.redirect === "string" ? req.query.redirect : "/";
  res.setHeader("Set-Cookie", `lc_lang=${lang}; Path=/; SameSite=Lax; Max-Age=31536000`);
  res.redirect(redirect);
});

// ---- Customer Portal ----

app.use("/portal", portalRouter);

// ---- Start Server ----

const PORT = parseInt(process.env.PORT ?? "4000", 10);

app.listen(PORT, () => {
  console.error(`[leadclaw v2] Server running on http://localhost:${PORT}`);
  console.error(`[leadclaw v2]   Admin UI:  http://localhost:${PORT}/admin`);
  console.error(`[leadclaw v2]   Portal:    http://localhost:${PORT}/portal`);
  console.error(`[leadclaw v2]   MCP:       http://localhost:${PORT}/mcp`);
  console.error(`[leadclaw v2]   Health:    http://localhost:${PORT}/health`);
  console.error();
  console.error(`[leadclaw v2] Claude Desktop config (remote MCP):`);
  console.error(`[leadclaw v2]   {`);
  console.error(`[leadclaw v2]     "mcpServers": {`);
  console.error(`[leadclaw v2]       "leadclaw": {`);
  console.error(`[leadclaw v2]         "url": "http://localhost:${PORT}/mcp",`);
  console.error(`[leadclaw v2]         "headers": { "Authorization": "Bearer lc_your_key_here" }`);
  console.error(`[leadclaw v2]       }`);
  console.error(`[leadclaw v2]     }`);
  console.error(`[leadclaw v2]   }`);
});
