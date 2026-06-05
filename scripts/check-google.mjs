/** Verify the Google Ads connection was stored for the test account. */
import { getGoogleConnection } from "../dist/integrations/googleAdsOAuth.js";

const apiKey = process.argv[2] || "lc_5b1945e02388ec4707eeb5b6";
const conn = getGoogleConnection(apiKey);
if (!conn) {
  console.log("NOT connected (no google entry for", apiKey + ")");
} else {
  console.log("access_token :", conn.access_token ? "present" : "MISSING");
  console.log("refresh_token:", conn.refresh_token ? "present" : "MISSING");
  console.log("customer_id  :", conn.customer_id ?? "(none discovered)");
  console.log("expires_at   :", new Date(conn.expires_at).toISOString());
}
