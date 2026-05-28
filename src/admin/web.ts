import { Router, type Request, type Response } from "express";
import {
  listAccounts,
  createAccount,
  getAccount,
  addCredits,
  updateAccount,
  refundCredits,
  consumeCredits,
  getAccountRequests,
  getAllRequests,
} from "../db/store.js";
import { createPaymentLink } from "../stripe/links.js";

export const adminRouter = Router();

// ---- Layout helpers ----

function layout(title: string, body: string, flash?: { type: "success" | "error"; msg: string }) {
  const flashHtml = flash
    ? `<div class="alert alert-${flash.type}">${flash.msg}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — LeadClaw Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}
    body{background:#f1f5f9;min-height:100vh}
    nav{background:#1e293b;padding:1rem 2rem;display:flex;align-items:center;gap:2rem}
    nav .logo{color:#60a5fa;font-weight:700;font-size:1.2rem;text-decoration:none}
    nav a{color:#94a3b8;text-decoration:none;font-size:0.9rem}
    nav a:hover{color:white}
    .container{max-width:1200px;margin:0 auto;padding:2rem}
    h1{font-size:1.75rem;color:#0f172a;margin-bottom:1.5rem}
    h2{font-size:1.25rem;color:#1e293b;margin-bottom:1rem}
    h3{font-size:1rem;color:#334155;margin-bottom:0.75rem}
    .card{background:white;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);padding:1.5rem;margin-bottom:1.5rem}
    table{width:100%;border-collapse:collapse;font-size:0.875rem}
    th{padding:0.75rem 1rem;text-align:left;background:#f8fafc;color:#475569;font-weight:600;border-bottom:2px solid #e2e8f0}
    td{padding:0.75rem 1rem;border-bottom:1px solid #f1f5f9;color:#374151}
    tr:hover td{background:#f8fafc}
    .btn{display:inline-flex;align-items:center;gap:0.4rem;padding:0.5rem 1rem;border-radius:6px;text-decoration:none;border:none;cursor:pointer;font-size:0.8rem;font-weight:500;transition:opacity .15s}
    .btn:hover{opacity:.85}
    .btn-primary{background:#4f46e5;color:white}
    .btn-green{background:#16a34a;color:white}
    .btn-amber{background:#d97706;color:white}
    .btn-red{background:#dc2626;color:white}
    .btn-gray{background:#6b7280;color:white}
    .btn-blue{background:#0284c7;color:white}
    .btn-sm{padding:0.3rem 0.65rem;font-size:0.75rem}
    .badge{display:inline-block;padding:0.2rem 0.6rem;border-radius:9999px;font-size:0.7rem;font-weight:600}
    .badge-green{background:#dcfce7;color:#166534}
    .badge-amber{background:#fef3c7;color:#92400e}
    .badge-red{background:#fee2e2;color:#991b1b}
    .badge-gray{background:#f3f4f6;color:#4b5563}
    .badge-blue{background:#dbeafe;color:#1e40af}
    .alert{padding:0.875rem 1.25rem;border-radius:8px;margin-bottom:1.5rem;font-size:0.9rem}
    .alert-success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
    .alert-error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:1rem}
    .form-group{margin-bottom:1rem}
    .form-group label{display:block;font-size:0.875rem;font-weight:500;color:#374151;margin-bottom:0.375rem}
    .form-group input,.form-group select,.form-group textarea{width:100%;padding:0.5rem 0.75rem;border:1px solid #d1d5db;border-radius:6px;font-size:0.875rem;outline:none;transition:border .15s}
    .form-group input:focus,.form-group select:focus,.form-group textarea:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.1)}
    .form-group textarea{height:80px;resize:vertical}
    .stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;margin-bottom:1.5rem}
    .stat{background:white;border-radius:10px;padding:1.25rem;box-shadow:0 1px 3px rgba(0,0,0,.1);text-align:center}
    .stat-val{font-size:2rem;font-weight:700;color:#1e293b}
    .stat-lbl{font-size:0.75rem;color:#64748b;margin-top:0.25rem;text-transform:uppercase;letter-spacing:.05em}
    .actions{display:flex;gap:0.4rem;flex-wrap:wrap}
    .key-box{font-family:monospace;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:0.75rem 1rem;word-break:break-all;font-size:0.85rem;color:#374151}
    .section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem}
    details summary{cursor:pointer;color:#4f46e5;font-size:0.875rem;user-select:none}
    details[open] summary{margin-bottom:0.75rem}
    .mini-form{display:flex;gap:0.5rem;align-items:center}
    .mini-form input{width:100px}
    hr{border:none;border-top:1px solid #e2e8f0;margin:1.25rem 0}
  </style>
</head>
<body>
  <nav>
    <a class="logo" href="/admin">⚡ LeadClaw Admin</a>
    <a href="/admin">Dashboard</a>
    <a href="/admin/accounts/new">+ New Account</a>
    <a href="/admin/requests">All Requests</a>
  </nav>
  <div class="container">
    ${flashHtml}
    ${body}
  </div>
</body>
</html>`;
}

function creditsHtml(a: ReturnType<typeof getAccount>) {
  if (!a) return "—";
  const reserved = a.credits_reserved;
  const available = a.credits;
  if (reserved > 0) {
    return `<span class="badge badge-green">${available} avail</span> <span class="badge badge-amber">${reserved} held</span>`;
  }
  return `<span class="badge badge-green">${available}</span>`;
}

function statusBadge(a: ReturnType<typeof getAccount>) {
  if (!a) return "—";
  if (a.activated_at) return `<span class="badge badge-green">Active</span>`;
  if (a.invited_at) return `<span class="badge badge-amber">Invited</span>`;
  return `<span class="badge badge-gray">Pending</span>`;
}

// ---- Dashboard ----

adminRouter.get("/", (_req: Request, res: Response) => {
  const accounts = listAccounts();
  const totalCredits = accounts.reduce((s, a) => s + a.credits + a.credits_reserved, 0);
  const activeCount = accounts.filter((a) => a.activated_at).length;
  const allReqs = getAllRequests();
  const reservedReqs = allReqs.filter((r) => r.credit_status === "reserved").length;

  const stats = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-val">${accounts.length}</div><div class="stat-lbl">Accounts</div></div>
      <div class="stat"><div class="stat-val">${activeCount}</div><div class="stat-lbl">Active</div></div>
      <div class="stat"><div class="stat-val">${totalCredits}</div><div class="stat-lbl">Total Credits</div></div>
      <div class="stat"><div class="stat-val">${allReqs.length}</div><div class="stat-lbl">Total Requests</div></div>
    </div>`;

  const rows = accounts
    .map(
      (a) => `
    <tr>
      <td><a href="/admin/accounts/${a.api_key}" style="color:#4f46e5;text-decoration:none;font-weight:500">${a.company_name || "<em>Unnamed</em>"}</a></td>
      <td>${a.email || "—"}</td>
      <td>${creditsHtml(a)}</td>
      <td>${statusBadge(a)}</td>
      <td style="font-family:monospace;font-size:.75rem;color:#64748b">${a.api_key}</td>
      <td><div class="actions">
        <a href="/admin/accounts/${a.api_key}" class="btn btn-gray btn-sm">View</a>
        <a href="/portal?key=${a.api_key}" target="_blank" class="btn btn-blue btn-sm">Portal</a>
      </div></td>
    </tr>`
    )
    .join("");

  const body = `
    <div class="section-header">
      <h1>Dashboard</h1>
      <a href="/admin/accounts/new" class="btn btn-primary">+ New Account</a>
    </div>
    ${stats}
    <div class="card">
      <h2>Accounts</h2>
      <table>
        <thead><tr><th>Company</th><th>Email</th><th>Credits</th><th>Status</th><th>API Key</th><th>Actions</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=6 style='text-align:center;color:#94a3b8;padding:2rem'>No accounts yet. <a href='/admin/accounts/new'>Create one →</a></td></tr>"}</tbody>
      </table>
    </div>`;

  res.send(layout("Dashboard", body));
});

// ---- Create Account ----

adminRouter.get("/accounts/new", (_req: Request, res: Response) => {
  const body = `
    <h1>New Account</h1>
    <div class="card">
      <form method="POST" action="/admin/accounts/new">
        <div class="form-grid">
          <div class="form-group">
            <label>Company Name *</label>
            <input name="company_name" placeholder="Acme Corp" required>
          </div>
          <div class="form-group">
            <label>Customer Email *</label>
            <input name="email" type="email" placeholder="john@acme.com" required>
          </div>
          <div class="form-group">
            <label>ICP (Ideal Customer Profile)</label>
            <input name="icp" placeholder="Series A+ B2B SaaS startups">
          </div>
          <div class="form-group">
            <label>Default Industry</label>
            <input name="industry" placeholder="B2B SaaS">
          </div>
          <div class="form-group">
            <label>Default Target Role</label>
            <input name="target_role" placeholder="CEO">
          </div>
          <div class="form-group">
            <label>Initial Credits</label>
            <input name="credits" type="number" min="0" value="3" placeholder="3">
          </div>
        </div>
        <div class="form-group">
          <label>Company / Product Description</label>
          <textarea name="company_info" placeholder="Brief description for SDR briefing..."></textarea>
        </div>
        <div style="display:flex;gap:1rem;margin-top:0.5rem">
          <button type="submit" class="btn btn-primary">Create Account</button>
          <a href="/admin" class="btn btn-gray">Cancel</a>
        </div>
      </form>
    </div>`;
  res.send(layout("New Account", body));
});

adminRouter.post("/accounts/new", (req: Request, res: Response) => {
  const { company_name, email, icp, industry, target_role, company_info, credits } = req.body as Record<string, string>;
  if (!company_name || !email) {
    res.send(layout("New Account", "<div class='alert alert-error'>Company name and email are required.</div><a href='/admin/accounts/new' class='btn btn-gray'>← Back</a>"));
    return;
  }
  const account = createAccount({
    company_name,
    email,
    icp: icp || "",
    industry: industry || "",
    target_role: target_role || "",
    company_info: company_info || "",
    credits: parseInt(credits || "0", 10) || 0,
  });
  res.redirect(`/admin/accounts/${account.api_key}?flash=created`);
});

// ---- Account Detail ----

adminRouter.get("/accounts/:key", (req: Request, res: Response) => {
  const account = getAccount(String(req.params["key"]));
  if (!account) { res.status(404).send(layout("Not Found", "<p>Account not found.</p>")); return; }

  const flash = req.query.flash;
  let flashHtml: { type: "success" | "error"; msg: string } | undefined;
  if (flash === "created") flashHtml = { type: "success", msg: `Account created! API key: <code>${account.api_key}</code>` };
  if (flash === "credits") flashHtml = { type: "success", msg: "Credits updated." };
  if (flash === "refunded") flashHtml = { type: "success", msg: "Credits refunded." };

  const requests = getAccountRequests(account.api_key);

  const portalUrl = `/portal?key=${account.api_key}`;

  const requestRows = requests
    .map((r) => {
      const statusBadgeHtml = r.credit_status === "reserved"
        ? `<span class="badge badge-amber">reserved</span>`
        : r.credit_status === "consumed"
        ? `<span class="badge badge-green">consumed</span>`
        : `<span class="badge badge-gray">refunded</span>`;

      const actions = r.credit_status === "reserved"
        ? `<div class="actions">
            <form method="POST" action="/admin/accounts/${account.api_key}/refund/${r.request_id}" style="display:inline">
              <button class="btn btn-amber btn-sm" type="submit">Refund</button>
            </form>
            <form method="POST" action="/admin/accounts/${account.api_key}/consume/${r.request_id}" style="display:inline">
              <button class="btn btn-green btn-sm" type="submit">Consume</button>
            </form>
          </div>`
        : "—";

      return `<tr>
        <td style="font-family:monospace;font-size:.75rem">${r.request_id}</td>
        <td>${r.params.location}</td>
        <td>${r.params.count} apts</td>
        <td>${r.credits_count} cr</td>
        <td>${statusBadgeHtml}</td>
        <td>${r.appointments.length} confirmed</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
        <td>${actions}</td>
      </tr>`;
    })
    .join("");

  const stripeSection = process.env.STRIPE_SECRET_KEY
    ? `<details>
        <summary>Generate Stripe Payment Link</summary>
        <form method="POST" action="/admin/accounts/${account.api_key}/payment-link" style="display:flex;gap:0.75rem;align-items:flex-end;flex-wrap:wrap;margin-top:0.75rem">
          <div class="form-group" style="margin:0">
            <label>Plan</label>
            <select name="plan">
              <option value="starter">Starter — $300 / 3 credits</option>
              <option value="growth">Growth — $900 / 10 credits</option>
              <option value="pro">Pro — $2000 / 25 credits</option>
            </select>
          </div>
          <button class="btn btn-blue" type="submit">Generate Link</button>
        </form>
      </details>`
    : `<p style="color:#94a3b8;font-size:.875rem">Set STRIPE_SECRET_KEY to enable payment link generation.</p>`;

  const body = `
    <div class="section-header">
      <h1>${account.company_name || "(Unnamed)"}</h1>
      <div class="actions">
        <a href="/admin" class="btn btn-gray">← Dashboard</a>
        <a href="${portalUrl}" target="_blank" class="btn btn-blue">Open Portal</a>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem">
      <div>
        <div class="card">
          <h2>Account Info</h2>
          <table>
            <tr><th width="140">Status</th><td>${statusBadge(account)}</td></tr>
            <tr><th>Email</th><td>${account.email || "—"}</td></tr>
            <tr><th>Company</th><td>${account.company_name || "—"}</td></tr>
            <tr><th>ICP</th><td>${account.icp || "—"}</td></tr>
            <tr><th>Industry</th><td>${account.industry || "—"}</td></tr>
            <tr><th>Target Role</th><td>${account.target_role || "—"}</td></tr>
            <tr><th>Created</th><td>${new Date(account.created_at).toLocaleDateString()}</td></tr>
            ${account.activated_at ? `<tr><th>Activated</th><td>${new Date(account.activated_at).toLocaleDateString()}</td></tr>` : ""}
          </table>
        </div>

        <div class="card">
          <h2>API Key</h2>
          <div class="key-box">${account.api_key}</div>
          <p style="margin-top:0.75rem;color:#64748b;font-size:.8rem">Share via portal or email. Customer adds this to Claude Desktop config.</p>
        </div>
      </div>

      <div>
        <div class="card">
          <h2>Credits</h2>
          <div style="display:flex;gap:1.5rem;margin-bottom:1.25rem">
            <div class="stat" style="flex:1">
              <div class="stat-val">${account.credits}</div>
              <div class="stat-lbl">Available</div>
            </div>
            <div class="stat" style="flex:1">
              <div class="stat-val">${account.credits_reserved}</div>
              <div class="stat-lbl">Reserved</div>
            </div>
          </div>
          <hr>
          <h3>Add Credits</h3>
          <form method="POST" action="/admin/accounts/${account.api_key}/credits" class="mini-form">
            <input type="hidden" name="action" value="add">
            <input name="amount" type="number" min="1" placeholder="3">
            <button class="btn btn-green" type="submit">Add</button>
          </form>
          <br>
          <h3>Set Credits</h3>
          <form method="POST" action="/admin/accounts/${account.api_key}/credits" class="mini-form">
            <input type="hidden" name="action" value="set">
            <input name="amount" type="number" min="0" placeholder="10">
            <button class="btn btn-amber" type="submit">Set</button>
          </form>
          <hr>
          ${stripeSection}
        </div>
      </div>
    </div>

    <div class="card">
      <h2>Booking Requests (${requests.length})</h2>
      ${requests.length > 0
        ? `<table>
            <thead><tr><th>Request ID</th><th>Location</th><th>Count</th><th>Credits</th><th>Status</th><th>Confirmed</th><th>Date</th><th>Actions</th></tr></thead>
            <tbody>${requestRows}</tbody>
          </table>`
        : `<p style="color:#94a3b8;text-align:center;padding:1rem">No booking requests yet.</p>`}
    </div>`;

  res.send(layout(account.company_name || "Account", body, flashHtml));
});

// ---- Credit Management ----

adminRouter.post("/accounts/:key/credits", (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  const { action, amount } = req.body as { action: string; amount: string };
  const n = parseInt(amount, 10);
  if (isNaN(n) || n < 0) { res.redirect(`/admin/accounts/${key}?flash=error`); return; }

  if (action === "add") {
    addCredits(key, n);
  } else if (action === "set") {
    const account = getAccount(key);
    if (account) updateAccount(key, { credits: n });
  }
  res.redirect(`/admin/accounts/${key}?flash=credits`);
});

// ---- Refund / Consume ----

adminRouter.post("/accounts/:key/refund/:req_id", (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  const reqId = String(req.params["req_id"]);
  refundCredits(key, reqId);
  res.redirect(`/admin/accounts/${key}?flash=refunded`);
});

adminRouter.post("/accounts/:key/consume/:req_id", (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  const reqId = String(req.params["req_id"]);
  consumeCredits(key, reqId);
  res.redirect(`/admin/accounts/${key}?flash=credits`);
});

// ---- Payment Link ----

adminRouter.post("/accounts/:key/payment-link", async (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  const { plan } = req.body as { plan: string };
  try {
    const result = await createPaymentLink({ api_key: key, plan });
    res.send(layout("Payment Link", `
      <h1>Payment Link Generated</h1>
      <div class="card">
        <table>
          <tr><th width="120">Amount</th><td>$${result.amount_usd}</td></tr>
          <tr><th>Credits</th><td>${result.credits}</td></tr>
          <tr><th>URL</th><td><a href="${result.url}" target="_blank">${result.url}</a></td></tr>
        </table>
        <hr>
        <p style="color:#64748b;font-size:.875rem">Send this link to the customer. When paid, add credits manually until webhook is configured.</p>
        <div style="margin-top:1rem">
          <a href="/admin/accounts/${key}" class="btn btn-gray">← Back to Account</a>
        </div>
      </div>`));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.send(layout("Error", `<div class="alert alert-error">Failed to generate payment link: ${msg}</div><a href="/admin/accounts/${key}" class="btn btn-gray">← Back</a>`));
  }
});

// ---- All Requests ----

adminRouter.get("/requests", (_req: Request, res: Response) => {
  const requests = getAllRequests();
  const accounts = listAccounts();
  const accountMap = new Map(accounts.map((a) => [a.api_key, a]));

  const rows = requests
    .map((r) => {
      const acct = accountMap.get(r.api_key);
      const statusBadgeHtml = r.credit_status === "reserved"
        ? `<span class="badge badge-amber">reserved</span>`
        : r.credit_status === "consumed"
        ? `<span class="badge badge-green">consumed</span>`
        : `<span class="badge badge-gray">refunded</span>`;
      return `<tr>
        <td style="font-family:monospace;font-size:.75rem">${r.request_id}</td>
        <td><a href="/admin/accounts/${r.api_key}" style="color:#4f46e5">${acct?.company_name || r.api_key}</a></td>
        <td>${r.params.location}</td>
        <td>${r.params.count}</td>
        <td>${r.credits_count} cr</td>
        <td>${statusBadgeHtml}</td>
        <td>${r.appointments.length} confirmed</td>
        <td>${new Date(r.created_at).toLocaleDateString()}</td>
      </tr>`;
    })
    .join("");

  const body = `
    <h1>All Booking Requests</h1>
    <div class="card">
      <table>
        <thead><tr><th>Request ID</th><th>Account</th><th>Location</th><th>Count</th><th>Credits</th><th>Status</th><th>Confirmed</th><th>Date</th></tr></thead>
        <tbody>${rows || "<tr><td colspan=8 style='text-align:center;color:#94a3b8;padding:2rem'>No requests yet.</td></tr>"}</tbody>
      </table>
    </div>`;

  res.send(layout("All Requests", body));
});
