# Next session — kickoff

## Where we are (checkpoint 2026-06-05)

The GTM Agent (ads → Speed-to-Lead) is built and **proven live**. A real AI call,
placed through our `RetellCallDriver`, qualified an insurance lead (health/dental)
and verbally booked a Wednesday 2 PM consultation in ~116 seconds. Branch
`feat/gtm-agent`, everything committed and pushed.

- **System:** [GTM_AGENT_SPEC.md](GTM_AGENT_SPEC.md) (what/why), [RUNBOOK.md](RUNBOOK.md) (run + go-live), [DEPLOY.md](DEPLOY.md).
- **Verified:** mock e2e (`scripts/e2e.mjs`), HTTP webhook (`scripts/http-test.mjs`), and a **real Retell call** (`scripts/ring-test.mjs`).
- **`.env`** (local, gitignored) holds `RETELL_API_KEY` / `RETELL_AGENT_ID` / `RETELL_FROM_NUMBER` (`+17818516476` — our shared from-number).
- **Retell billing gotcha (resolved):** number purchase was blocked because the card was saved as a Stripe **Link wallet** entry, not directly attached. Fix = add the card manually in the billing portal (decline the Link autofill). KYC/verification passed (use case: consent-based callbacks to inbound insurance-quote leads; LLC: SakuraInsuranceLeads).

## The next build — the product's core

Today the **per-customer setup** (creating a Retell agent with a vertical-specific
script) was done **by hand**. Automating exactly that is the product:

1. On `launch_campaign` (or right after `generate_call_script`), call Retell's
   **create-agent / create-retell-llm API** with the Claude-generated `CallScript`
   → store the returned `agent_id` on the campaign.
2. `RetellCallDriver.call` should use the **campaign's `agent_id`**, not the global
   env `RETELL_AGENT_ID`.
3. Auto-configure a post-call analysis field **`booked_time`** on the created agent
   so a verbal booking is captured → flows into `schedule_meeting` + `write_crm`.

Result: a customer supplies `{ICP, offer, vertical}` and the system provisions its
own calling agent — no human pasting prompts. That closes the "fully automatic
setup" loop. (Reference for the call-script content: `prompts/retell-gtm-agent.md`.)

## Deferred (subsumed by the build above — don't hand-tune the test)

- The test agent's "Welcome Message" still had a stale "Retell Law Firm" greeting before the real opener.
- `booked_time` not set, so the live call's verbal booking wasn't captured as an appointment.

## Resume

Open the project, read this + `project_leadclaw.md` (auto-memory), then build the
auto-provision-Retell-agent feature on `feat/gtm-agent`.
