import { Router, type Request, type Response } from "express";
import { getAccount, hashPassword, verifyPassword, setPassword } from "../db/store.js";

export const portalRouter = Router();

// ---- Layout ----

function layout(title: string, body: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${title} — LeadClaw Portal</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0;font-family:system-ui,-apple-system,sans-serif}
    body{background:linear-gradient(135deg,#1e1b4b 0%,#1e293b 100%);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:2rem}
    .card{background:white;border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.4);padding:2.5rem;width:100%;max-width:520px}
    .logo{text-align:center;margin-bottom:2rem}
    .logo-icon{font-size:2.5rem;margin-bottom:0.5rem}
    .logo h1{color:#1e293b;font-size:1.5rem;font-weight:700}
    .logo p{color:#64748b;font-size:.9rem;margin-top:0.25rem}
    h2{color:#1e293b;font-size:1.125rem;font-weight:600;margin-bottom:1.25rem}
    .form-group{margin-bottom:1rem}
    .form-group label{display:block;font-size:.875rem;font-weight:500;color:#374151;margin-bottom:.375rem}
    .form-group input{width:100%;padding:.625rem .875rem;border:1px solid #d1d5db;border-radius:8px;font-size:.9rem;outline:none;transition:border .15s,box-shadow .15s}
    .form-group input:focus{border-color:#4f46e5;box-shadow:0 0 0 3px rgba(79,70,229,.12)}
    .btn{display:block;width:100%;padding:.75rem;background:#4f46e5;color:white;border:none;border-radius:8px;font-size:.95rem;font-weight:600;cursor:pointer;text-align:center;text-decoration:none;transition:background .15s}
    .btn:hover{background:#4338ca}
    .alert{padding:.75rem 1rem;border-radius:8px;margin-bottom:1rem;font-size:.875rem}
    .alert-error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}
    .alert-success{background:#f0fdf4;color:#166534;border:1px solid #bbf7d0}
    .info-row{display:flex;justify-content:space-between;padding:.6rem 0;border-bottom:1px solid #f1f5f9;font-size:.875rem}
    .info-row:last-child{border:none}
    .info-label{color:#64748b;font-weight:500}
    .info-val{color:#1e293b;font-weight:600;text-align:right}
    .key-box{background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:1rem;font-family:monospace;font-size:.85rem;word-break:break-all;color:#374151;margin:.75rem 0}
    .badge{display:inline-block;padding:.2rem .6rem;border-radius:9999px;font-size:.7rem;font-weight:600}
    .badge-green{background:#dcfce7;color:#166534}
    .badge-amber{background:#fef3c7;color:#92400e}
    .setup-steps{background:#f8fafc;border-radius:8px;padding:1.25rem;margin-top:1rem}
    .setup-steps h3{font-size:.875rem;font-weight:600;color:#374151;margin-bottom:.75rem}
    .step{display:flex;gap:.75rem;margin-bottom:.75rem;font-size:.8rem;color:#4b5563}
    .step-num{background:#4f46e5;color:white;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:.7rem;font-weight:700;flex-shrink:0}
    pre{background:#1e293b;color:#e2e8f0;border-radius:6px;padding:.75rem;font-size:.75rem;overflow-x:auto;white-space:pre-wrap;word-break:break-all}
    .divider{border:none;border-top:1px solid #f1f5f9;margin:1.25rem 0}
    a.link{color:#4f46e5;text-decoration:none}
    a.link:hover{text-decoration:underline}
  </style>
</head>
<body>
  <div class="logo">
    <div class="logo-icon">⚡</div>
    <h1>LeadClaw</h1>
    <p>AI-Powered Sales Appointment Booking</p>
  </div>
  <div class="card">
    ${body}
  </div>
</body>
</html>`;
}

// ---- Portal Home ----

portalRouter.get("/", (req: Request, res: Response) => {
  const apiKey = req.query.key as string | undefined;

  if (!apiKey) {
    res.send(layout("Welcome", `
      <h2>Welcome to LeadClaw</h2>
      <p style="color:#64748b;font-size:.875rem;margin-bottom:1.25rem">
        Enter your API key to view your account and setup instructions.
      </p>
      <form method="GET" action="/portal">
        <div class="form-group">
          <label>Your API Key</label>
          <input name="key" placeholder="lc_..." required>
        </div>
        <button class="btn" type="submit">View Account →</button>
      </form>`));
    return;
  }

  const account = getAccount(apiKey);
  if (!account) {
    res.send(layout("Invalid Key", `
      <div class="alert alert-error">Invalid API key. Please check and try again.</div>
      <a href="/portal" class="btn" style="background:#6b7280">← Try Again</a>`));
    return;
  }

  // If password not set, show setup form
  if (!account.password_hash) {
    res.redirect(`/portal/setup?key=${apiKey}`);
    return;
  }

  // Show account dashboard
  const creditsHtml = account.credits_reserved > 0
    ? `<span class="badge badge-green">${account.credits} available</span> <span class="badge badge-amber">${account.credits_reserved} reserved</span>`
    : `<span class="badge badge-green">${account.credits} credits</span>`;

  const configJson = JSON.stringify({
    mcpServers: {
      leadclaw: {
        url: `${req.protocol}://${req.hostname}${req.hostname === "localhost" ? `:${process.env.PORT ?? 4000}` : ""}/mcp`,
        headers: { Authorization: `Bearer ${apiKey}` },
      },
    },
  }, null, 2);

  res.send(layout("My Account", `
    <h2>My Account</h2>
    <div>
      <div class="info-row"><span class="info-label">Company</span><span class="info-val">${account.company_name || "—"}</span></div>
      <div class="info-row"><span class="info-label">Email</span><span class="info-val">${account.email || "—"}</span></div>
      <div class="info-row"><span class="info-label">Credits</span><span class="info-val">${creditsHtml}</span></div>
      <div class="info-row"><span class="info-label">Status</span><span class="info-val"><span class="badge badge-green">Active</span></span></div>
    </div>
    <div class="divider"></div>
    <h2>Your API Key</h2>
    <div class="key-box">${apiKey}</div>
    <div class="setup-steps">
      <h3>Claude Desktop Setup</h3>
      <div class="step"><div class="step-num">1</div><div>Open Claude Desktop → Settings → Developer → Edit Config</div></div>
      <div class="step"><div class="step-num">2</div><div>Paste this into <code>claude_desktop_config.json</code>:</div></div>
      <pre>${configJson.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</pre>
      <div class="step"><div class="step-num">3</div><div>Save the file and restart Claude Desktop</div></div>
      <div class="step"><div class="step-num">4</div><div>Ask Claude: <em>"Book me 3 sales appointments in San Francisco targeting CEO"</em></div></div>
    </div>
    <div class="divider"></div>
    <p style="text-align:center;font-size:.8rem">
      <a href="/portal/change-password?key=${apiKey}" class="link">Change Password</a>
    </p>`));
});

// ---- Password Setup (First Time) ----

portalRouter.get("/setup", (req: Request, res: Response) => {
  const apiKey = req.query.key as string | undefined;
  if (!apiKey || !getAccount(apiKey)) {
    res.redirect("/portal");
    return;
  }
  const account = getAccount(apiKey)!;

  res.send(layout("Set Your Password", `
    <h2>Welcome, ${account.company_name || "there"}! 👋</h2>
    <p style="color:#64748b;font-size:.875rem;margin-bottom:1.5rem">
      Set a password to secure your LeadClaw account. You'll use this to access your API key and account info.
    </p>
    <form method="POST" action="/portal/setup">
      <input type="hidden" name="key" value="${apiKey}">
      <div class="form-group">
        <label>Password</label>
        <input name="password" type="password" placeholder="Choose a strong password" required minlength="8">
      </div>
      <div class="form-group">
        <label>Confirm Password</label>
        <input name="confirm" type="password" placeholder="Repeat your password" required>
      </div>
      <button class="btn" type="submit">Set Password & View API Key →</button>
    </form>`));
});

portalRouter.post("/setup", (req: Request, res: Response) => {
  const { key, password, confirm } = req.body as Record<string, string>;
  const account = getAccount(key);
  if (!account) { res.redirect("/portal"); return; }

  if (!password || password.length < 8) {
    res.send(layout("Set Password", `
      <div class="alert alert-error">Password must be at least 8 characters.</div>
      <a href="/portal/setup?key=${key}" class="btn" style="background:#6b7280">← Try Again</a>`));
    return;
  }

  if (password !== confirm) {
    res.send(layout("Set Password", `
      <div class="alert alert-error">Passwords do not match. Please try again.</div>
      <a href="/portal/setup?key=${key}" class="btn" style="background:#6b7280">← Try Again</a>`));
    return;
  }

  setPassword(key, hashPassword(password));
  res.redirect(`/portal?key=${key}`);
});

// ---- Change Password ----

portalRouter.get("/change-password", (req: Request, res: Response) => {
  const apiKey = req.query.key as string | undefined;
  if (!apiKey || !getAccount(apiKey)) { res.redirect("/portal"); return; }

  res.send(layout("Change Password", `
    <h2>Change Password</h2>
    <form method="POST" action="/portal/change-password">
      <input type="hidden" name="key" value="${apiKey}">
      <div class="form-group">
        <label>Current Password</label>
        <input name="current" type="password" required>
      </div>
      <div class="form-group">
        <label>New Password</label>
        <input name="password" type="password" required minlength="8">
      </div>
      <div class="form-group">
        <label>Confirm New Password</label>
        <input name="confirm" type="password" required>
      </div>
      <button class="btn" type="submit">Update Password</button>
    </form>
    <div style="text-align:center;margin-top:1rem">
      <a href="/portal?key=${apiKey}" class="link" style="font-size:.875rem">← Back to Account</a>
    </div>`));
});

portalRouter.post("/change-password", (req: Request, res: Response) => {
  const { key, current, password, confirm } = req.body as Record<string, string>;
  const account = getAccount(key);
  if (!account) { res.redirect("/portal"); return; }

  if (!account.password_hash || !verifyPassword(current, account.password_hash)) {
    res.send(layout("Change Password", `
      <div class="alert alert-error">Current password is incorrect.</div>
      <a href="/portal/change-password?key=${key}" class="btn" style="background:#6b7280">← Try Again</a>`));
    return;
  }

  if (password !== confirm || password.length < 8) {
    res.send(layout("Change Password", `
      <div class="alert alert-error">New passwords don't match or are too short (min 8 chars).</div>
      <a href="/portal/change-password?key=${key}" class="btn" style="background:#6b7280">← Try Again</a>`));
    return;
  }

  setPassword(key, hashPassword(password));
  res.redirect(`/portal?key=${key}`);
});
