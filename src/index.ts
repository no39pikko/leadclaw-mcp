#!/usr/bin/env node
/**
 * LeadClaw / GTM Agent — stdio MCP server (local, single-account dev mode).
 * For the remote multi-tenant server (Bearer auth, webhooks) use `npm run v2`.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/register.js";

async function main() {
  const server = new McpServer({ name: "leadclaw", version: "0.5.0" });
  registerAllTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // stderr only — stdout is reserved for MCP traffic.
  console.error("[leadclaw] fatal:", err);
  process.exit(1);
});
