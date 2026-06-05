/** Set the active Google Ads customer_id on a stored connection.
 *   node scripts/set-google-customer.mjs <api_key> <customer_id_digits>
 */
import { getGoogleConnection, storeGoogleConnection } from "../dist/integrations/googleAdsOAuth.js";

const apiKey = process.argv[2];
const customerId = process.argv[3];
const conn = getGoogleConnection(apiKey);
if (!conn) {
  console.log("No google connection for", apiKey);
  process.exit(1);
}
storeGoogleConnection(apiKey, { ...conn, customer_id: customerId });
console.log("customer_id set to", customerId, "for", apiKey);
