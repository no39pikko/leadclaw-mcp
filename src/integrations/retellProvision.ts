/**
 * Auto-provision a Retell agent for a campaign from its Claude-generated call
 * script. This is the automation of the step we did by hand: create a Retell
 * LLM (response engine) + an agent that uses it, with a `booked_time` post-call
 * analysis field so verbal bookings are captured.
 *
 * Each campaign gets its own agent (so different customers / verticals get
 * different scripts). Falls back to a mock agent id when RETELL_API_KEY is unset.
 */
import { getAccount } from "../db/store.js";
import type { Campaign } from "../gtm/types.js";

const API = "https://api.retellai.com";

export function retellConfigured(): boolean {
  return !!process.env.RETELL_API_KEY;
}

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.RETELL_API_KEY}`,
    "Content-Type": "application/json",
  };
}

/** Compose the agent's general prompt + opening line from the campaign's call script. */
export function buildAgentConfig(campaign: Campaign): { general_prompt: string; begin_message: string } {
  const company = getAccount(campaign.account_id)?.company_name || "our team";
  const cs = campaign.call_script;

  const opener =
    cs?.opener ||
    `Hi {{lead_name}}, you just filled out our form about ${campaign.offer} — is now a good time for two quick questions?`;
  const disclosure = cs?.ai_disclosure || "This call is handled by an AI voice assistant.";
  const qualify = (cs?.qualification_questions ?? [
    "What prompted you to look into this now?",
    "Who else is involved in the decision?",
    "What's your rough timeline?",
  ])
    .map((q) => `   - ${q}`)
    .join("\n");
  const booking =
    cs?.booking_flow ||
    "If the lead is a fit, offer two specific time slots and confirm a calendar invite to their email.";

  const general_prompt = [
    `## Role`,
    `You are "Alex", a warm, concise AI voice assistant for ${company}. You are an AI assistant, and you say so. You are calling {{lead_name}}, a warm inbound lead who just submitted a form about: ${campaign.offer}. They opted in — this is NOT a cold call. Treat them like someone already interested but busy.`,
    ``,
    `## Goal`,
    `In under 3 minutes: confirm interest, ask 2-3 quick qualifying questions, and book a short meeting/consultation with a human specialist. If they are not a fit or not interested, thank them warmly and end.`,
    ``,
    `## Style`,
    `- Natural and brief. Short sentences. One question at a time, then listen.`,
    `- Sound like a friendly human, not a script. Mirror their pace and energy.`,
    `- Never pushy. If they are busy, offer to text a booking link instead.`,
    ``,
    `## Guardrails`,
    `- Disclose you are an AI assistant within your first two sentences. (${disclosure})`,
    `- Do not quote specific prices or make promises a specialist should make.`,
    `- Never ask for payment info, SSN, or sensitive personal data.`,
    `- If they say stop / not interested / take me off the list — thank them and end immediately.`,
    ``,
    `## Conversation flow`,
    `You have already opened the call with your greeting. Now continue:`,
    `1. Qualify, one question at a time:`,
    qualify,
    `2. Book the meeting: ${booking}`,
    `3. Close warmly. If they are not a fit, thank them for their time and end.`,
  ].join("\n");

  return { general_prompt, begin_message: opener };
}

export interface ProvisionResult {
  agent_id: string;
  live: boolean;
}

/**
 * Create a Retell agent for this campaign and return its agent_id.
 * Mock (no API key) returns a deterministic placeholder id.
 *
 * NOTE: API-created agents are usable immediately (version 0). If a future
 * Retell change requires an explicit publish, add a publish-agent call here.
 */
export async function provisionAgentForCampaign(campaign: Campaign): Promise<ProvisionResult> {
  const { general_prompt, begin_message } = buildAgentConfig(campaign);

  if (!retellConfigured()) {
    return { agent_id: `mockagent_${campaign.id}`, live: false };
  }

  // 1. Create the LLM (response engine).
  const llmRes = await fetch(`${API}/create-retell-llm`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      general_prompt,
      begin_message,
      start_speaker: "agent",
      model: process.env.RETELL_MODEL || "gpt-4.1",
    }),
  });
  const llm = (await llmRes.json()) as { llm_id?: string; error_message?: string };
  if (!llmRes.ok || !llm.llm_id) {
    throw new Error(`Retell create-retell-llm failed: ${llm.error_message ?? llmRes.status}`);
  }

  // 2. Create the agent referencing the LLM, with a booked_time extraction field.
  const agentRes = await fetch(`${API}/create-agent`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      response_engine: { type: "retell-llm", llm_id: llm.llm_id },
      voice_id: process.env.RETELL_VOICE_ID || "retell-Cimo",
      // Name carries the customer + campaign so agents are identifiable inside our
      // shared Retell account (the DB is the source of truth: campaign.account_id
      // <-> campaign.retell_agent_id).
      agent_name: `GTM | ${getAccount(campaign.account_id)?.company_name || campaign.account_id} | ${campaign.id}`,
      post_call_analysis_data: [
        {
          type: "string",
          name: "booked_time",
          description:
            "The date and time the lead agreed to for the meeting/consultation. Empty string if no meeting was booked.",
          examples: ["Wednesday at 2 PM", "2026-06-10 14:00", ""],
        },
      ],
    }),
  });
  const agent = (await agentRes.json()) as { agent_id?: string; error_message?: string };
  if (!agentRes.ok || !agent.agent_id) {
    throw new Error(`Retell create-agent failed: ${agent.error_message ?? agentRes.status}`);
  }

  return { agent_id: agent.agent_id, live: true };
}
