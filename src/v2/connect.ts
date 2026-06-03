/**
 * Ad-account connect routes. `connect_ad_account` (MCP tool) hands the customer
 *   GET /connect/meta?api_key=...        -> redirects to Meta's consent dialog
 *   GET /connect/meta/callback           -> stores the token, shows a done page
 */
import { Router } from "express";
import { getAccount } from "../db/store.js";
import {
  buildAuthUrl,
  exchangeCode,
  fetchDefaults,
  metaConfigured,
  storeMetaConnection,
} from "../integrations/metaOAuth.js";

export const connectRouter = Router();

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{background:#1e293b;padding:2.5rem 3rem;border-radius:14px;max-width:480px;text-align:center}h2{margin:0 0 .75rem}p{color:#94a3b8;line-height:1.5}</style>
</head><body><div class="card">${body}</div></body></html>`;
}

connectRouter.get("/meta", (req, res) => {
  if (!metaConfigured()) {
    res.status(503).send(page("Not configured", "<h2>Meta connection isn't enabled yet</h2><p>The server admin needs to set META_APP_ID and META_APP_SECRET.</p>"));
    return;
  }
  const apiKey = String(req.query.api_key ?? "");
  if (!apiKey || !getAccount(apiKey)) {
    res.status(401).send(page("Invalid link", "<h2>Invalid or expired link</h2><p>Ask Claude for a fresh connect link.</p>"));
    return;
  }
  res.redirect(buildAuthUrl(apiKey));
});

connectRouter.get("/meta/callback", async (req, res) => {
  const code = String(req.query.code ?? "");
  const apiKey = String(req.query.state ?? "");
  const error = req.query.error_description ?? req.query.error;
  if (error) {
    res.status(400).send(page("Connection cancelled", `<h2>Connection cancelled</h2><p>${String(error)}</p>`));
    return;
  }
  if (!code || !apiKey || !getAccount(apiKey)) {
    res.status(400).send(page("Bad request", "<h2>Missing or invalid parameters</h2>"));
    return;
  }
  try {
    const accessToken = await exchangeCode(code);
    const defaults = await fetchDefaults(accessToken);
    storeMetaConnection(apiKey, { access_token: accessToken, ...defaults, obtained_at: Date.now() });
    res.send(page("Connected", "<h2>✅ Meta account connected</h2><p>You can close this tab and go back to Claude. Your campaigns will run on your ad account.</p>"));
  } catch (err) {
    res.status(500).send(page("Connection failed", `<h2>Connection failed</h2><p>${err instanceof Error ? err.message : String(err)}</p>`));
  }
});
