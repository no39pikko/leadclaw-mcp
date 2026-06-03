/**
 * Mock end-to-end smoke test for the GTM Agent Speed-to-Lead pipeline.
 * Run after `npm run build`:  DRIVER_MODE=mock node scripts/e2e.mjs
 *
 * Proves: account -> campaign -> creative/script -> N form-fills run through
 * enrich -> scrub (hard gate) -> AI call -> book -> asset log, with metrics.
 * Lead #0 has consent=false and MUST be blocked by the compliance gate.
 */
import { createAccount } from "../dist/db/store.js";
import {
  createCampaign,
  updateCampaign,
  createLead,
  campaignMetrics,
} from "../dist/gtm/db.js";
import { speedToLead } from "../dist/gtm/pipeline.js";
import { driverSummary } from "../dist/drivers/registry.js";

console.log("Drivers in use:", driverSummary());

const acct = createAccount({ company_name: "Dogfood Inc", credits: 1000 });
console.log("Account:", acct.api_key, "credits:", acct.credits);

const camp = createCampaign({
  account_id: acct.api_key,
  icp: "Series A B2B SaaS founders in the US",
  offer: "Done-for-you AI SDR that books demos",
  daily_budget: 50,
  ad_targeting: { titles: ["CEO", "Founder"], locations: ["United States"] },
  constraints: {
    geos: ["United States"],
    call_hours: { start: 9, end: 17 },
    consent_required: true,
    suppression: [],
    platform: "mock",
  },
});
updateCampaign(camp.id, {
  ad_creative: {
    headline: "Stop chasing leads",
    body: "We call your form-fills in 60 seconds.",
    image_brief: "Founder headshot, bold value prop.",
    form_questions: ["Full name", "Work email", "Phone number", "Company", "Consent checkbox"],
  },
  call_script: {
    opener: "Hi {{lead_name}}, you just filled our form...",
    ai_disclosure: "This call is handled by an AI assistant.",
    qualification_questions: ["Why now?", "Who decides?", "Timeline?"],
    booking_flow: "Offer two slots and confirm.",
  },
  status: "active",
});
console.log("Campaign:", camp.id, "live\n");

const N = 8;
for (let i = 0; i < N; i++) {
  const lead = createLead({
    campaign_id: camp.id,
    name: `Lead ${i}`,
    phone: "+12125550" + String(100 + i),
    email: `lead${i}@example.com`,
    company: `Company ${i}`,
    consent: i !== 0, // lead #0 did NOT consent -> must be blocked
    source_platform: "mock",
  });
  const r = await speedToLead(lead.id);
  console.log(
    `  ${lead.id}  status=${r.status}  callable=${r.callable}  call=${r.call?.outcome ?? "-"}  appt=${r.appointment_id ?? "-"}  spent=${r.credits_spent}`
  );
}

console.log("\nCampaign metrics:");
console.log(campaignMetrics(camp.id));
