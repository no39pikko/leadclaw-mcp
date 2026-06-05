/**
 * Lead-form webhook — the entry point of the execution loop.
 *
 * A form-fill (Meta Lead Ads, or a test POST) lands here, becomes a Lead, and
 * immediately kicks off the Speed-to-Lead pipeline in the background. We respond
 * 202 right away so the AI call isn't gated on the HTTP round-trip.
 *
 *   GET  /webhook/lead/:campaignId   Meta webhook verification (hub.challenge)
 *   POST /webhook/lead/:campaignId   Ingest a lead form-fill
 */
import { Router } from "express";
import { createLead, getCampaign } from "../gtm/db.js";
import { getAdDriver } from "../drivers/registry.js";
import { speedToLead } from "../gtm/pipeline.js";

export const leadWebhookRouter = Router();

// Meta (and similar) webhook verification handshake.
leadWebhookRouter.get("/lead/:campaignId", (req, res) => {
  const verifyToken = process.env.META_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && verifyToken && token === verifyToken) {
    res.status(200).send(String(challenge ?? ""));
    return;
  }
  res.status(200).json({ ok: true, hint: "POST a lead form-fill to this URL to trigger Speed-to-Lead." });
});

leadWebhookRouter.post("/lead/:campaignId", async (req, res) => {
  const campaign = getCampaign(req.params.campaignId);
  if (!campaign) {
    res.status(404).json({ error: "Unknown campaign" });
    return;
  }

  let parsed;
  try {
    const ad = getAdDriver(campaign.constraints.platform);
    parsed = await ad.parseLeadWebhook(req.body, campaign);
  } catch (err) {
    res.status(400).json({ error: `Could not parse lead payload: ${err instanceof Error ? err.message : String(err)}` });
    return;
  }
  if (!parsed || !parsed.phone) {
    res.status(422).json({ error: "Lead payload missing a phone number" });
    return;
  }

  const lead = createLead({
    campaign_id: campaign.id,
    name: parsed.name,
    email: parsed.email,
    phone: parsed.phone,
    company: parsed.company,
    title: parsed.title,
    consent: !!parsed.consent,
    source_platform: campaign.constraints.platform,
  });

  // Respond immediately; the call must not wait on the HTTP round-trip.
  res.status(202).json({ lead_id: lead.id, status: "received" });

  // Speed-to-Lead in the background.
  speedToLead(lead.id).catch((err) => {
    console.error(`[leadclaw] pipeline error for ${lead.id}:`, err);
  });
});
