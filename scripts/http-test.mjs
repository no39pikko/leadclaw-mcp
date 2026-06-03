/**
 * HTTP webhook smoke test — proves the execution-loop entry point.
 * Requires the v2 server running in mock mode on PORT (default 4100):
 *   DRIVER_MODE=mock PORT=4100 node dist/v2/server.js
 * Then:  node scripts/http-test.mjs
 */
import { createAccount } from "../dist/db/store.js";
import { createCampaign, updateCampaign, campaignMetrics, getLeadsByCampaign } from "../dist/gtm/db.js";

const PORT = process.env.PORT ?? "4100";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const acct = createAccount({ company_name: "Webhook Test Inc", credits: 1000 });
const camp = createCampaign({
  account_id: acct.api_key,
  icp: "B2B SaaS founders",
  offer: "AI SDR",
  daily_budget: 50,
  ad_targeting: {},
  constraints: { geos: [], call_hours: { start: 9, end: 17 }, consent_required: true, suppression: [], platform: "mock" },
});
updateCampaign(camp.id, {
  ad_creative: { headline: "x", body: "y", image_brief: "z", form_questions: ["Phone number", "Consent"] },
  call_script: { opener: "hi", ai_disclosure: "ai", qualification_questions: ["?"], booking_flow: "book" },
  status: "active",
});

const url = `http://localhost:${PORT}/webhook/lead/${camp.id}`;
console.log("POST", url);
const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Webhook Lead",
    email: "webhook@example.com",
    phone: "+12125551234",
    company: "Inbound Co",
    consent: true,
  }),
});
console.log("Response:", res.status, await res.json());

// Give the background pipeline a moment to finish (mock call is fast).
await sleep(2500);

const leads = getLeadsByCampaign(camp.id);
console.log(`\nLeads for ${camp.id}:`);
for (const l of leads) console.log(`  ${l.id} status=${l.status} scrub=${l.scrub_status} phone=${l.phone}`);
console.log("\nMetrics:", campaignMetrics(camp.id));
