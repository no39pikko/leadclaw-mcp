/**
 * Verify the auto-provisioner logic in MOCK mode (no RETELL_API_KEY → no real
 * Retell agent is created). Run WITHOUT --env-file:  node scripts/provision-test.mjs
 */
import { createAccount } from "../dist/db/store.js";
import { createCampaign, updateCampaign, getCampaign } from "../dist/gtm/db.js";
import { buildAgentConfig, provisionAgentForCampaign, retellConfigured } from "../dist/integrations/retellProvision.js";

console.log("RETELL configured:", retellConfigured(), "(should be false here)");

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
    booking_flow: "Offer two slots and confirm a consultation with a licensed agent.",
  },
});

const fresh = getCampaign(camp.id);
const cfg = buildAgentConfig(fresh);
console.log("\n=== begin_message ===\n" + cfg.begin_message);
console.log("\n=== general_prompt ===\n" + cfg.general_prompt);

const prov = await provisionAgentForCampaign(fresh);
console.log("\nProvision result:", prov);
updateCampaign(camp.id, { retell_agent_id: prov.agent_id });
console.log("Stored on campaign:", getCampaign(camp.id).retell_agent_id);
