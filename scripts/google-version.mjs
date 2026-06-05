/** Probe which Google Ads API versions are live (non-404). */
import { getAccessToken } from "../dist/integrations/googleAdsOAuth.js";

const apiKey = process.argv[2] || "lc_5b1945e02388ec4707eeb5b6";
const { accessToken } = await getAccessToken(apiKey);
const headers = {
  Authorization: `Bearer ${accessToken}`,
  "developer-token": process.env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
};
for (const v of ["v16", "v17", "v18", "v19", "v20", "v21", "v22", "v23"]) {
  try {
    const res = await fetch(`https://googleads.googleapis.com/${v}/customers:listAccessibleCustomers`, { headers });
    const body = await res.text();
    console.log(`${v}: HTTP ${res.status}  ${body.slice(0, 120).replace(/\s+/g, " ")}`);
  } catch (e) {
    console.log(`${v}: ERROR ${e.message}`);
  }
}
