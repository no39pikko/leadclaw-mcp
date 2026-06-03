/** Seed a campaign, print its LP URL, and check the LP renders. */
import { createAccount } from "../dist/db/store.js";
import { createCampaign, updateCampaign } from "../dist/gtm/db.js";

const PORT = process.env.PORT ?? "4100";
const acct = createAccount({ company_name: "LP Test", credits: 1000 });
const camp = createCampaign({
  account_id: acct.api_key, icp: "founders", offer: "AI that calls your inbound leads in 60 seconds",
  daily_budget: 50, ad_targeting: {},
  constraints: { geos: [], call_hours: { start: 9, end: 17 }, consent_required: true, suppression: [], platform: "mock" },
});
updateCampaign(camp.id, {
  ad_creative: { headline: "Never let a lead go cold", body: "Drop your number — our AI calls you in under a minute.", image_brief: "", form_questions: [] },
  call_script: { opener: "hi", ai_disclosure: "ai", qualification_questions: ["?"], booking_flow: "book" },
  status: "active",
});
console.log("LP URL:", `http://localhost:${PORT}/lp/${camp.id}`);
const html = await (await fetch(`http://localhost:${PORT}/lp/${camp.id}`)).text();
console.log("LP renders headline:", /Never let a lead go cold/.test(html));
console.log("LP has consent checkbox:", /name="consent"/.test(html) && /automated\/AI voice/.test(html));
console.log("LP posts to webhook:", html.includes(`/webhook/lead/${camp.id}`));
