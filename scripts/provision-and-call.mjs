/**
 * END-TO-END LIVE PROOF: the system auto-creates a Retell agent from a campaign's
 * script, then runs the full Speed-to-Lead pipeline to call a phone WITH THAT
 * AUTO-CREATED AGENT (no human pasting prompts).
 *
 *   npm run build
 *   node --env-file=.env scripts/provision-and-call.mjs +16692958797
 */
import { createAccount } from "../dist/db/store.js";
import { createCampaign, updateCampaign, getCampaign, createLead } from "../dist/gtm/db.js";
import { provisionAgentForCampaign } from "../dist/integrations/retellProvision.js";
import { speedToLead } from "../dist/gtm/pipeline.js";

const to = process.argv[2];
if (!to) {
  console.error("usage: node --env-file=.env scripts/provision-and-call.mjs +<your_phone_e164>");
  process.exit(1);
}

const acct = createAccount({ company_name: "Sakura Insurance Leads", credits: 1000 });
const camp = createCampaign({
  account_id: acct.api_key,
  icp: "people who requested an insurance quote online",
  offer: "the insurance quote you requested",
  daily_budget: 50,
  ad_targeting: {},
  constraints: { geos: [], call_hours: { start: 9, end: 17 }, consent_required: true, suppression: [], platform: "mock" },
});
updateCampaign(camp.id, {
  call_script: {
    opener: "Hi {{lead_name}}, you just requested an insurance quote online — got a minute for two quick questions?",
    ai_disclosure: "This call is handled by an AI assistant.",
    qualification_questions: [
      "What kind of coverage are you looking for?",
      "Do you currently have a policy?",
      "How soon do you want to be covered?",
    ],
    booking_flow: "Offer two specific time slots and confirm a consultation with a licensed agent.",
  },
  status: "active",
});

console.log("1) Auto-provisioning a Retell agent from the campaign script...");
const prov = await provisionAgentForCampaign(getCampaign(camp.id));
updateCampaign(camp.id, { retell_agent_id: prov.agent_id });
console.log("   -> agent created by the system:", prov.agent_id, "(live:", prov.live + ")");

const lead = createLead({
  campaign_id: camp.id,
  name: "Aoto",
  phone: to,
  email: "aoto@example.com",
  company: "Test",
  consent: true,
  source_platform: "mock",
});
console.log("2) Running Speed-to-Lead — calling", to, "with the AUTO-CREATED agent. PICK UP!\n");
const r = await speedToLead(lead.id);
console.log("Pipeline result:", JSON.stringify(r, null, 2));
