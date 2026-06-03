/**
 * ApolloEnrichDriver — enrich a form-fill lead (title, company, phone, context)
 * before the call. Env: APOLLO_API_KEY.
 */
import type { EnrichDriver } from "./types.js";
import type { EnrichResult, Lead } from "../gtm/types.js";

export class ApolloEnrichDriver implements EnrichDriver {
  readonly name = "apollo";
  private key = process.env.APOLLO_API_KEY ?? "";

  async enrich(lead: Lead): Promise<EnrichResult> {
    const res = await fetch("https://api.apollo.io/v1/people/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": this.key,
      },
      body: JSON.stringify({
        email: lead.email || undefined,
        first_name: lead.name ? lead.name.split(" ")[0] : undefined,
        organization_name: lead.company || undefined,
      }),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Record<string, any>;
    const person = data.person ?? {};
    return {
      title: person.title ?? lead.title,
      company: person.organization?.name ?? lead.company,
      phone: person.phone_numbers?.[0]?.sanitized_number ?? lead.phone,
      account_context: person.organization?.short_description ?? undefined,
    };
  }
}
