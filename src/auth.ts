import { getAccount, type Account } from "./db/store.js";

export type AuthResult = {
  api_key: string;
  account: Account;
};

export function requireAuth(): AuthResult {
  const api_key = process.env.LEADCLAW_API_KEY;
  if (!api_key) {
    throw new Error(
      "LEADCLAW_API_KEY is not set. Add it to your Claude Desktop MCP config under 'env'."
    );
  }
  const account = getAccount(api_key);
  if (!account) {
    throw new Error(
      `Invalid API key. Contact the LeadClaw administrator to get access.`
    );
  }
  return { api_key, account };
}

export function authErrorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: "text" as const, text: `[LeadClaw Auth Error] ${msg}` }],
  };
}
