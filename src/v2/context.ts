/**
 * AsyncLocalStorage context for per-request API key in v2 HTTP mode.
 * In stdio (v1) mode, the context is unused and requireAuth() falls back to process.env.LEADCLAW_API_KEY.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export const apiKeyContext = new AsyncLocalStorage<string>();
