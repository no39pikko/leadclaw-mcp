/**
 * Ring my phone — minimal Retell wiring test. No account/campaign/MCP needed.
 * Calls your phone directly via the RetellCallDriver and prints the result.
 *
 *   npm run build
 *   node --env-file=.env scripts/ring-test.mjs +81XXXXXXXXXX
 *
 * .env must contain RETELL_API_KEY, RETELL_AGENT_ID, RETELL_FROM_NUMBER.
 * (Polls until the call ends — may take a couple minutes. Booking auto-detect
 * needs a Retell post-call analysis field `booked_time`; without it the call
 * still rings and talks, it just won't create a calendar event.)
 */
import { RetellCallDriver } from "../dist/drivers/retell.js";

const to = process.argv[2];
if (!to) {
  console.error("usage: node --env-file=.env scripts/ring-test.mjs +<your_phone_e164>");
  process.exit(1);
}
for (const v of ["RETELL_API_KEY", "RETELL_AGENT_ID", "RETELL_FROM_NUMBER"]) {
  if (!process.env[v]) {
    console.error(`Missing ${v} — put it in .env and run with: node --env-file=.env scripts/ring-test.mjs ${to}`);
    process.exit(1);
  }
}

const driver = new RetellCallDriver();
const lead = {
  id: "ringtest",
  campaign_id: "ringtest",
  name: "Aoto",
  title: "Founder",
  company: "Test Co",
  phone: to,
  email: "",
  consent: true,
  source_platform: "mock",
  form_submitted_at: Date.now(),
  enrichment: { account_context: "Just testing the GTM agent's call integration." },
  scrub_status: "callable",
  status: "scrubbed",
  created_at: Date.now(),
};
const script = {
  opener: "Hi, this is a quick test call from the GTM agent — can you hear me okay?",
  ai_disclosure: "This call is handled by an AI assistant.",
  qualification_questions: ["How's your day going?", "Is the audio clear on your end?"],
  booking_flow: "This is just a wiring test — no need to book anything.",
};

console.log(`Calling ${to} from ${process.env.RETELL_FROM_NUMBER} (agent ${process.env.RETELL_AGENT_ID})...`);
console.log("Pick up — then watch the result print here when the call ends.\n");
const result = await driver.call(lead, script);
console.log("Call result:", result);
