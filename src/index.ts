#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bookInputShape, bookAppointmentsHandler } from "./tools/book.js";
import { statusInputShape, checkStatusHandler } from "./tools/status.js";
import { detailsInputShape, getAppointmentDetailsHandler } from "./tools/details.js";
import {
  configureInputShape,
  configureAccountHandler,
  accountInfoInputShape,
  getAccountInfoHandler,
} from "./tools/settings.js";

async function main() {
  const server = new McpServer({
    name: "leadclaw",
    version: "0.2.0",
  });

  // E-2: Account setup tools
  server.registerTool(
    "configure_account",
    {
      title: "Configure LeadClaw account settings",
      description:
        "Save your company info, ICP (Ideal Customer Profile), and default targeting preferences. " +
        "Call during first-time setup or when the user says 'my company is...', 'we target...', 'our ICP is...'. " +
        "Stored settings are used as defaults when booking appointments.",
      inputSchema: configureInputShape,
    },
    configureAccountHandler
  );

  server.registerTool(
    "get_account_info",
    {
      title: "Get account info and credit balance",
      description:
        "Show current account settings (company, ICP, defaults) and remaining appointment credits. " +
        "Use when the user asks about their balance, settings, or remaining credits.",
      inputSchema: accountInfoInputShape,
    },
    getAccountInfoHandler
  );

  server.registerTool(
    "book_appointments",
    {
      title: "Book sales appointments",
      description:
        "Request confirmed sales appointments delivered to your calendar. Human SDRs handle outbound; " +
        "you pay only per confirmed, BANT-qualified meeting. " +
        "Use when the user wants to book meetings, generate pipeline, get demos, or set up sales calls " +
        "— but does not want to do the outreach themselves. " +
        "Returns a request_id; poll check_status to see confirmed appointments populate.",
      inputSchema: bookInputShape,
    },
    bookAppointmentsHandler
  );

  server.registerTool(
    "check_status",
    {
      title: "Check appointment request status",
      description:
        "Check the progress of a LeadClaw appointment request. Returns current phase " +
        "(processing / matching / in_progress / completed) and any confirmed appointments so far. " +
        "Call this after book_appointments and re-poll as needed until status is completed.",
      inputSchema: statusInputShape,
    },
    checkStatusHandler
  );

  server.registerTool(
    "get_appointment_details",
    {
      title: "Get appointment details",
      description:
        "Pull full briefing on a specific confirmed appointment: contact info, company context, " +
        "full BANT breakdown, SDR call notes, and meeting link. " +
        "Use when the user wants to prep for a specific meeting.",
      inputSchema: detailsInputShape,
    },
    getAppointmentDetailsHandler
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  // stderr only — stdout is reserved for MCP traffic.
  console.error("[leadclaw] fatal:", err);
  process.exit(1);
});
