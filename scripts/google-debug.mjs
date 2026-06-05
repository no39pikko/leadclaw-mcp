/** Diagnose customer_id discovery: call listAccessibleCustomers with the stored token. */
import { getAccessToken } from "../dist/integrations/googleAdsOAuth.js";

const apiKey = process.argv[2] || "lc_5b1945e02388ec4707eeb5b6";
const { accessToken } = await getAccessToken(apiKey);
const res = await fetch("https://googleads.googleapis.com/v17/customers:listAccessibleCustomers", {
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
  },
});
console.log("HTTP", res.status);
console.log(await res.text());
