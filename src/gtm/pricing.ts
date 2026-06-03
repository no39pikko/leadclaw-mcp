/**
 * PROVISIONAL credit rates for the GTM Agent pipeline.
 *
 * 1 credit == $1 USD (placeholder unit). These numbers are deliberately rough —
 * the plan is to dogfood real campaigns, measure true cost-per-lead /
 * cost-per-meeting, and replace these with real rates. See GTM_AGENT_SPEC.md §6.
 *
 * Credits are charged per pipeline stage as work is actually done. A lead that
 * fails the scrub gate is NOT charged for the call.
 */
export const RATES = {
  /** Estimated ad spend per form-fill (Meta B2B CPL, very rough). */
  ad_spend_per_lead: 30,
  /** Enrichment lookup (Apollo/PDL). */
  enrich: 1,
  /** Scrub (Twilio Lookup + checks). */
  scrub: 0,
  /** A dial that did not connect (no answer / voicemail). */
  call_attempt: 1,
  /** A connected call (Retell minutes + Twilio). */
  call_connected: 2,
} as const;

export type RateKey = keyof typeof RATES;
