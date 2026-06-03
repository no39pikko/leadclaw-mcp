/**
 * NotionCrmDriver — writes the lead/result/appointment to a Notion database
 * (the human-readable CRM). Env: NOTION_API_KEY, NOTION_LEADS_DB_ID.
 *
 * The Notion database must have these properties:
 *   Name (title), Company (rich_text), Phone (phone_number),
 *   Email (email), Outcome (rich_text), Meeting (date).
 */
import type { CrmDriver, CrmRecordInput } from "./types.js";
import type { CrmResult } from "../gtm/types.js";

export class NotionCrmDriver implements CrmDriver {
  readonly name = "notion";
  private key = process.env.NOTION_API_KEY ?? "";
  private dbId = process.env.NOTION_LEADS_DB_ID ?? "";

  async upsert(record: CrmRecordInput): Promise<CrmResult> {
    const { lead, appointment, callOutcome } = record;
    const props: Record<string, unknown> = {
      Name: { title: [{ text: { content: lead.name || lead.email || lead.id } }] },
      Company: { rich_text: [{ text: { content: lead.company || "" } }] },
      Phone: { phone_number: lead.phone || null },
      Email: { email: lead.email || null },
      Outcome: { rich_text: [{ text: { content: callOutcome || lead.status } }] },
    };
    if (appointment?.when) props.Meeting = { date: { start: appointment.when } };

    const res = await fetch("https://api.notion.com/v1/pages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.key}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({ parent: { database_id: this.dbId }, properties: props }),
    });
    const data = (await res.json()) as { id?: string; message?: string };
    if (!res.ok || !data.id) {
      throw new Error(`Notion upsert failed: ${data.message ?? res.status}`);
    }
    return { ref: data.id };
  }
}
