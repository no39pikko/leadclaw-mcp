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
import { t, getLang, type Lang } from "../v2/i18n.js";

export const adminRouter = Router();

// ---- Shared CSS ----

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#f8fafc;color:#0f172a;min-height:100vh}
  a{color:inherit;text-decoration:none}

  /* Navbar */
  .nav{background:#0f172a;height:56px;display:flex;align-items:center;padding:0 24px;gap:0;position:sticky;top:0;z-index:100;box-shadow:0 1px 0 rgba(255,255,255,.06)}
  .nav-logo{color:#fff;font-weight:700;font-size:1.05rem;letter-spacing:-.01em;display:flex;align-items:center;gap:6px;margin-right:24px}
  .nav-logo span{color:#818cf8}
  .nav-links{display:flex;align-items:center;gap:2px;flex:1}
  .nav-link{color:#94a3b8;font-size:.82rem;font-weight:500;padding:6px 10px;border-radius:6px;transition:all .15s;white-space:nowrap}
  .nav-link:hover{color:#fff;background:rgba(255,255,255,.06)}
  .nav-link.active{color:#fff;background:rgba(255,255,255,.1)}
  .nav-right{display:flex;align-items:center;gap:8px;margin-left:auto}
  .lang-switcher{display:flex;border:1px solid rgba(255,255,255,.12);border-radius:6px;overflow:hidden}
  .lang-btn{color:#94a3b8;font-size:.75rem;font-weight:600;padding:4px 10px;transition:all .15s;cursor:pointer}
  .lang-btn:hover{color:#fff;background:rgba(255,255,255,.08)}
  .lang-btn.on{background:#4f46e5;color:#fff}

  /* Layout */
  .container{max-width:1200px;margin:0 auto;padding:28px 24px}
  .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px}
  .page-title{font-size:1.5rem;font-weight:700;color:#0f172a}

  /* Cards */
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:16px}
  .card-title{font-size:.95rem;font-weight:600;color:#1e293b;margin-bottom:16px}

  /* Stats */
  .stat-row{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
  .stat{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px}
  .stat-val{font-size:2rem;font-weight:700;color:#0f172a;line-height:1}
  .stat-lbl{font-size:.72rem;font-weight:600;color:#94a3b8;margin-top:6px;text-transform:uppercase;letter-spacing:.06em}

  /* Table */
  .tbl{width:100%;border-collapse:collapse;font-size:.82rem}
  .tbl th{padding:10px 12px;text-align:left;color:#64748b;font-weight:600;font-size:.72rem;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid #f1f5f9;background:#f8fafc}
  .tbl td{padding:11px 12px;border-bottom:1px solid #f8fafc;vertical-align:middle}
  .tbl tr:last-child td{border-bottom:none}
  .tbl tr:hover td{background:#fafbff}
  .tbl-link{color:#4f46e5;font-weight:600;font-size:.85rem}
  .tbl-link:hover{text-decoration:underline}
  .tbl-mono{font-family:"Roboto Mono","SF Mono",monospace;font-size:.72rem;color:#64748b}

  /* Badges */
  .badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:20px;font-size:.7rem;font-weight:600;gap:4px}
  .badge::before{content:"";width:5px;height:5px;border-radius:50%;display:inline-block}
  .b-green{background:#f0fdf4;color:#15803d}.b-green::before{background:#22c55e}
  .b-amber{background:#fffbeb;color:#b45309}.b-amber::before{background:#f59e0b}
  .b-gray{background:#f8fafc;color:#64748b}.b-gray::before{background:#94a3b8}
  .b-blue{background:#eff6ff;color:#1d4ed8}.b-blue::before{background:#3b82f6}
  .b-credit{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}

  /* Buttons */
  .btn{display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:.8rem;font-weight:600;border:none;cursor:pointer;transition:all .15s;white-space:nowrap}
  .btn:hover{opacity:.85;transform:translateY(-1px)}
  .btn:active{transform:translateY(0)}
  .btn-primary{background:#4f46e5;color:#fff}
  .btn-green{background:#16a34a;color:#fff}
  .btn-amber{background:#d97706;color:#fff}
  .btn-red{background:#dc2626;color:#fff}
  .btn-gray{background:#f1f5f9;color:#374151;border:1px solid #e2e8f0}
  .btn-gray:hover{background:#e2e8f0}
  .btn-blue{background:#0284c7;color:#fff}
  .btn-sm{padding:4px 10px;font-size:.75rem}
  .btn-row{display:flex;gap:6px;flex-wrap:wrap}

  /* Forms */
  .form-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
  .fg{margin-bottom:14px}
  .fg label{display:block;font-size:.78rem;font-weight:600;color:#374151;margin-bottom:5px}
  .fg input,.fg select,.fg textarea{width:100%;padding:8px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;color:#0f172a;outline:none;transition:border .15s,box-shadow .15s;background:#fff}
  .fg input:focus,.fg select:focus,.fg textarea:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.1)}
  .fg textarea{height:72px;resize:vertical}
  .mini-row{display:flex;gap:8px;align-items:center}
  .mini-row input{width:100px;padding:7px 10px;border:1px solid #e2e8f0;border-radius:8px;font-size:.85rem;outline:none}
  .mini-row input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.1)}

  /* Key box */
  .key-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-family:"Roboto Mono","SF Mono",monospace;font-size:.78rem;word-break:break-all;color:#374151;user-select:all}

  /* Alerts */
  .alert{padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:.82rem;font-weight:500}
  .alert-ok{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}
  .alert-err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}

  /* Details table */
  .dtbl{width:100%;font-size:.83rem}
  .dtbl tr th{padding:9px 0;width:140px;color:#64748b;font-weight:500;vertical-align:top}
  .dtbl tr td{padding:9px 0;color:#0f172a;font-weight:500;border-bottom:1px solid #f1f5f9}
  .dtbl tr:last-child td{border-bottom:none}

  /* 2-col layout */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:760px){.two-col,.form-grid,.stat-row{grid-template-columns:1fr}}

  /* Divider */
  hr{border:none;border-top:1px solid #f1f5f9;margin:16px 0}

  /* Details expand */
  details summary{cursor:pointer;color:#4f46e5;font-size:.82rem;font-weight:600;user-select:none;padding:8px 0}
  details[open] summary{margin-bottom:8px}
  details .inner{padding-top:4px}

  /* Empty state */
  .empty{text-align:center;color:#94a3b8;padding:32px 0;font-size:.85rem}
`;

// ---- Helpers ----

function getLangFromReq(req: Request): Lang {
  return getLang(req.headers.cookie);
}

function langSwitcher(lang: Lang, currentPath: string): string {
  return `
    <div class="lang-switcher">
      <a href="/set-lang?lang=ja&redirect=${encodeURIComponent(currentPath)}" class="lang-btn${lang === "ja" ? " on" : ""}">JP</a>
      <a href="/set-lang?lang=en&redirect=${encodeURIComponent(currentPath)}" class="lang-btn${lang === "en" ? " on" : ""}">EN</a>
    </div>`;
}

function nav(lang: Lang, active: "dashboard" | "requests" | "new", req: Request): string {
  const path = req.originalUrl;
  return `
    <nav class="nav">
      <div class="nav-logo"><span>⚡</span> LeadClaw</div>
      <div class="nav-links">
        <a href="/admin" class="nav-link${active === "dashboard" ? " active" : ""}">${t("dashboard", lang)}</a>
        <a href="/admin/accounts/new" class="nav-link${active === "new" ? " active" : ""}">${t("newAccount", lang)}</a>
        <a href="/admin/requests" class="nav-link${active === "requests" ? " active" : ""}">${t("allRequests", lang)}</a>
      </div>
      <div class="nav-right">
        ${langSwitcher(lang, path)}
      </div>
    </nav>`;
}

function layout(title: string, body: string, navHtml: string, flash?: { type: "ok" | "err"; msg: string }): string {
  const flashHtml = flash
    ? `<div class="alert alert-${flash.type}">${flash.msg}</div>`
    : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — LeadClaw</title>
  <style>${CSS}</style>
</head>
<body>
  ${navHtml}
  <div class="container">
    ${flashHtml}
    ${body}
  </div>
</body>
</html>`;
}

function creditBadge(a: ReturnType<typeof getAccount>, lang: Lang): string {
  if (!a) return "—";
  if (a.credits_reserved > 0) {
    return `<span class="b-credit">
      <span class="badge b-green">${a.credits} ${t("available", lang)}</span>
      <span class="badge b-amber">${a.credits_reserved} ${t("reserved", lang)}</span>
    </span>`;
  }
  return `<span class="badge b-green">${a.credits}</span>`;
}

function statusBadge(a: ReturnType<typeof getAccount>, lang: Lang): string {
  if (!a) return "—";
  if (a.activated_at) return `<span class="badge b-green">${t("active", lang)}</span>`;
  if (a.invited_at)   return `<span class="badge b-amber">${t("invited", lang)}</span>`;
  return `<span class="badge b-gray">${t("pending", lang)}</span>`;
}

function creditStatusBadge(status: string, lang: Lang): string {
  if (status === "reserved") return `<span class="badge b-amber">${t("reserved", lang)}</span>`;
  if (status === "consumed") return `<span class="badge b-green">${t("consume", lang)}</span>`;
  return `<span class="badge b-gray">${t("refund", lang)}</span>`;
}

// ---- Dashboard ----

adminRouter.get("/", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const accounts = listAccounts();
  const allReqs = getAllRequests();
  const totalCredits = accounts.reduce((s, a) => s + a.credits + a.credits_reserved, 0);
  const activeCount = accounts.filter((a) => a.activated_at).length;

  const stats = `
    <div class="stat-row">
      <div class="stat"><div class="stat-val">${accounts.length}</div><div class="stat-lbl">${t("totalAccounts", lang)}</div></div>
      <div class="stat"><div class="stat-val">${activeCount}</div><div class="stat-lbl">${t("activeAccounts", lang)}</div></div>
      <div class="stat"><div class="stat-val">${totalCredits}</div><div class="stat-lbl">${t("totalCredits", lang)}</div></div>
      <div class="stat"><div class="stat-val">${allReqs.length}</div><div class="stat-lbl">${t("totalRequests", lang)}</div></div>
    </div>`;

  const rows = accounts.map((a) => `
    <tr>
      <td><a href="/admin/accounts/${a.api_key}" class="tbl-link">${a.company_name || `<span style="color:#94a3b8">—</span>`}</a></td>
      <td style="color:#64748b">${a.email || "—"}</td>
      <td>${creditBadge(a, lang)}</td>
      <td>${statusBadge(a, lang)}</td>
      <td class="tbl-mono">${a.api_key}</td>
      <td>
        <div class="btn-row">
          <a href="/admin/accounts/${a.api_key}" class="btn btn-gray btn-sm">${t("view", lang)}</a>
          <a href="/portal?key=${a.api_key}" target="_blank" class="btn btn-blue btn-sm">${t("portal", lang)}</a>
        </div>
      </td>
    </tr>`).join("");

  const body = `
    <div class="page-header">
      <h1 class="page-title">${t("dashboard", lang)}</h1>
      <a href="/admin/accounts/new" class="btn btn-primary">${t("newAccount", lang)}</a>
    </div>
    ${stats}
    <div class="card">
      <div class="card-title">${t("accounts", lang)}</div>
      <table class="tbl">
        <thead><tr>
          <th>${t("company", lang)}</th>
          <th>${t("email", lang)}</th>
          <th>${t("credits", lang)}</th>
          <th>${t("status", lang)}</th>
          <th>${t("apiKey", lang)}</th>
          <th>${t("actions", lang)}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="6" class="empty">${t("accounts", lang)} — <a href="/admin/accounts/new" style="color:#4f46e5">${t("newAccount", lang)}</a></td></tr>`}</tbody>
      </table>
    </div>`;

  res.send(layout(t("dashboard", lang), body, nav(lang, "dashboard", req)));
});

// ---- New Account ----

adminRouter.get("/accounts/new", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const body = `
    <div class="page-header">
      <h1 class="page-title">${t("createAccount", lang)}</h1>
      <a href="/admin" class="btn btn-gray">${t("dashboard", lang)}</a>
    </div>
    <div class="card">
      <form method="POST" action="/admin/accounts/new">
        <div class="form-grid">
          <div class="fg"><label>${t("companyName", lang)}</label><input name="company_name" placeholder="Acme Corp" required></div>
          <div class="fg"><label>${t("customerEmail", lang)}</label><input name="email" type="email" placeholder="john@acme.com" required></div>
          <div class="fg"><label>${t("icp", lang)}</label><input name="icp" placeholder="Series A+ B2B SaaS startups"></div>
          <div class="fg"><label>${t("industry", lang)}</label><input name="industry" placeholder="B2B SaaS"></div>
          <div class="fg"><label>${t("targetRole", lang)}</label><input name="target_role" placeholder="CEO"></div>
          <div class="fg"><label>${t("initialCredits", lang)}</label><input name="credits" type="number" min="0" value="3"></div>
        </div>
        <div class="fg"><label>${t("companyInfo", lang)}</label><textarea name="company_info" placeholder="SDRへのブリーフィング用の説明文..."></textarea></div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn-primary" type="submit">${t("createAccount", lang)}</button>
          <a href="/admin" class="btn btn-gray">${t("cancel", lang)}</a>
        </div>
      </form>
    </div>`;
  res.send(layout(t("createAccount", lang), body, nav(lang, "new", req)));
});

adminRouter.post("/accounts/new", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const { company_name, email, icp, industry, target_role, company_info, credits } = req.body as Record<string, string>;
  if (!company_name || !email) {
    res.send(layout(t("createAccount", lang),
      `<div class="alert alert-err">${t("requiredFields", lang)}</div><a href="/admin/accounts/new" class="btn btn-gray">${t("cancel", lang)}</a>`,
      nav(lang, "new", req)));
    return;
  }
  const account = createAccount({
    company_name, email,
    icp: icp || "", industry: industry || "",
    target_role: target_role || "", company_info: company_info || "",
    credits: parseInt(credits || "0", 10) || 0,
  });
  res.redirect(`/admin/accounts/${account.api_key}?flash=created`);
});

// ---- Account Detail ----

adminRouter.get("/accounts/:key", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const account = getAccount(String(req.params["key"]));
  if (!account) {
    res.status(404).send(layout("404", "<p style='padding:2rem;color:#94a3b8'>Account not found.</p>", nav(lang, "dashboard", req)));
    return;
  }

  let flash: { type: "ok" | "err"; msg: string } | undefined;
  if (req.query.flash === "created") flash = { type: "ok", msg: `${t("accountCreated", lang)} <code style='font-family:monospace'>${account.api_key}</code>` };
  if (req.query.flash === "credits")  flash = { type: "ok", msg: t("creditsUpdated", lang) };
  if (req.query.flash === "refunded") flash = { type: "ok", msg: t("creditsRefunded", lang) };

  const requests = getAccountRequests(account.api_key);

  const stripeSection = process.env.STRIPE_SECRET_KEY
    ? `<details><summary>${t("paymentLink", lang)}</summary>
        <div class="inner">
          <form method="POST" action="/admin/accounts/${account.api_key}/payment-link" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap">
            <div class="fg" style="margin:0;flex:1;min-width:180px">
              <label>${t("plan", lang)}</label>
              <select name="plan">
                <option value="starter">Starter — $300 / 3 credits</option>
                <option value="growth">Growth — $900 / 10 credits</option>
                <option value="pro">Pro — $2000 / 25 credits</option>
              </select>
            </div>
            <button class="btn btn-blue" type="submit">${t("paymentLink", lang)}</button>
          </form>
        </div>
      </details>`
    : `<p style="color:#94a3b8;font-size:.78rem">${t("noStripeKey", lang)}</p>`;

  const reqRows = requests.map((r) => {
    const actions = r.credit_status === "reserved"
      ? `<div class="btn-row">
          <form method="POST" action="/admin/accounts/${account.api_key}/refund/${r.request_id}" style="display:contents">
            <button class="btn btn-amber btn-sm" type="submit">${t("refund", lang)}</button>
          </form>
          <form method="POST" action="/admin/accounts/${account.api_key}/consume/${r.request_id}" style="display:contents">
            <button class="btn btn-green btn-sm" type="submit">${t("consume", lang)}</button>
          </form>
        </div>`
      : "—";
    return `<tr>
      <td class="tbl-mono">${r.request_id}</td>
      <td>${r.params.location}</td>
      <td>${r.params.count}</td>
      <td>${r.credits_count}</td>
      <td>${creditStatusBadge(r.credit_status, lang)}</td>
      <td>${r.appointments.length}</td>
      <td style="color:#64748b">${new Date(r.created_at).toLocaleDateString()}</td>
      <td>${actions}</td>
    </tr>`;
  }).join("");

  const body = `
    <div class="page-header">
      <h1 class="page-title">${account.company_name || "(Unnamed)"}</h1>
      <div class="btn-row">
        <a href="/admin" class="btn btn-gray">${t("dashboard", lang)}</a>
        <a href="/portal?key=${account.api_key}" target="_blank" class="btn btn-blue">${t("portal", lang)}</a>
      </div>
    </div>

    <div class="two-col">
      <div>
        <div class="card">
          <div class="card-title">${t("accountInfo", lang)}</div>
          <table class="dtbl">
            <tr><th>${t("status", lang)}</th><td>${statusBadge(account, lang)}</td></tr>
            <tr><th>${t("email", lang)}</th><td>${account.email || "—"}</td></tr>
            <tr><th>${t("company", lang)}</th><td>${account.company_name || "—"}</td></tr>
            <tr><th>ICP</th><td>${account.icp || "—"}</td></tr>
            <tr><th>${t("industry", lang)}</th><td>${account.industry || "—"}</td></tr>
            <tr><th>${t("targetRole", lang)}</th><td>${account.target_role || "—"}</td></tr>
            <tr><th>${t("created", lang)}</th><td>${new Date(account.created_at).toLocaleDateString()}</td></tr>
            ${account.activated_at ? `<tr><th>${t("activated", lang)}</th><td>${new Date(account.activated_at).toLocaleDateString()}</td></tr>` : ""}
          </table>
        </div>
        <div class="card">
          <div class="card-title">${t("apiKey", lang)}</div>
          <div class="key-box">${account.api_key}</div>
          <p style="margin-top:8px;color:#94a3b8;font-size:.75rem">${t("shareViaPortal", lang)}</p>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">${t("credits", lang)}</div>
          <div style="display:flex;gap:12px;margin-bottom:16px">
            <div class="stat" style="flex:1;padding:16px 20px">
              <div class="stat-val" style="font-size:1.8rem">${account.credits}</div>
              <div class="stat-lbl">${t("available", lang)}</div>
            </div>
            <div class="stat" style="flex:1;padding:16px 20px">
              <div class="stat-val" style="font-size:1.8rem;color:#d97706">${account.credits_reserved}</div>
              <div class="stat-lbl">${t("reserved", lang)}</div>
            </div>
          </div>
          <hr>
          <p style="font-size:.78rem;font-weight:600;color:#374151;margin-bottom:8px">${t("addCredits", lang)}</p>
          <form method="POST" action="/admin/accounts/${account.api_key}/credits" class="mini-row" style="margin-bottom:12px">
            <input type="hidden" name="action" value="add">
            <input name="amount" type="number" min="1" placeholder="3">
            <button class="btn btn-green" type="submit">${t("addCredits", lang)}</button>
          </form>
          <p style="font-size:.78rem;font-weight:600;color:#374151;margin-bottom:8px">${t("setCredits", lang)}</p>
          <form method="POST" action="/admin/accounts/${account.api_key}/credits" class="mini-row">
            <input type="hidden" name="action" value="set">
            <input name="amount" type="number" min="0" placeholder="10">
            <button class="btn btn-amber" type="submit">${t("setCredits", lang)}</button>
          </form>
          <hr>
          ${stripeSection}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title" style="margin-bottom:12px">Booking Requests (${requests.length})</div>
      ${requests.length > 0
        ? `<table class="tbl">
            <thead><tr>
              <th>${t("requestId", lang)}</th>
              <th>${t("location", lang)}</th>
              <th>${t("count", lang)}</th>
              <th>${t("credits", lang)}</th>
              <th>${t("creditStatus", lang)}</th>
              <th>${t("confirmed", lang)}</th>
              <th>${t("date", lang)}</th>
              <th>${t("actions", lang)}</th>
            </tr></thead>
            <tbody>${reqRows}</tbody>
          </table>`
        : `<div class="empty">${t("noRequests", lang)}</div>`}
    </div>`;

  res.send(layout(account.company_name || "Account", body, nav(lang, "dashboard", req), flash));
});

// ---- Credit Management ----

adminRouter.post("/accounts/:key/credits", (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  const { action, amount } = req.body as { action: string; amount: string };
  const n = parseInt(amount, 10);
  if (!isNaN(n) && n >= 0) {
    if (action === "add") addCredits(key, n);
    else if (action === "set") { const a = getAccount(key); if (a) updateAccount(key, { credits: n }); }
  }
  res.redirect(`/admin/accounts/${key}?flash=credits`);
});

adminRouter.post("/accounts/:key/refund/:req_id", (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  refundCredits(key, String(req.params["req_id"]));
  res.redirect(`/admin/accounts/${key}?flash=refunded`);
});

adminRouter.post("/accounts/:key/consume/:req_id", (req: Request, res: Response) => {
  const key = String(req.params["key"]);
  consumeCredits(key, String(req.params["req_id"]));
  res.redirect(`/admin/accounts/${key}?flash=credits`);
});

// ---- Payment Link ----

adminRouter.post("/accounts/:key/payment-link", async (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const key = String(req.params["key"]);
  const { plan } = req.body as { plan: string };
  try {
    const result = await createPaymentLink({ api_key: key, plan });
    const body = `
      <div class="page-header"><h1 class="page-title">${t("paymentLink", lang)}</h1><a href="/admin/accounts/${key}" class="btn btn-gray">${t("dashboard", lang)}</a></div>
      <div class="card">
        <table class="dtbl">
          <tr><th>${t("amount", lang)}</th><td>$${result.amount_usd}</td></tr>
          <tr><th>${t("credits", lang)}</th><td>${result.credits}</td></tr>
          <tr><th>${t("url", lang)}</th><td><a href="${result.url}" target="_blank" style="color:#4f46e5">${result.url}</a></td></tr>
        </table>
        <hr>
        <p style="color:#64748b;font-size:.78rem">${t("paymentNote", lang)}</p>
      </div>`;
    res.send(layout(t("paymentLink", lang), body, nav(lang, "dashboard", req)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.send(layout("Error", `<div class="alert alert-err">${msg}</div><a href="/admin/accounts/${key}" class="btn btn-gray">← Back</a>`, nav(lang, "dashboard", req)));
  }
});

// ---- All Requests ----

adminRouter.get("/requests", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const requests = getAllRequests();
  const accountMap = new Map(listAccounts().map((a) => [a.api_key, a]));

  const rows = requests.map((r) => {
    const acct = accountMap.get(r.api_key);
    return `<tr>
      <td class="tbl-mono">${r.request_id}</td>
      <td><a href="/admin/accounts/${r.api_key}" class="tbl-link">${acct?.company_name || r.api_key}</a></td>
      <td>${r.params.location}</td>
      <td>${r.params.count}</td>
      <td>${r.credits_count}</td>
      <td>${creditStatusBadge(r.credit_status, lang)}</td>
      <td>${r.appointments.length}</td>
      <td style="color:#64748b">${new Date(r.created_at).toLocaleDateString()}</td>
    </tr>`;
  }).join("");

  const body = `
    <div class="page-header"><h1 class="page-title">${t("allRequests", lang)}</h1></div>
    <div class="card">
      <table class="tbl">
        <thead><tr>
          <th>${t("requestId", lang)}</th>
          <th>${t("accounts", lang)}</th>
          <th>${t("location", lang)}</th>
          <th>${t("count", lang)}</th>
          <th>${t("credits", lang)}</th>
          <th>${t("creditStatus", lang)}</th>
          <th>${t("confirmed", lang)}</th>
          <th>${t("date", lang)}</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="8" class="empty">${t("noRequests", lang)}</td></tr>`}</tbody>
      </table>
    </div>`;

  res.send(layout(t("allRequests", lang), body, nav(lang, "requests", req)));
});
