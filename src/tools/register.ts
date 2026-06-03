/**
 * Single source of truth for tool registration — used by both the stdio server
 * (src/index.ts) and the v2 HTTP server (src/v2/server.ts) so the two never
 * drift apart.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { configureInputShape, configureAccountHandler, accountInfoInputShape, getAccountInfoHandler } from "./settings.js";

// GTM Agent (ads -> Speed-to-Lead)
import {
  defineCampaignShape, defineCampaignHandler,
  generateAdCreativeShape, generateAdCreativeHandler,
  generateCallScriptShape, generateCallScriptHandler,
  launchCampaignShape, launchCampaignHandler,
  pauseCampaignShape, pauseCampaignHandler,
  adjustBudgetShape, adjustBudgetHandler,
  listCampaignsShape, listCampaignsHandler,
} from "./campaign.js";
import {
  getLeadsShape, getLeadsHandler,
  enrichLeadShape, enrichLeadHandler,
  scrubLeadShape, scrubLeadHandler,
  callLeadShape, callLeadHandler,
  submitTestLeadShape, submitTestLeadHandler,
} from "./leads.js";
import {
  campaignMetricsShape, getCampaignMetricsHandler,
  queryAssetsShape, queryAssetsHandler,
  logAssetShape, logAssetHandler,
} from "./assets.js";

// Legacy demo tools (original managed-SDR concept; kept for the demo video).
import { bookInputShape, bookAppointmentsHandler } from "./book.js";
import { statusInputShape, checkStatusHandler } from "./status.js";
import { detailsInputShape, getAppointmentDetailsHandler } from "./details.js";
import { calendarInputShape, addToCalendarTool } from "./calendar.js";

export function registerAllTools(server: McpServer): void {
  // ---- Account ----
  server.registerTool("configure_account", {
    title: "Configure account settings",
    description:
      "Save your company info, ICP (Ideal Customer Profile), offer, and default targeting. " +
      "Call during first-time setup or when the user says 'my company is...', 'we sell...', 'our ICP is...'.",
    inputSchema: configureInputShape,
  }, configureAccountHandler);

  server.registerTool("get_account_info", {
    title: "Get account info and credit balance",
    description:
      "Show current account settings and remaining credits. Use when the user asks about balance, settings, or credits.",
    inputSchema: accountInfoInputShape,
  }, getAccountInfoHandler);

  // ---- GTM: campaign design + control ----
  server.registerTool("define_campaign", {
    title: "Define a GTM campaign",
    description:
      "Start a new ads -> Speed-to-Lead campaign: paid ads capture form-fills, then an AI voice agent calls each lead within ~60s to qualify and book a meeting. " +
      "Call this when the user wants to generate leads/meetings, run ads, or 'get me customers'. " +
      "Creates a DRAFT — no ad spend until launch_campaign. Returns a campaign_id.",
    inputSchema: defineCampaignShape,
  }, defineCampaignHandler);

  server.registerTool("generate_ad_creative", {
    title: "Generate / set ad creative + lead form",
    description:
      "Draft (or save your own) the ad headline, body, image brief, and lead-form questions for a campaign. " +
      "A phone field and a consent checkbox are always enforced (required to legally call the lead). " +
      "Call after define_campaign.",
    inputSchema: generateAdCreativeShape,
  }, generateAdCreativeHandler);

  server.registerTool("generate_call_script", {
    title: "Generate / set the AI call script",
    description:
      "Draft (or save your own) the AI voice agent's opener, qualification questions, and booking flow for a campaign. " +
      "The opener references the ad the lead just responded to. Call after define_campaign.",
    inputSchema: generateCallScriptShape,
  }, generateCallScriptHandler);

  server.registerTool("launch_campaign", {
    title: "Launch a campaign (starts ad spend)",
    description:
      "Go live: starts ad spend and the Speed-to-Lead engine. ONLY call after the user has approved the targeting, budget, creative, and call script. Requires ad creative + call script to be set first.",
    inputSchema: launchCampaignShape,
  }, launchCampaignHandler);

  server.registerTool("pause_campaign", {
    title: "Pause a campaign",
    description: "Stop ad spend for a campaign. Use when the user wants to pause, stop, or halt a campaign.",
    inputSchema: pauseCampaignShape,
  }, pauseCampaignHandler);

  server.registerTool("adjust_budget", {
    title: "Adjust campaign daily budget",
    description: "Change the daily ad spend for a campaign.",
    inputSchema: adjustBudgetShape,
  }, adjustBudgetHandler);

  server.registerTool("list_campaigns", {
    title: "List campaigns",
    description: "List the account's campaigns with status and budget.",
    inputSchema: listCampaignsShape,
  }, listCampaignsHandler);

  // ---- GTM: leads ----
  server.registerTool("get_leads", {
    title: "List campaign leads",
    description: "List leads (form-fills) for a campaign, optionally filtered by status. Use to review who came in and what happened.",
    inputSchema: getLeadsShape,
  }, getLeadsHandler);

  server.registerTool("enrich_lead", {
    title: "Enrich a lead",
    description: "Add title, company, phone, and account context to a lead before calling. Normally automatic; call to re-run or inspect.",
    inputSchema: enrichLeadShape,
  }, enrichLeadHandler);

  server.registerTool("scrub_lead", {
    title: "Run the compliance gate on a lead",
    description:
      "Hard compliance gate: checks call consent, valid phone, business hours, and suppression. Returns callable true/false. A lead is never called unless this passes.",
    inputSchema: scrubLeadShape,
  }, scrubLeadHandler);

  server.registerTool("call_lead", {
    title: "AI-call a hot lead",
    description:
      "Place the AI voice call to a hot lead (auto-runs the scrub gate first, refuses if blocked). On success, books the meeting on the calendar and writes the CRM automatically. Normally fired automatically on form-fill; call to manually trigger or retry.",
    inputSchema: callLeadShape,
  }, callLeadHandler);

  server.registerTool("submit_test_lead", {
    title: "Submit a test/simulated form-fill",
    description:
      "Simulate a lead form-fill and run the full Speed-to-Lead pipeline (enrich -> scrub -> AI call -> book). For demos and testing without a live ad. Requires a phone number.",
    inputSchema: submitTestLeadShape,
  }, submitTestLeadHandler);

  // ---- GTM: metrics + asset store ----
  server.registerTool("get_campaign_metrics", {
    title: "Get campaign funnel metrics",
    description:
      "Funnel metrics for a campaign: spend, leads, connect rate, book rate, cost per meeting, average call survival. Use to review performance and decide adjustments.",
    inputSchema: campaignMetricsShape,
  }, getCampaignMetricsHandler);

  server.registerTool("query_assets", {
    title: "Query the asset/event store",
    description: "Query the per-stage event log for a campaign (the learning store). Filter by stage. Use to analyze where leads drop off.",
    inputSchema: queryAssetsShape,
  }, queryAssetsHandler);

  server.registerTool("log_asset", {
    title: "Log a manual event",
    description: "Append a manual note/event to a campaign's asset store.",
    inputSchema: logAssetShape,
  }, logAssetHandler);

  // ---- Legacy demo tools (original managed-SDR concept) ----
  server.registerTool("book_appointments", {
    title: "[legacy] Book sales appointments",
    description:
      "Legacy demo tool from the original managed-SDR concept. Prefer define_campaign for the GTM Agent flow.",
    inputSchema: bookInputShape,
  }, bookAppointmentsHandler);

  server.registerTool("check_status", {
    title: "[legacy] Check appointment request status",
    description: "Legacy demo tool. Returns status of a book_appointments request.",
    inputSchema: statusInputShape,
  }, checkStatusHandler);

  server.registerTool("get_appointment_details", {
    title: "[legacy] Get appointment details",
    description: "Legacy demo tool. Returns full detail for a legacy appointment.",
    inputSchema: detailsInputShape,
  }, getAppointmentDetailsHandler);

  server.registerTool("add_appointment_to_calendar", {
    title: "[legacy] Add appointment to Google Calendar",
    description: "Legacy demo tool. Adds a legacy appointment to Google Calendar.",
    inputSchema: calendarInputShape,
  }, addToCalendarTool);
}
