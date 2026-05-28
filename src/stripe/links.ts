import { getStripe } from "./client.js";

export type PaymentLinkResult = {
  url: string;
  payment_link_id: string;
  amount_usd: number;
  credits: number;
  api_key: string;
};

const PRICE_PLANS: Record<string, { credits: number; amount_cents: number; label: string }> = {
  starter: { credits: 3, amount_cents: 30000, label: "LeadClaw Starter — 3 appointment credits" },
  growth:  { credits: 10, amount_cents: 90000, label: "LeadClaw Growth — 10 appointment credits" },
  pro:     { credits: 25, amount_cents: 200000, label: "LeadClaw Pro — 25 appointment credits" },
};

export async function createPaymentLink(args: {
  api_key: string;
  plan?: string;
  credits?: number;
}): Promise<PaymentLinkResult> {
  const stripe = getStripe();
  const plan = args.plan ?? "starter";
  const planDef = PRICE_PLANS[plan];

  if (!planDef) {
    throw new Error(`Unknown plan "${plan}". Available: ${Object.keys(PRICE_PLANS).join(", ")}`);
  }

  // Custom credit count overrides plan defaults
  const credits = args.credits ?? planDef.credits;
  const amount_cents = args.credits
    ? Math.round((planDef.amount_cents / planDef.credits) * args.credits)
    : planDef.amount_cents;

  // Create a one-time price
  const price = await stripe.prices.create({
    currency: "usd",
    unit_amount: amount_cents,
    product_data: {
      name: args.credits
        ? `LeadClaw — ${credits} appointment credit${credits > 1 ? "s" : ""}`
        : planDef.label,
    },
  });

  // Create a payment link with api_key in metadata for webhook use
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: {
      leadclaw_api_key: args.api_key,
      credits: String(credits),
    },
    after_completion: {
      type: "redirect",
      redirect: { url: "https://leadclaw.io/thank-you" },
    },
  });

  return {
    url: link.url,
    payment_link_id: link.id,
    amount_usd: amount_cents / 100,
    credits,
    api_key: args.api_key,
  };
}
