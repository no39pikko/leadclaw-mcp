/**
 * Stripe Webhook handler
 *
 * Run this as a separate HTTP server:
 *   node dist/stripe/webhook.js
 *
 * Set up Stripe CLI forwarding for local dev:
 *   stripe listen --forward-to localhost:3001/webhook
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY
 *   STRIPE_WEBHOOK_SECRET   (from `stripe listen` output or Stripe dashboard)
 *   PORT                    (default: 3001)
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { getStripe } from "./client.js";
import { addCredits } from "../db/store.js";

const PORT = parseInt(process.env.PORT ?? "3001", 10);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

async function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  if (req.method !== "POST" || req.url !== "/webhook") {
    res.writeHead(404).end("Not found");
    return;
  }

  const stripe = getStripe();
  const body = await readBody(req);
  const sig = req.headers["stripe-signature"] as string;

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[webhook] signature verification failed:", msg);
    res.writeHead(400).end(`Webhook error: ${msg}`);
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: Record<string, string> };
    const api_key = session.metadata?.leadclaw_api_key;
    const credits = parseInt(session.metadata?.credits ?? "0", 10);

    if (api_key && credits > 0) {
      const updated = addCredits(api_key, credits);
      if (updated) {
        console.log(`[webhook] Added ${credits} credit(s) to ${api_key}. New balance: ${updated.credits}`);
      } else {
        console.error(`[webhook] Account not found: ${api_key}`);
      }
    }
  }

  res.writeHead(200).end("ok");
});

server.listen(PORT, () => {
  console.log(`[leadclaw-webhook] Listening on http://localhost:${PORT}/webhook`);
});
