#!/usr/bin/env node
/**
 * LeadClaw Admin CLI
 *
 * Usage:
 *   npm run admin create-account [--company "Acme Corp"] [--credits 3]
 *   npm run admin add-credits <api_key> <amount>
 *   npm run admin list-accounts
 *   npm run admin set-credits <api_key> <amount>
 */

import { createAccount, addCredits, listAccounts, updateAccount, getAccount } from "../db/store.js";

const [, , command, ...rest] = process.argv;

function printHelp() {
  console.log(`
LeadClaw Admin CLI

Commands:
  create-account [--company "Name"] [--credits N]   Create a new customer account
  add-credits <api_key> <amount>                     Add credits to an account
  set-credits <api_key> <amount>                     Set credits to exact amount
  list-accounts                                      List all accounts
  show-account <api_key>                             Show account details
`);
}

switch (command) {
  case "create-account": {
    const companyIdx = rest.indexOf("--company");
    const creditsIdx = rest.indexOf("--credits");
    const company_name = companyIdx >= 0 ? rest[companyIdx + 1] : "";
    const credits = creditsIdx >= 0 ? parseInt(rest[creditsIdx + 1], 10) : 0;

    const account = createAccount({ company_name, credits });
    console.log("\n✅ Account created:");
    console.log(`   API Key:  ${account.api_key}`);
    console.log(`   Company:  ${account.company_name || "(not set)"}`);
    console.log(`   Credits:  ${account.credits}`);
    console.log(`\nAdd to Claude Desktop config:`);
    console.log(`   "env": { "LEADCLAW_API_KEY": "${account.api_key}" }`);
    break;
  }

  case "add-credits": {
    const [api_key, amountStr] = rest;
    if (!api_key || !amountStr) {
      console.error("Usage: add-credits <api_key> <amount>");
      process.exit(1);
    }
    const amount = parseInt(amountStr, 10);
    if (isNaN(amount) || amount <= 0) {
      console.error("Amount must be a positive integer.");
      process.exit(1);
    }
    const updated = addCredits(api_key, amount);
    if (!updated) {
      console.error(`Account not found: ${api_key}`);
      process.exit(1);
    }
    console.log(`✅ Added ${amount} credit(s). New balance: ${updated.credits}`);
    break;
  }

  case "set-credits": {
    const [api_key, amountStr] = rest;
    if (!api_key || !amountStr) {
      console.error("Usage: set-credits <api_key> <amount>");
      process.exit(1);
    }
    const credits = parseInt(amountStr, 10);
    if (isNaN(credits) || credits < 0) {
      console.error("Amount must be a non-negative integer.");
      process.exit(1);
    }
    const updated = updateAccount(api_key, { credits });
    if (!updated) {
      console.error(`Account not found: ${api_key}`);
      process.exit(1);
    }
    console.log(`✅ Credits set to ${updated.credits}`);
    break;
  }

  case "list-accounts": {
    const accounts = listAccounts();
    if (accounts.length === 0) {
      console.log("No accounts found. Create one with: npm run admin create-account");
      break;
    }
    console.log(`\n${"API Key".padEnd(32)} ${"Company".padEnd(24)} Credits  Created`);
    console.log("-".repeat(80));
    for (const a of accounts) {
      const created = new Date(a.created_at).toLocaleDateString();
      console.log(
        `${a.api_key.padEnd(32)} ${(a.company_name || "-").padEnd(24)} ${String(a.credits).padEnd(8)} ${created}`
      );
    }
    break;
  }

  case "show-account": {
    const [api_key] = rest;
    if (!api_key) {
      console.error("Usage: show-account <api_key>");
      process.exit(1);
    }
    const account = getAccount(api_key);
    if (!account) {
      console.error(`Account not found: ${api_key}`);
      process.exit(1);
    }
    console.log(JSON.stringify(account, null, 2));
    break;
  }

  default:
    printHelp();
    break;
}
