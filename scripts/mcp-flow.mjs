/**
 * REAL MCP-protocol end-to-end test. Spawns the stdio MCP server and drives it
 * exactly the way Claude Desktop would (initialize, tools/list, tools/call),
 * with API-key auth. Proves the GTM tools are usable *as an MCP server*.
 *
 *   npm run build && node scripts/mcp-flow.mjs
 */
import { createAccount } from "../dist/db/store.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Create an account so the server's API-key auth has something to resolve.
const acct = createAccount({ company_name: "Northwind Labs", credits: 1000 });
console.log("Account api_key:", acct.api_key);

const transport = new StdioClientTransport({
  command: "node",
  args: ["dist/index.js"],
  env: { ...process.env, LEADCLAW_API_KEY: acct.api_key, DRIVER_MODE: "mock" },
});
const client = new Client({ name: "flow-test", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const list = await client.listTools();
console.log("\nTOOLS (" + list.tools.length + "): " + list.tools.map((t) => t.name).join(", "));

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content ?? []).map((c) => c.text).filter(Boolean).join("\n");
  console.log("\n### " + name + (r.isError ? " (ERROR)" : "") + "\n" + text);
  return r;
}

await call("configure_account", {
  company_name: "Northwind Labs",
  icp: "Heads of Sales at 50-200 person B2B SaaS companies",
  industry: "B2B SaaS",
  target_role: "VP Sales",
});

const dc = await call("define_campaign", {
  icp: "Heads of Sales at 50-200 person B2B SaaS companies in the US",
  offer: "a 15-minute teardown of your outbound funnel",
  daily_budget: 60,
  locations: ["United States"],
  titles: ["VP Sales", "Head of Sales"],
});
const campaignId = dc.structuredContent?.campaign_id;
console.log("\n--> campaign_id: " + campaignId);

await call("generate_ad_creative", { campaign_id: campaignId });
await call("generate_call_script", { campaign_id: campaignId });
await call("provision_call_agent", { campaign_id: campaignId });
await call("launch_campaign", { campaign_id: campaignId });
await call("submit_test_lead", { campaign_id: campaignId, name: "Jordan Reyes", phone: "+13125550123", consent: true });
await call("get_campaign_metrics", { campaign_id: campaignId });

await client.close();
console.log("\n=== MCP flow complete ===");
