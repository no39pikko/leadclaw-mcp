import { google } from "googleapis";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const TOKEN_PATH = resolve(DATA_DIR, "google-token.json");
const REDIRECT_URI = "http://localhost:3002/oauth2callback";
const SCOPES = ["https://www.googleapis.com/auth/calendar.events"];

export function hasCredentials(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isAuthorized(): boolean {
  return existsSync(TOKEN_PATH);
}

export function getOAuth2Client() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Google Calendar credentials not configured.\n" +
      "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env,\n" +
      "then run: npm run admin google-auth"
    );
  }

  const client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  if (existsSync(TOKEN_PATH)) {
    const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
    client.setCredentials(token);
    // Auto-save refreshed tokens
    client.on("tokens", (tokens) => {
      const current = existsSync(TOKEN_PATH)
        ? JSON.parse(readFileSync(TOKEN_PATH, "utf-8"))
        : {};
      if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(TOKEN_PATH, JSON.stringify({ ...current, ...tokens }, null, 2));
    });
  }

  return client;
}

export function getAuthUrl(): string {
  const client = getOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent",
  });
}

export async function exchangeCode(code: string): Promise<void> {
  const client = getOAuth2Client();
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}
