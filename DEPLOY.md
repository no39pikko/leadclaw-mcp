# Deploy — your own server

The v2 server (`npm run v2`) is one long-running Node process. It must be:
- **publicly reachable over HTTPS** (Meta OAuth, lead webhooks, and Retell call
  webhooks all require a public https URL), and
- **always on** (the Speed-to-Lead engine fires on inbound webhooks 24/7).

ngrok is only a throwaway tunnel for local testing — for a real service, deploy
on a box you control.

## What must be public

All under your domain (e.g. `https://gtm.yourdomain.com`), set as `PUBLIC_URL`:

| Path | Purpose |
|---|---|
| `/mcp` | MCP endpoint for Claude (Bearer auth) |
| `/lp/:campaignId` | Hosted landing page + lead form |
| `/webhook/lead/:campaignId` | Lead form-fill ingestion (also Meta leadgen webhook) |
| `/connect/meta` + `/connect/meta/callback` | Customer Meta OAuth |
| `/health` | Health + which drivers are live |

## Option A — plain Linux VPS (Node + pm2 + Caddy for HTTPS)

```bash
# on the server (Ubuntu/Debian), Node 20+
git clone <repo> && cd leadclaw-mcp
npm ci && npm run build
cp .env.example .env && nano .env        # fill PUBLIC_URL + the driver keys you have

# keep it running
npm i -g pm2
PORT=4000 pm2 start "node --env-file=.env dist/v2/server.js" --name gtm
pm2 save && pm2 startup                   # restart on reboot
```

HTTPS in front (Caddy auto-provisions a Let's Encrypt cert):

```
# /etc/caddy/Caddyfile
gtm.yourdomain.com {
    reverse_proxy localhost:4000
}
```
Point an A record for `gtm.yourdomain.com` at the server IP, then `systemctl reload caddy`. Set `PUBLIC_URL=https://gtm.yourdomain.com` in `.env`.

## Option B — Docker

```bash
docker build -t gtm-agent .
docker run -d --name gtm -p 4000:4000 --env-file .env -v gtm-data:/app/data gtm-agent
```
Put a reverse proxy (Caddy/nginx/Traefik) in front for HTTPS, or run behind a platform that terminates TLS.

## Option C — a PaaS (Railway / Render / Fly.io)

Point it at the repo; build `npm run build`, start `node dist/v2/server.js`, set env vars in the dashboard, add a persistent volume mounted at `/app/data` (so the SQLite DB survives deploys). These give you HTTPS automatically.

## Env you actually need to go live (minimum)

- `PUBLIC_URL` — your https domain
- Calling (shared infra you own): `RETELL_API_KEY`, `RETELL_AGENT_ID`, `RETELL_FROM_NUMBER`
- Calendar: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (then `npm run admin google-auth`)
- Leave Meta unset to run leads via the hosted `/lp` form; add Meta later for native Lead Ads.

Create a customer/account + API key: `npm run admin create-account -- --company "You" --credits 1000`.
