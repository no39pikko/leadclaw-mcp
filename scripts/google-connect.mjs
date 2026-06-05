/**
 * Create a test account and print the Google Ads connect URL. The v2 server must
 * be running (npm run v2) on the same PUBLIC_URL. Open the printed URL in your
 * browser, authorize, and the callback stores your Google token.
 *
 *   node --env-file=.env scripts/google-connect.mjs
 */
import { createAccount } from "../dist/db/store.js";
import { googleAdsConfigured } from "../dist/integrations/googleAdsOAuth.js";

console.log("Google Ads configured (client+secret+dev token):", googleAdsConfigured());

const acct = createAccount({ company_name: "SakuraInsuranceLeads", credits: 1000 });
const base = process.env.PUBLIC_URL ?? "http://localhost:4000";
console.log("\napi_key:", acct.api_key);
console.log("\n>>> Open this in your browser to connect Google Ads:\n");
console.log(`${base}/connect/google?api_key=${acct.api_key}`);
