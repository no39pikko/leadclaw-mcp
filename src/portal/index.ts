import { Router, type Request, type Response } from "express";
import { getAccount, hashPassword, verifyPassword, setPassword } from "../db/store.js";
import { t, getLang, type Lang } from "../v2/i18n.js";

export const portalRouter = Router();

// ---- CSS ----

const CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:#f8fafc;color:#0f172a;min-height:100vh}
  a{color:inherit;text-decoration:none}

  /* Navbar */
  .nav{background:#0f172a;height:56px;display:flex;align-items:center;padding:0 24px;position:sticky;top:0;z-index:100;box-shadow:0 1px 0 rgba(255,255,255,.06)}
  .nav-logo{color:#fff;font-weight:700;font-size:1.05rem;letter-spacing:-.01em;display:flex;align-items:center;gap:6px;margin-right:auto}
  .nav-logo span{color:#818cf8}
  .nav-links{display:flex;align-items:center;gap:2px;margin-right:16px}
  .nav-link{color:#94a3b8;font-size:.82rem;font-weight:500;padding:6px 10px;border-radius:6px;transition:all .15s;white-space:nowrap}
  .nav-link:hover{color:#fff;background:rgba(255,255,255,.06)}
  .lang-switcher{display:flex;border:1px solid rgba(255,255,255,.12);border-radius:6px;overflow:hidden}
  .lang-btn{color:#94a3b8;font-size:.75rem;font-weight:600;padding:4px 10px;transition:all .15s;cursor:pointer}
  .lang-btn:hover{color:#fff;background:rgba(255,255,255,.08)}
  .lang-btn.on{background:#4f46e5;color:#fff}

  /* Auth page (centered card) */
  .auth-wrap{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:calc(100vh - 56px);padding:2rem}
  .auth-card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.08);padding:2.5rem;width:100%;max-width:460px}
  .auth-logo{text-align:center;margin-bottom:1.75rem}
  .auth-logo .icon{font-size:2rem;margin-bottom:.375rem}
  .auth-logo h1{color:#0f172a;font-size:1.2rem;font-weight:700}
  .auth-logo p{color:#64748b;font-size:.8rem;margin-top:.25rem}
  .auth-card h2{color:#0f172a;font-size:1rem;font-weight:700;margin-bottom:1rem}

  /* Account page (full width) */
  .container{max-width:900px;margin:0 auto;padding:28px 24px}
  .page-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;flex-wrap:wrap;gap:12px}
  .page-title{font-size:1.4rem;font-weight:700}

  /* Cards */
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:20px 24px;margin-bottom:16px}
  .card-title{font-size:.92rem;font-weight:600;color:#1e293b;margin-bottom:14px}

  /* Stats */
  .stat-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
  .stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px 18px}
  .stat-val{font-size:1.75rem;font-weight:700;color:#0f172a;line-height:1}
  .stat-val.amber{color:#d97706}
  .stat-lbl{font-size:.68rem;font-weight:600;color:#94a3b8;margin-top:4px;text-transform:uppercase;letter-spacing:.06em}

  /* Badges */
  .badge{display:inline-flex;align-items:center;padding:3px 8px;border-radius:20px;font-size:.7rem;font-weight:600;gap:4px}
  .badge::before{content:"";width:5px;height:5px;border-radius:50%;display:inline-block}
  .b-green{background:#f0fdf4;color:#15803d}.b-green::before{background:#22c55e}
  .b-amber{background:#fffbeb;color:#b45309}.b-amber::before{background:#f59e0b}

  /* Info rows */
  .info-row{display:flex;justify-content:space-between;align-items:center;padding:.6rem 0;border-bottom:1px solid #f1f5f9;font-size:.875rem}
  .info-row:last-child{border:none}
  .info-label{color:#64748b;font-weight:500}
  .info-val{color:#0f172a;font-weight:600;text-align:right}

  /* Key box */
  .key-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;font-family:"Roboto Mono","SF Mono",monospace;font-size:.8rem;word-break:break-all;color:#374151;user-select:all;cursor:text;margin:.5rem 0}

  /* Buttons */
  .btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border-radius:8px;font-size:.875rem;font-weight:600;border:none;cursor:pointer;transition:all .15s;white-space:nowrap;text-decoration:none}
  .btn:hover{opacity:.88;transform:translateY(-1px)}
  .btn:active{transform:translateY(0)}
  .btn-primary{background:#4f46e5;color:#fff}
  .btn-gray{background:#f1f5f9;color:#374151;border:1px solid #e2e8f0}
  .btn-gray:hover{background:#e2e8f0;transform:none}
  .btn-full{width:100%;display:flex}

  /* Forms */
  .fg{margin-bottom:14px}
  .fg label{display:block;font-size:.78rem;font-weight:600;color:#374151;margin-bottom:5px}
  .fg input{width:100%;padding:9px 12px;border:1px solid #e2e8f0;border-radius:8px;font-size:.875rem;color:#0f172a;outline:none;transition:border .15s,box-shadow .15s;background:#fff}
  .fg input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.1)}

  /* Alerts */
  .alert{padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:.82rem;font-weight:500}
  .alert-err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}
  .alert-ok{background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0}

  /* Setup steps */
  .steps{display:flex;flex-direction:column;gap:10px}
  .step{display:flex;gap:12px;align-items:flex-start;font-size:.82rem;color:#4b5563}
  .step-num{background:#4f46e5;color:#fff;border-radius:50%;width:22px;height:22px;min-width:22px;display:flex;align-items:center;justify-content:center;font-size:.68rem;font-weight:700;margin-top:1px}
  pre{background:#0f172a;color:#e2e8f0;border-radius:8px;padding:12px 14px;font-size:.75rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all;margin-top:6px}

  /* Divider */
  hr{border:none;border-top:1px solid #f1f5f9;margin:1.25rem 0}

  /* Two col */
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px}
  @media(max-width:680px){.two-col,.stat-row{grid-template-columns:1fr}}

  /* Link */
  .text-link{color:#4f46e5;font-size:.82rem}
  .text-link:hover{text-decoration:underline}
`;

// ---- Helpers ----

function getLangFromReq(req: Request): Lang {
  return getLang(req.headers.cookie);
}

function langSwitcher(lang: Lang, currentPath: string): string {
  return `<div class="lang-switcher">
      <a href="/set-lang?lang=ja&redirect=${encodeURIComponent(currentPath)}" class="lang-btn${lang === "ja" ? " on" : ""}">JP</a>
      <a href="/set-lang?lang=en&redirect=${encodeURIComponent(currentPath)}" class="lang-btn${lang === "en" ? " on" : ""}">EN</a>
    </div>`;
}

function isAdminSession(req: Request): boolean {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return true;
  return (req.headers.cookie ?? "").includes(`admin_auth=${adminSecret}`);
}

function navbar(lang: Lang, req: Request): string {
  const path = req.originalUrl;
  const adminLink = isAdminSession(req)
    ? `<a href="/admin" class="nav-link">${t("backToAdmin", lang)}</a>`
    : "";
  return `<nav class="nav">
    <div class="nav-logo"><span>⚡</span> LeadClaw</div>
    <div class="nav-links">${adminLink}</div>
    ${langSwitcher(lang, path)}
  </nav>`;
}

function authLayout(title: string, body: string, lang: Lang, req: Request): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — LeadClaw</title>
  <style>${CSS}</style>
</head>
<body>
  ${navbar(lang, req)}
  <div class="auth-wrap">
    <div class="auth-card">
      <div class="auth-logo">
        <div class="icon">⚡</div>
        <h1>${t("welcomeTitle", lang)}</h1>
        <p>${t("welcomeSubtitle", lang)}</p>
      </div>
      ${body}
    </div>
  </div>
</body>
</html>`;
}

function pageLayout(title: string, body: string, lang: Lang, req: Request): string {
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — LeadClaw</title>
  <style>${CSS}</style>
</head>
<body>
  ${navbar(lang, req)}
  <div class="container">${body}</div>
</body>
</html>`;
}

function creditBadge(account: ReturnType<typeof getAccount>, lang: Lang): string {
  if (!account) return "—";
  if (account.credits_reserved > 0) {
    return `<span class="badge b-green">${account.credits} ${t("available", lang)}</span>&nbsp;<span class="badge b-amber">${account.credits_reserved} ${t("reserved", lang)}</span>`;
  }
  return `<span class="badge b-green">${account.credits} ${t("credits", lang)}</span>`;
}

function mcpUrl(req: Request): string {
  const host = req.hostname;
  const port = host === "localhost" ? `:${process.env.PORT ?? 4000}` : "";
  return `${req.protocol}://${host}${port}/mcp`;
}

// ---- Portal Home ----

portalRouter.get("/", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const apiKey = req.query.key as string | undefined;

  if (!apiKey) {
    res.send(authLayout(t("portal", lang), `
      <h2>${t("enterApiKey", lang)}</h2>
      <form method="GET" action="/portal">
        <div class="fg">
          <label>${t("yourApiKey", lang)}</label>
          <input name="key" placeholder="lc_..." required autofocus>
        </div>
        <button class="btn btn-primary btn-full" type="submit">${t("viewAccount", lang)}</button>
      </form>`, lang, req));
    return;
  }

  const account = getAccount(apiKey);
  if (!account) {
    res.send(authLayout(t("invalidApiKey", lang), `
      <div class="alert alert-err">${t("invalidApiKey", lang)}</div>
      <a href="/portal" class="btn btn-gray btn-full">${t("tryAgain", lang)}</a>
    `, lang, req));
    return;
  }

  if (!account.password_hash) {
    res.redirect(`/portal/setup?key=${apiKey}`);
    return;
  }

  // Account dashboard
  const url = mcpUrl(req);
  const configJson = JSON.stringify({
    mcpServers: {
      leadclaw: {
        url,
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    },
  }, null, 2);

  const body = `
    <div class="page-header">
      <h1 class="page-title">${t("myAccount", lang)}</h1>
      <a href="/portal/change-password?key=${apiKey}" class="btn btn-gray">${t("changePassword", lang)}</a>
    </div>

    <div class="two-col">
      <div>
        <div class="card">
          <div class="card-title">${t("accountInfo", lang)}</div>
          <div class="info-row">
            <span class="info-label">${t("company", lang)}</span>
            <span class="info-val">${account.company_name || "—"}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${t("email", lang)}</span>
            <span class="info-val">${account.email || "—"}</span>
          </div>
          <div class="info-row">
            <span class="info-label">${t("status", lang)}</span>
            <span class="info-val"><span class="badge b-green">${t("active", lang)}</span></span>
          </div>
        </div>

        <div class="card">
          <div class="card-title">${t("credits", lang)}</div>
          <div class="stat-row">
            <div class="stat">
              <div class="stat-val">${account.credits}</div>
              <div class="stat-lbl">${t("available", lang)}</div>
            </div>
            <div class="stat">
              <div class="stat-val amber">${account.credits_reserved}</div>
              <div class="stat-lbl">${t("reserved", lang)}</div>
            </div>
          </div>
        </div>
      </div>

      <div>
        <div class="card">
          <div class="card-title">${t("apiKey", lang)}</div>
          <div class="key-box">${apiKey}</div>
          <p style="color:#94a3b8;font-size:.75rem;margin-top:6px">${t("shareViaPortal", lang)}</p>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">${t("setupInstructions", lang)}</div>
      <div class="steps">
        <div class="step"><div class="step-num">1</div><div>${t("step1", lang)}</div></div>
        <div class="step"><div class="step-num">2</div><div>
          ${t("step2", lang)}
          <pre>${configJson.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
        </div></div>
        <div class="step"><div class="step-num">3</div><div>${t("step3", lang)}</div></div>
        <div class="step"><div class="step-num">4</div><div>${t("step4", lang)}</div></div>
      </div>
    </div>`;

  res.send(pageLayout(t("myAccount", lang), body, lang, req));
});

// ---- Password Setup (First Time) ----

portalRouter.get("/setup", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const apiKey = req.query.key as string | undefined;
  const account = apiKey ? getAccount(apiKey) : undefined;
  if (!account) { res.redirect("/portal"); return; }

  res.send(authLayout(t("setPasswordTitle", lang), `
    <h2>${t("setPasswordTitle", lang)}</h2>
    <p style="color:#64748b;font-size:.82rem;margin-bottom:1.25rem">${t("setPasswordSub", lang)}</p>
    <form method="POST" action="/portal/setup">
      <input type="hidden" name="key" value="${apiKey}">
      <div class="fg">
        <label>${t("password", lang)}</label>
        <input name="password" type="password" required minlength="8" autofocus>
      </div>
      <div class="fg">
        <label>${t("confirmPassword", lang)}</label>
        <input name="confirm" type="password" required>
      </div>
      <button class="btn btn-primary btn-full" type="submit">${t("setPasswordBtn", lang)}</button>
    </form>`, lang, req));
});

portalRouter.post("/setup", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const { key, password, confirm } = req.body as Record<string, string>;
  const account = getAccount(key);
  if (!account) { res.redirect("/portal"); return; }

  if (!password || password.length < 8) {
    res.send(authLayout(t("setPasswordTitle", lang), `
      <div class="alert alert-err">${t("pwTooShort", lang)}</div>
      <a href="/portal/setup?key=${key}" class="btn btn-gray btn-full">${t("tryAgain", lang)}</a>
    `, lang, req));
    return;
  }

  if (password !== confirm) {
    res.send(authLayout(t("setPasswordTitle", lang), `
      <div class="alert alert-err">${t("pwMismatch", lang)}</div>
      <a href="/portal/setup?key=${key}" class="btn btn-gray btn-full">${t("tryAgain", lang)}</a>
    `, lang, req));
    return;
  }

  setPassword(key, hashPassword(password));
  res.redirect(`/portal?key=${key}`);
});

// ---- Change Password ----

portalRouter.get("/change-password", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const apiKey = req.query.key as string | undefined;
  if (!apiKey || !getAccount(apiKey)) { res.redirect("/portal"); return; }

  res.send(authLayout(t("changePassword", lang), `
    <h2>${t("changePassword", lang)}</h2>
    <form method="POST" action="/portal/change-password">
      <input type="hidden" name="key" value="${apiKey}">
      <div class="fg">
        <label>${t("currentPassword", lang)}</label>
        <input name="current" type="password" required autofocus>
      </div>
      <div class="fg">
        <label>${t("newPassword", lang)}</label>
        <input name="password" type="password" required minlength="8">
      </div>
      <div class="fg">
        <label>${t("confirmNew", lang)}</label>
        <input name="confirm" type="password" required>
      </div>
      <button class="btn btn-primary btn-full" type="submit" style="margin-bottom:12px">${t("updatePassword", lang)}</button>
      <a href="/portal?key=${apiKey}" class="btn btn-gray btn-full">${t("backToAccount", lang)}</a>
    </form>`, lang, req));
});

portalRouter.post("/change-password", (req: Request, res: Response) => {
  const lang = getLangFromReq(req);
  const { key, current, password, confirm } = req.body as Record<string, string>;
  const account = getAccount(key);
  if (!account) { res.redirect("/portal"); return; }

  if (!account.password_hash || !verifyPassword(current, account.password_hash)) {
    res.send(authLayout(t("changePassword", lang), `
      <div class="alert alert-err">${t("pwWrong", lang)}</div>
      <a href="/portal/change-password?key=${key}" class="btn btn-gray btn-full">${t("tryAgain", lang)}</a>
    `, lang, req));
    return;
  }

  if (!password || password.length < 8) {
    res.send(authLayout(t("changePassword", lang), `
      <div class="alert alert-err">${t("pwTooShort", lang)}</div>
      <a href="/portal/change-password?key=${key}" class="btn btn-gray btn-full">${t("tryAgain", lang)}</a>
    `, lang, req));
    return;
  }

  if (password !== confirm) {
    res.send(authLayout(t("changePassword", lang), `
      <div class="alert alert-err">${t("pwMismatch", lang)}</div>
      <a href="/portal/change-password?key=${key}" class="btn btn-gray btn-full">${t("tryAgain", lang)}</a>
    `, lang, req));
    return;
  }

  setPassword(key, hashPassword(password));
  res.send(authLayout(t("changePassword", lang), `
    <div class="alert alert-ok">${t("pwUpdated", lang)}</div>
    <a href="/portal?key=${key}" class="btn btn-gray btn-full">${t("backToAccount", lang)}</a>
  `, lang, req));
});
