/**
 * Meta Marketing API — create a deliverable Lead Ads campaign.
 *
 * Modeled on Meta's own recommended "Advantage+ Lead" playbook (broad audience +
 * algorithmic optimization + an Instant Form), which is the modern best practice
 * for lead-gen on Meta. We call the public Graph/Marketing API directly with the
 * customer's OAuth token — original code, no proprietary source copied.
 *
 * Flow (the standard Meta object hierarchy):
 *   lead form (Instant Form, on the Page) → campaign (OUTCOME_LEADS)
 *   → ad set (budget, geo, Advantage+ audience, optimize for leads, on-ad form)
 *   → creative (headline/body/image + SIGN_UP CTA → the form) → ad
 *   → subscribe the Page to the `leadgen` webhook so fills hit /webhook/lead/:id
 *
 * NOTE: This is live-ready but UNTESTED against the live API (Meta for Developers
 * is region-blocked for the current operator). Verify field names against the
 * current Marketing API version before first live use.
 */
import { getAccount } from "../db/store.js";
import { baseUrl } from "./metaOAuth.js";
import type { Campaign } from "../gtm/types.js";

const GRAPH = "https://graph.facebook.com/v19.0";

/** Minimal country-name → ISO-3166 code map; falls back to US. */
const COUNTRY_CODES: Record<string, string> = {
  "united states": "US", usa: "US", us: "US", "u.s.": "US",
  canada: "CA", "united kingdom": "GB", uk: "GB", australia: "AU",
  japan: "JP", germany: "DE", france: "FR", india: "IN",
};

function toCountryCodes(geos: string[]): string[] {
  const codes = (geos ?? [])
    .map((g) => COUNTRY_CODES[g.trim().toLowerCase()] ?? (g.length === 2 ? g.toUpperCase() : null))
    .filter((c): c is string => !!c);
  return codes.length ? Array.from(new Set(codes)) : ["US"];
}

async function graph(path: string, token: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`${GRAPH}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(`Meta ${path} failed: ${data.error?.message ?? res.status}`);
  }
  return data;
}

/** Fetch the Page access token (required to subscribe the Page to leadgen). */
async function getPageToken(pageId: string, userToken: string): Promise<string | null> {
  try {
    const res = await fetch(`${GRAPH}/${pageId}?fields=access_token&access_token=${encodeURIComponent(userToken)}`);
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export interface LaunchInput {
  token: string;
  adAccountId: string;
  pageId: string;
  campaign: Campaign;
}

export interface LaunchResult {
  adCampaignId: string;
  formId: string;
  adSetId: string;
  adId: string;
  status: string;
}

export async function launchLeadCampaign(input: LaunchInput): Promise<LaunchResult> {
  const { token, adAccountId, pageId, campaign } = input;
  const act = `act_${adAccountId}`;
  const company = getAccount(campaign.account_id)?.company_name || "our team";
  const creative = campaign.ad_creative;
  const paused = process.env.META_LAUNCH_PAUSED === "true";
  const status = paused ? "PAUSED" : "ACTIVE";

  const headline = creative?.headline || campaign.offer;
  const body = creative?.body || `${campaign.offer}. We'll call you within minutes.`;
  const needQuestion =
    (creative?.form_questions ?? []).find((q) => /\?$|solve|looking|need/i.test(q)) ||
    `What are you looking to solve with ${campaign.offer}?`;
  const consentLine =
    (creative?.form_questions ?? []).find((q) => /consent|agree to be contacted/i.test(q)) ||
    "I agree to be contacted by phone, including via automated/AI voice, at the number I provide.";

  const privacyUrl = process.env.META_PRIVACY_URL || `${baseUrl()}/privacy`;
  const imageHash = process.env.META_AD_IMAGE_HASH;
  if (!imageHash) {
    throw new Error(
      "META_AD_IMAGE_HASH not set. Upload a creative image to the ad account once and set its hash, or extend launch to generate one."
    );
  }

  // 1. Instant Form (Page-owned), with the TCPA consent as a required disclaimer checkbox.
  const form = await graph(`${pageId}/leadgen_forms`, token, {
    name: `GTM ${campaign.id}`,
    locale: "en_US",
    follow_up_action_url: `${baseUrl()}/lp/${campaign.id}`,
    privacy_policy: { url: privacyUrl, link_text: "Privacy Policy" },
    questions: [
      { type: "FULL_NAME" },
      { type: "EMAIL" },
      { type: "PHONE" },
      { type: "COMPANY_NAME" },
      { type: "CUSTOM", key: "need", label: needQuestion },
    ],
    // Required consent checkbox (the legal pillar for AI voice calls).
    custom_disclaimer: {
      title: "Consent to be contacted",
      body: { text: consentLine },
      checkboxes: [{ key: "tcpa_consent", required: true, label: { text: consentLine } }],
    },
  });
  const formId = form.id as string;

  // 2. Campaign (lead objective). Created paused; the ad set/ad carry delivery status.
  const camp = await graph(`${act}/campaigns`, token, {
    name: `GTM | ${company} | ${campaign.id}`,
    objective: "OUTCOME_LEADS",
    status: "PAUSED",
    special_ad_categories: [],
  });
  const adCampaignId = camp.id as string;

  // 3. Ad set — Advantage+ audience (broad) + geo, optimized for lead generation.
  const adSet = await graph(`${act}/adsets`, token, {
    name: `GTM ${campaign.id} adset`,
    campaign_id: adCampaignId,
    daily_budget: Math.round(campaign.daily_budget * 100), // cents
    billing_event: "IMPRESSIONS",
    optimization_goal: "LEAD_GENERATION",
    destination_type: "ON_AD", // native Instant Form
    promoted_object: { page_id: pageId },
    targeting: {
      geo_locations: { countries: toCountryCodes(campaign.constraints.geos) },
      age_min: 18,
      age_max: 65,
      // Advantage+ audience: let Meta's model find the buyers; the ICP lives in the
      // ad copy + the qualifying question, since Meta can't target job titles.
      targeting_automation: { advantage_audience: 1 },
    },
    status,
  });
  const adSetId = adSet.id as string;

  // 4. Creative — headline/body/image + a SIGN_UP CTA pointing at the Instant Form.
  const adCreative = await graph(`${act}/adcreatives`, token, {
    name: `GTM ${campaign.id} creative`,
    object_story_spec: {
      page_id: pageId,
      link_data: {
        message: body,
        name: headline,
        image_hash: imageHash,
        link: `${baseUrl()}/lp/${campaign.id}`,
        call_to_action: { type: "SIGN_UP", value: { lead_gen_form_id: formId } },
      },
    },
  });
  const creativeId = adCreative.id as string;

  // 5. Ad.
  const ad = await graph(`${act}/ads`, token, {
    name: `GTM ${campaign.id} ad`,
    adset_id: adSetId,
    creative: { creative_id: creativeId },
    status,
  });
  const adId = ad.id as string;

  // 6. Subscribe the Page to leadgen so fills hit our webhook.
  const pageToken = (await getPageToken(pageId, token)) ?? token;
  try {
    await graph(`${pageId}/subscribed_apps`, pageToken, { subscribed_fields: ["leadgen"] });
  } catch {
    // non-fatal: leads can still be polled, but real-time webhook is preferred.
  }

  return { adCampaignId, formId, adSetId, adId, status };
}
