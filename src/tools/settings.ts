import { z } from "zod/v3";
import { updateAccount } from "../db/store.js";
import { requireAuth, authErrorResponse } from "../auth.js";

export const configureInputShape = {
  company_name: z
    .string()
    .optional()
    .describe("Your company name, e.g. \"Acme Corp\"."),
  company_info: z
    .string()
    .optional()
    .describe("Brief description of your product or service. Used to brief SDRs."),
  icp: z
    .string()
    .optional()
    .describe("Your Ideal Customer Profile. Describe the type of company or person you want to reach."),
  industry: z
    .string()
    .optional()
    .describe("Default target industry, e.g. \"AI startups\", \"healthcare SaaS\". Used when booking if not specified."),
  target_role: z
    .string()
    .optional()
    .describe("Default target job title, e.g. \"CEO\", \"VP Sales\". Used when booking if not specified."),
};

export async function configureAccountHandler(args: {
  company_name?: string;
  company_info?: string;
  icp?: string;
  industry?: string;
  target_role?: string;
}) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const { api_key } = auth;

  const patch: Record<string, string> = {};
  if (args.company_name !== undefined) patch.company_name = args.company_name;
  if (args.company_info !== undefined) patch.company_info = args.company_info;
  if (args.icp !== undefined) patch.icp = args.icp;
  if (args.industry !== undefined) patch.industry = args.industry;
  if (args.target_role !== undefined) patch.target_role = args.target_role;

  const updated = updateAccount(api_key, patch);
  if (!updated) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: "Failed to update account settings." }],
    };
  }

  const lines = ["Account settings updated:"];
  if (args.company_name) lines.push(`  Company: ${args.company_name}`);
  if (args.company_info) lines.push(`  Product: ${args.company_info}`);
  if (args.icp) lines.push(`  ICP: ${args.icp}`);
  if (args.industry) lines.push(`  Default industry: ${args.industry}`);
  if (args.target_role) lines.push(`  Default role: ${args.target_role}`);
  lines.push("These will be used as defaults when booking appointments.");

  return {
    structuredContent: { success: true, updated: patch },
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}

// ---- get_account_info ----

export const accountInfoInputShape = {};

export async function getAccountInfoHandler(_args: Record<string, never>) {
  let auth;
  try {
    auth = requireAuth();
  } catch (err) {
    return authErrorResponse(err);
  }

  const { account } = auth;

  const lines = [
    `Account: ${account.company_name || "(not set)"}`,
    `Credits: ${account.credits}`,
    `Default industry: ${account.industry || "(not set)"}`,
    `Default role: ${account.target_role || "(not set)"}`,
    `ICP: ${account.icp || "(not set)"}`,
    `Product info: ${account.company_info || "(not set)"}`,
  ];

  return {
    structuredContent: {
      company_name: account.company_name,
      credits: account.credits,
      industry: account.industry,
      target_role: account.target_role,
      icp: account.icp,
      company_info: account.company_info,
    },
    content: [{ type: "text" as const, text: lines.join("\n") }],
  };
}
