/**
 * RetellCallDriver — outbound AI voice calls via Retell.
 *
 * Env: RETELL_API_KEY, RETELL_AGENT_ID, RETELL_FROM_NUMBER.
 *
 * Calls complete asynchronously. Because the Speed-to-Lead pipeline runs in the
 * background (fired by the lead webhook, not blocking any user request), we
 * initiate the call and then poll get-call until it ends, then map the result.
 * The Retell agent should be configured with a custom analysis field that
 * records a booked meeting time (custom_analysis_data.booked_time).
 */
import type { CallDriver } from "./types.js";
import type { CallOutcome, CallResult, CallScript, Lead } from "../gtm/types.js";

const API = "https://api.retellai.com";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RetellCallDriver implements CallDriver {
  readonly name = "retell";
  private key = process.env.RETELL_API_KEY ?? "";
  private agentId = process.env.RETELL_AGENT_ID ?? "";
  private from = process.env.RETELL_FROM_NUMBER ?? "";

  async call(lead: Lead, script: CallScript | null, agentId?: string): Promise<CallResult> {
    if (!this.from) throw new Error("RETELL_FROM_NUMBER not set");

    const createRes = await fetch(`${API}/v2/create-phone-call`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from_number: this.from,
        to_number: lead.phone,
        override_agent_id: agentId || this.agentId || undefined,
        retell_llm_dynamic_variables: {
          lead_name: lead.name,
          company: lead.company,
          title: lead.title,
          opener: script?.opener ?? "",
          ai_disclosure: script?.ai_disclosure ?? "",
          qualification: (script?.qualification_questions ?? []).join(" | "),
          booking_flow: script?.booking_flow ?? "",
          context: lead.enrichment?.account_context ?? "",
        },
      }),
    });
    const created = (await createRes.json()) as { call_id?: string; error_message?: string };
    if (!createRes.ok || !created.call_id) {
      return {
        outcome: "failed",
        survived_seconds: 0,
        reached_pitch: false,
        hung_up_at_open: false,
        transcript: `Retell create-phone-call failed: ${created.error_message ?? createRes.status}`,
      };
    }

    const callId = created.call_id;
    for (let i = 0; i < 60; i++) {
      await sleep(5000); // up to ~5 min
      const getRes = await fetch(`${API}/v2/get-call/${callId}`, {
        headers: { Authorization: `Bearer ${this.key}` },
      });
      const c = (await getRes.json()) as Record<string, any>;
      if (c.call_status === "ended" || c.call_status === "error") {
        return this.mapResult(c);
      }
    }
    return {
      outcome: "failed",
      survived_seconds: 0,
      reached_pitch: false,
      hung_up_at_open: false,
      transcript: "Retell call did not complete within timeout.",
    };
  }

  private mapResult(c: Record<string, any>): CallResult {
    const durationMs = (c.end_timestamp ?? 0) - (c.start_timestamp ?? 0);
    const survived = Math.max(0, Math.round(durationMs / 1000));
    const transcript: string = c.transcript ?? "";
    const analysis = c.call_analysis ?? {};
    const inVoicemail = analysis.in_voicemail === true;
    // Booking is captured via a custom post-call analysis field on the Retell
    // agent named `booked_time` (configure it in the agent's analysis settings).
    const bookedTime: string | undefined = analysis.custom_analysis_data?.booked_time;

    const reached = !inVoicemail && survived > 12; // got past the opener with a human
    let outcome: CallOutcome;
    if (bookedTime) outcome = "booked";
    else if (inVoicemail) outcome = "voicemail";
    else if (!reached) outcome = survived === 0 ? "no_answer" : "hung_up";
    else outcome = "not_interested";

    return {
      outcome,
      survived_seconds: survived,
      reached_pitch: reached,
      hung_up_at_open: !inVoicemail && survived > 0 && survived <= 12,
      transcript,
      appointment: bookedTime ? { when: bookedTime } : undefined,
    };
  }
}
