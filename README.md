# LeadClaw MCP (demo)

Demo MCP server for **LeadClaw** — a service for booking confirmed sales appointments through Claude. Human freelance SDRs handle the outbound; AI handles matching, quality, billing, and reporting. Customers pay only per BANT-qualified meeting that lands on their calendar.

This server is the **showcase implementation** used for the demo video and concept pitch. It returns realistic fake data so Claude Desktop calls feel live without any real SDR plumbing behind them yet.

---

## What this demo proves

In Claude Desktop you can say:

> Book 3 sales appointments next Tuesday in Dallas with AI startup CEOs. Budget $450.

…and Claude will:

1. Call `book_appointments` on this server.
2. Get back a `request_id` and an ETA.
3. Poll `check_status` (immediately or later) and see appointments populate.
4. Pull full BANT briefings with `get_appointment_details`.

Nothing real happens on the SDR side — but the customer experience is identical to what the real product will feel like.

---

## Tools exposed

| Tool | Purpose |
|---|---|
| `book_appointments` | Submit a request for N confirmed appointments. Returns a `request_id`. |
| `check_status` | Poll a request; returns confirmed appointments so far and current phase. |
| `get_appointment_details` | Full briefing for one appointment: contact, company, BANT, SDR notes, meeting link. |

### Status progression (demo simulation)

Status advances based on wall-clock time since the request was created — no background workers needed:

| Elapsed | Phase | Confirmed |
|---|---|---|
| 0–5s | `processing` | 0 |
| 5–15s | `matching` | 0 |
| 15s | `in_progress` | 1 |
| +30s each | `in_progress` | +1 |
| All seats filled | `completed` | N |

So a 3-seat request is fully `completed` ~75 seconds after `book_appointments`. Tunable in [src/tools/status.ts](src/tools/status.ts).

---

## Setup

Requirements: Node.js 18+ (this repo was developed against Node 24).

```bash
npm install
npm run build
```

The compiled server entrypoint is `dist/index.js`. Data persists to `data/store.json` (auto-created).

### Connect to Claude Desktop

Edit your Claude Desktop config file:

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "leadclaw": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\leadclaw-mcp\\dist\\index.js"]
    }
  }
}
```

Replace the path with the absolute path to your built `dist/index.js`. On macOS/Linux use forward slashes.

Restart Claude Desktop. The three LeadClaw tools should appear in the tool list.

### Quick smoke test (without Claude Desktop)

```bash
node dist/index.js
```

Then paste the following on stdin (one JSON object per line):

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}
{"jsonrpc":"2.0","method":"notifications/initialized"}
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

You should see three tools advertised.

---

## Project layout

```
leadclaw-mcp/
├── src/
│   ├── index.ts          MCP server entrypoint (stdio transport)
│   ├── tools/
│   │   ├── book.ts       book_appointments
│   │   ├── status.ts     check_status (time-based phase simulation)
│   │   └── details.ts    get_appointment_details
│   ├── mock/
│   │   ├── companies.ts  fake AI/SaaS company pool
│   │   ├── people.ts     fake names + default role pool
│   │   └── generator.ts  appointment + BANT + meeting-time synthesis
│   └── db/
│       └── store.ts      JSON file persistence
├── data/
│   └── store.json        auto-generated on first request (gitignored)
└── dist/                 build output
```

---

## Demo recording flow

1. Restart Claude Desktop with the MCP config in place.
2. In a fresh chat, paste:
   > Book 3 sales appointments next Tuesday in Dallas with AI startup CEOs. Budget $450.
3. Claude calls `book_appointments` → you see the tool call card.
4. Ask: *"check status"* → Claude calls `check_status`. First call (within ~15s) shows processing/matching; wait ~75s and call again to see all 3 confirmed.
5. Optional: *"give me the full briefing on the first one"* → Claude calls `get_appointment_details`.

For the 30-second video cut, edit out the wait between calls.

---

## What's intentionally *not* in this build

- Real SDR matching / phone integration
- Stripe / billing
- OAuth (stdio is local-only)
- Web dashboard
- Anthropic Connectors Directory submission

These come after the concept lands.
