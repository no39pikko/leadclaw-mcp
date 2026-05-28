import Stripe from "stripe";

type StripeInstance = InstanceType<typeof Stripe>;

let _stripe: StripeInstance | null = null;

export function getStripe(): StripeInstance {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not set. Add it to your environment or .env file."
    );
  }
  _stripe = new Stripe(key);
  return _stripe;
}
