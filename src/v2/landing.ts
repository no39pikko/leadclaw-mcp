/**
 * Server-hosted landing page + lead form. This is "the link you share".
 *   GET /lp/:campaignId   renders a form (offer pulled from the campaign)
 * The form POSTs JSON to /webhook/lead/:campaignId on the same origin, so the
 * whole loop (form -> webhook -> enrich -> scrub -> AI call) runs with no
 * external form tool and no ad-platform API. Drive any traffic at this URL:
 * a DM, an email, or a normal Ads Manager ad pointed here.
 */
import { Router } from "express";
import { getCampaign } from "../gtm/db.js";

export const landingRouter = Router();

const CONSENT_LABEL =
  "I agree to be contacted by phone about this request, including via an automated/AI voice, at the number I provide.";

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

landingRouter.get("/:campaignId", (req, res) => {
  const campaign = getCampaign(req.params.campaignId);
  const headline = esc(campaign?.ad_creative?.headline || campaign?.offer || "Get a call from us in minutes");
  const sub = esc(campaign?.ad_creative?.body || "Leave your details and we'll call you right away.");
  const cid = esc(req.params.campaignId);

  res.send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${headline}</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:1.5rem}
  .card{background:#1e293b;border-radius:16px;padding:2.25rem;max-width:440px;width:100%}
  h1{font-size:1.5rem;margin:0 0 .5rem} p.sub{color:#94a3b8;margin:0 0 1.5rem;line-height:1.5}
  label{display:block;font-size:.8rem;color:#cbd5e1;margin:.75rem 0 .25rem}
  input[type=text],input[type=email],input[type=tel]{width:100%;padding:.6rem .75rem;border:1px solid #334155;background:#0f172a;color:#e2e8f0;border-radius:8px;font-size:.95rem}
  .consent{display:flex;gap:.5rem;align-items:flex-start;margin:1rem 0;font-size:.8rem;color:#94a3b8}
  button{width:100%;margin-top:1rem;padding:.8rem;background:#4f46e5;color:#fff;border:0;border-radius:8px;font-size:1rem;cursor:pointer}
  button:disabled{opacity:.5;cursor:not-allowed}
  .done{text-align:center} .done h2{color:#34d399}
</style></head><body>
<div class="card" id="card">
  <h1>${headline}</h1>
  <p class="sub">${sub}</p>
  <form id="f">
    <label>Full name</label><input type="text" name="name" required>
    <label>Work email</label><input type="email" name="email" required>
    <label>Phone (we'll call this)</label><input type="tel" name="phone" required placeholder="+1 …">
    <label>Company</label><input type="text" name="company">
    <div class="consent"><input type="checkbox" name="consent" id="consent" required>
      <label for="consent" style="margin:0">${CONSENT_LABEL}</label></div>
    <button type="submit" id="btn">Request my call</button>
  </form>
</div>
<script>
  const f=document.getElementById('f'),card=document.getElementById('card'),btn=document.getElementById('btn');
  f.addEventListener('submit',async(e)=>{
    e.preventDefault();btn.disabled=true;btn.textContent='Submitting…';
    const fd=new FormData(f);
    const body={name:fd.get('name'),email:fd.get('email'),phone:fd.get('phone'),company:fd.get('company'),consent:fd.get('consent')==='on'};
    try{
      const r=await fetch('/webhook/lead/${cid}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
      if(!r.ok)throw new Error((await r.json()).error||r.status);
      card.innerHTML='<div class="done"><h2>✓ Got it</h2><p class="sub">Keep your phone handy — we\\'ll call you in the next minute or two.</p></div>';
    }catch(err){btn.disabled=false;btn.textContent='Request my call';alert('Something went wrong: '+err.message);}
  });
</script></body></html>`);
});
