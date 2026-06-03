# GTM Agent — Runbook

How to run, demo, and take the GTM Agent live. Read [GTM_AGENT_SPEC.md](GTM_AGENT_SPEC.md) first for the *why*; this is the *how*.

The model: **paid ads → form-fill → AI voice call within ~60s → booked meeting.** Claude (in Claude Desktop) is the strategist; the always-on HTTP server is the Speed-to-Lead engine.

---

## TL;DR — it runs with zero API keys

Every external dependency is behind a driver with a **mock** implementation, so the whole pipeline runs end-to-end before you spend a cent or wire any vendor.

```bash
npm install
npm run build

# 1) Direct pipeline smoke test (no server needed)
DRIVER_MODE=mock node scripts/e2e.mjs

# 2) HTTP webhook smoke test (the execution loop)
DRIVER_MODE=mock PORT=4100 node dist/v2/server.js   # terminal A
PORT=4100 node scripts/http-test.mjs                # terminal B
```

`scripts/e2e.mjs` proves enrich → scrub (the compliance gate) → AI call → book → metrics, including a no-consent lead that gets blocked. `scripts/http-test.mjs` proves a form-fill POST to `/webhook/lead/:campaignId` returns `202` immediately and the call runs in the background.

---

## The two ways to run

| | Command | Use |
|---|---|---|
| **stdio (local, single account)** | `npm start` (after build) | Local dev / Claude Desktop on this machine. Auth via `LEADCLAW_API_KEY` env. |
| **v2 HTTP (remote, multi-tenant)** | `npm run v2` | Real deployment. Bearer-token auth, lead webhooks, admin UI, portal. |

### Connect Claude Desktop

Local (stdio):
```json
{ "mcpServers": { "leadclaw": {
  "command": "node",
  "args": ["C:\\path\\to\\leadclaw-mcp\\dist\\index.js"],
  "env": { "LEADCLAW_API_KEY": "lc_...", "DRIVER_MODE": "mock" }
}}}
```

Remote (v2 HTTP):
```json
{ "mcpServers": { "leadclaw": {
  "url": "http://localhost:4000/mcp",
  "headers": { "Authorization": "Bearer lc_..." }
}}}
```

Create an account / API key with the admin CLI:
```bash
npm run admin create-account -- --company "Acme" --credits 1000
npm run admin list-accounts
npm run admin add-credits -- <api_key> 500
```

---

## The flow in Claude (what the user does)

1. `configure_account` — company, ICP, offer.
2. `define_campaign` — ICP, offer, targeting, daily budget → returns a `campaign_id` (draft, no spend).
3. `generate_ad_creative` — ad + lead form (a phone field and consent checkbox are enforced).
4. `generate_call_script` — AI opener, qualification, booking flow.
5. **Review with the user, confirm budget** (this is the approval gate — it lives in the chat).
6. `launch_campaign` — **starts ad spend** + the Speed-to-Lead engine.
7. Form-fills hit `/webhook/lead/:campaignId` → enrich → scrub → AI call within ~60s → book → log. No Claude needed in this hot path.
8. `get_campaign_metrics`, `get_leads`, `query_assets` — review and adjust.

To demo without a live ad: `submit_test_lead` runs a simulated form-fill through the full pipeline.

---

## Multi-tenant onboarding — connect a customer's Meta account

Shared vs per-customer infrastructure:

| | Owner | Customer's job |
|---|---|---|
| **Twilio number / Retell** (calling) | **We own it** — shared across all customers | Nothing; they never see it. (At scale, move to a number *pool* with rotation to avoid "Scam Likely" flags.) |
| **Meta ad account** (entry) | **Customer's own**, connected via OAuth | Click a link, authorize (seconds) |

How the click-to-connect works (the AI hands them a URL):
1. Customer (in Claude) → `connect_ad_account` → returns `PUBLIC_URL/connect/meta?api_key=...`.
2. They open it → redirected to Meta's consent dialog → authorize.
3. Callback stores their token in `ad_accounts`; `MetaAdDriver` then runs **their** campaigns on **their** ad account.
4. `launch_campaign` refuses with the connect link until they're connected.

### Two things OAuth can't remove (be honest with customers)
- **Meta App Review.** To let *external* customers grant the ads scopes, your Meta app must pass App Review (business verification, privacy policy, demo video — days to weeks). **You (dogfood) can connect immediately** by adding yourself as an app *test user* — no review wait. Run App Review in parallel for public launch.
- **The customer must have a Meta ad account + payment method.** OAuth connects an *existing* account; it can't bypass Meta's billing/identity. We guide them, but that part lives on Meta.

### Setting up the Meta app (one-time, admin)
1. https://developers.facebook.com → Create App → type "Business".
2. Add the **Facebook Login** and **Marketing API** products.
3. OAuth redirect URI: `PUBLIC_URL/connect/meta/callback`.
4. Put the app id/secret in `.env` as `META_APP_ID` / `META_APP_SECRET`, set `PUBLIC_URL`.
5. For dogfood now: App roles → add yourself as a test user. For customers: submit App Review for `ads_management`, `leads_retrieval`, `pages_manage_ads`.

(Single-tenant dogfood shortcut: skip OAuth entirely — set `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` and the driver uses that one account.)

---

## Going live, one driver at a time

Adding a driver's keys to `.env` automatically switches it from mock to live (in `auto`/`live` mode). Check what's live at `GET /health` → `drivers`.

| Driver | Env vars | Notes |
|---|---|---|
| **Ad** (Meta Lead Ads) | `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_VERIFY_TOKEN` | `launchCampaign` creates a PAUSED campaign; finish ad set + creative in Ads Manager for the dogfood phase. Point the Meta leadgen webhook at `/webhook/lead/:campaignId`. Webhook parsing is fully implemented. |
| **Call** (Retell) | `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_FROM_NUMBER` | Configure the agent with a custom analysis field `booked_time` so bookings are captured. Calls complete async; the driver polls until ended. Mind caller-ID / "Scam Likely" — register the number. |
| **Enrich** (Apollo) | `APOLLO_API_KEY` | Fills title/company/phone/context before the call. |
| **Scrub** (Twilio Lookup) | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Layers real phone validation on top of consent/hours/suppression checks. |
| **Calendar** (Google) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` + `npm run admin google-auth` | Books the meeting on the primary calendar. |
| **CRM** (Notion) | `NOTION_API_KEY`, `NOTION_LEADS_DB_ID` | DB needs: Name(title), Company(rich_text), Phone(phone_number), Email(email), Outcome(rich_text), Meeting(date). |
| **Billing** (Stripe) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Credit top-ups. |

---

## Compliance — non-negotiable

- The lead form **must** carry a consent checkbox ("I agree to be contacted by phone, including via automated/AI voice…"). `scrub_lead` blocks any lead where `consent_required` is set and consent is missing. TCPA treats AI voice as artificial/prerecorded → prior express written consent.
- The AI **discloses it's an AI** at call start (in the generated script).
- Business-hours gating uses the lead's timezone; suppression lists are honored.
- A lead that fails `scrub_lead` is **never called** — this is a hard gate, not a soft step.

---

## Credits / pricing (provisional)

`src/gtm/pricing.ts` holds placeholder rates (1 credit ≈ $1): ad spend per lead, enrich, scrub, call. They are **deliberately rough** — the plan is to dogfood real campaigns, measure true cost-per-meeting (expect ~$150–300 on B2B ads, still cheaper than an SDR agency), and replace them. Per-meeting cost is shown in `get_campaign_metrics`.

---

## What is and isn't done

**Done (this build):** full tool contract; mock + live driver clients for every stage; the Speed-to-Lead pipeline with the compliance gate and credit metering; the lead webhook; asset store + metrics; mock end-to-end verified (both direct and over HTTP).

**Needs your keys + budget (live milestone):** real Meta campaign delivery (ad set/creative), a registered calling number, real ad spend, and a Notion DB. Flip each driver as above. First customer = dogfood (use the GTM Agent to get the GTM Agent's own customers).

**Designed-for, deferred:** customer-owned ad accounts via OAuth (`AdAccount` table + `AdDriver` are shaped for it); `HumanCallDriver` (interface only — swap in if AI calling underperforms); LinkedIn/Google ad drivers.
