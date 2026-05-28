import Database from "better-sqlite3";
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const DB_PATH = join(DATA_DIR, "leadclaw.db");
const JSON_PATH = join(DATA_DIR, "store.json");

// ---- Types ----

export type Account = {
  api_key: string;
  email: string;
  password_hash: string | null;
  company_name: string;
  company_info: string;
  icp: string;
  industry: string;
  target_role: string;
  credits: number;
  credits_reserved: number;
  created_at: number;
  invited_at: number | null;
  activated_at: number | null;
};

export type AppointmentRecord = {
  appointment_id: string;
  request_id: string;
  contact_name: string;
  company: string;
  company_size: string;
  company_stage: string;
  role: string;
  scheduled_at: string;
  meeting_link: string;
  bant_score: {
    budget: string;
    authority: string;
    need: string;
    timeline: string;
  };
  sdr_notes: string;
};

export type RequestRecord = {
  request_id: string;
  api_key: string;
  created_at: number;
  params: {
    location: string;
    count: number;
    industry?: string;
    target_role?: string;
    date_range?: string;
    budget_per_appointment?: number;
    notes?: string;
  };
  appointments: AppointmentRecord[];
  credit_status: "reserved" | "consumed" | "refunded";
  credits_count: number;
};

// ---- DB Initialization ----

mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    api_key          TEXT PRIMARY KEY,
    email            TEXT UNIQUE,
    password_hash    TEXT,
    company_name     TEXT NOT NULL DEFAULT '',
    company_info     TEXT NOT NULL DEFAULT '',
    icp              TEXT NOT NULL DEFAULT '',
    industry         TEXT NOT NULL DEFAULT '',
    target_role      TEXT NOT NULL DEFAULT '',
    credits          INTEGER NOT NULL DEFAULT 0,
    credits_reserved INTEGER NOT NULL DEFAULT 0,
    created_at       INTEGER NOT NULL,
    invited_at       INTEGER,
    activated_at     INTEGER
  );

  CREATE TABLE IF NOT EXISTS requests (
    request_id    TEXT PRIMARY KEY,
    api_key       TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    params        TEXT NOT NULL,
    appointments  TEXT NOT NULL DEFAULT '[]',
    credit_status TEXT NOT NULL DEFAULT 'reserved',
    credits_count INTEGER NOT NULL DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS idx_requests_api_key ON requests(api_key);
`);

// ---- JSON Migration ----

function migrateFromJson() {
  if (!existsSync(JSON_PATH)) return;
  const count = (db.prepare("SELECT COUNT(*) as c FROM accounts").get() as { c: number }).c;
  if (count > 0) return; // Already migrated

  try {
    const raw = JSON.parse(readFileSync(JSON_PATH, "utf8")) as {
      accounts: Record<string, Omit<Account, "email" | "password_hash" | "credits_reserved" | "invited_at" | "activated_at">>;
      requests: Record<string, Omit<RequestRecord, "credit_status" | "credits_count"> & { appointments: AppointmentRecord[] }>;
    };

    const insertAccount = db.prepare(`
      INSERT OR IGNORE INTO accounts
        (api_key, email, company_name, company_info, icp, industry, target_role, credits, credits_reserved, created_at)
      VALUES
        (@api_key, @email, @company_name, @company_info, @icp, @industry, @target_role, @credits, 0, @created_at)
    `);

    const insertRequest = db.prepare(`
      INSERT OR IGNORE INTO requests
        (request_id, api_key, created_at, params, appointments, credit_status, credits_count)
      VALUES
        (@request_id, @api_key, @created_at, @params, @appointments, @credit_status, @credits_count)
    `);

    const migrate = db.transaction(() => {
      for (const a of Object.values(raw.accounts ?? {})) {
        insertAccount.run({ ...a, email: null });
      }
      for (const r of Object.values(raw.requests ?? {})) {
        insertRequest.run({
          ...r,
          params: JSON.stringify(r.params),
          appointments: JSON.stringify(r.appointments ?? []),
          credit_status: "consumed", // Legacy requests treated as consumed
          credits_count: r.params?.count ?? 0,
        });
      }
    });
    migrate();
    console.error("[leadclaw] Migrated data from store.json to SQLite");
  } catch (err) {
    console.error("[leadclaw] Migration warning:", err);
  }
}

migrateFromJson();

// ---- Row → Object Helpers ----

type AccountRow = Omit<Account, "bant_score">;

function rowToAccount(row: AccountRow): Account {
  return {
    api_key: row.api_key,
    email: row.email ?? "",
    password_hash: row.password_hash ?? null,
    company_name: row.company_name ?? "",
    company_info: row.company_info ?? "",
    icp: row.icp ?? "",
    industry: row.industry ?? "",
    target_role: row.target_role ?? "",
    credits: row.credits ?? 0,
    credits_reserved: row.credits_reserved ?? 0,
    created_at: row.created_at,
    invited_at: row.invited_at ?? null,
    activated_at: row.activated_at ?? null,
  };
}

function rowToRequest(row: Record<string, unknown>): RequestRecord {
  return {
    request_id: row.request_id as string,
    api_key: row.api_key as string,
    created_at: row.created_at as number,
    params: JSON.parse(row.params as string),
    appointments: JSON.parse((row.appointments as string) ?? "[]"),
    credit_status: (row.credit_status as "reserved" | "consumed" | "refunded") ?? "consumed",
    credits_count: (row.credits_count as number) ?? 0,
  };
}

// ---- Password Helpers ----

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(":");
    const computed = scryptSync(password, salt, 64);
    return timingSafeEqual(computed, Buffer.from(hash, "hex"));
  } catch {
    return false;
  }
}

// ---- Account Operations ----

export function createAccount(
  partial: Partial<Omit<Account, "api_key" | "created_at" | "credits_reserved" | "invited_at" | "activated_at" | "password_hash">>
): Account {
  const api_key = "lc_" + randomBytes(12).toString("hex");
  const now = Date.now();
  db.prepare(`
    INSERT INTO accounts
      (api_key, email, company_name, company_info, icp, industry, target_role, credits, credits_reserved, created_at, invited_at)
    VALUES
      (@api_key, @email, @company_name, @company_info, @icp, @industry, @target_role, @credits, 0, @created_at, @invited_at)
  `).run({
    api_key,
    email: partial.email ?? null,
    company_name: partial.company_name ?? "",
    company_info: partial.company_info ?? "",
    icp: partial.icp ?? "",
    industry: partial.industry ?? "",
    target_role: partial.target_role ?? "",
    credits: partial.credits ?? 0,
    created_at: now,
    invited_at: partial.email ? now : null,
  });
  return getAccount(api_key)!;
}

export function getAccount(api_key: string): Account | undefined {
  const row = db.prepare("SELECT * FROM accounts WHERE api_key = ?").get(api_key) as AccountRow | undefined;
  return row ? rowToAccount(row) : undefined;
}

export function getAccountByEmail(email: string): Account | undefined {
  const row = db.prepare("SELECT * FROM accounts WHERE email = ?").get(email) as AccountRow | undefined;
  return row ? rowToAccount(row) : undefined;
}

export function updateAccount(
  api_key: string,
  patch: Partial<Omit<Account, "api_key" | "created_at">>
): Account | undefined {
  const account = getAccount(api_key);
  if (!account) return undefined;
  const fields = Object.keys(patch)
    .filter((k) => k !== "api_key" && k !== "created_at")
    .map((k) => `${k} = @${k}`)
    .join(", ");
  if (!fields) return account;
  db.prepare(`UPDATE accounts SET ${fields} WHERE api_key = @api_key`).run({ ...patch, api_key });
  return getAccount(api_key);
}

export function addCredits(api_key: string, amount: number): Account | undefined {
  const info = db.prepare("UPDATE accounts SET credits = credits + ? WHERE api_key = ?").run(amount, api_key);
  if (info.changes === 0) return undefined;
  return getAccount(api_key);
}

export function deductCredits(api_key: string, amount: number): { ok: boolean; remaining: number } {
  const account = getAccount(api_key);
  if (!account) return { ok: false, remaining: 0 };
  if (account.credits < amount) return { ok: false, remaining: account.credits };
  db.prepare(`
    UPDATE accounts
    SET credits = credits - ?, credits_reserved = credits_reserved + ?
    WHERE api_key = ? AND credits >= ?
  `).run(amount, amount, api_key, amount);
  const updated = getAccount(api_key)!;
  return { ok: true, remaining: updated.credits };
}

export function refundCredits(api_key: string, request_id: string): boolean {
  const req = getRequest(request_id);
  if (!req || req.credit_status !== "reserved") return false;
  const refund = db.transaction(() => {
    db.prepare("UPDATE accounts SET credits = credits + ?, credits_reserved = credits_reserved - ? WHERE api_key = ?")
      .run(req.credits_count, req.credits_count, api_key);
    db.prepare("UPDATE requests SET credit_status = 'refunded' WHERE request_id = ?")
      .run(request_id);
  });
  refund();
  return true;
}

export function consumeCredits(api_key: string, request_id: string): boolean {
  const req = getRequest(request_id);
  if (!req || req.credit_status !== "reserved") return false;
  db.prepare(`
    UPDATE accounts SET credits_reserved = credits_reserved - ? WHERE api_key = ?
  `).run(req.credits_count, api_key);
  db.prepare("UPDATE requests SET credit_status = 'consumed' WHERE request_id = ?")
    .run(request_id);
  return true;
}

export function setPassword(api_key: string, password_hash: string): void {
  db.prepare(`
    UPDATE accounts SET password_hash = ?, activated_at = ? WHERE api_key = ?
  `).run(password_hash, Date.now(), api_key);
}

export function listAccounts(): Account[] {
  const rows = db.prepare("SELECT * FROM accounts ORDER BY created_at DESC").all() as AccountRow[];
  return rows.map(rowToAccount);
}

// ---- Request Operations ----

export function putRequest(record: Omit<RequestRecord, "credit_status" | "credits_count"> & Partial<Pick<RequestRecord, "credit_status" | "credits_count">>) {
  db.prepare(`
    INSERT INTO requests (request_id, api_key, created_at, params, appointments, credit_status, credits_count)
    VALUES (@request_id, @api_key, @created_at, @params, @appointments, @credit_status, @credits_count)
    ON CONFLICT(request_id) DO UPDATE SET
      appointments = excluded.appointments,
      credit_status = excluded.credit_status
  `).run({
    request_id: record.request_id,
    api_key: record.api_key,
    created_at: record.created_at,
    params: JSON.stringify(record.params),
    appointments: JSON.stringify(record.appointments ?? []),
    credit_status: record.credit_status ?? "reserved",
    credits_count: record.credits_count ?? record.params.count ?? 0,
  });
}

export function getRequest(request_id: string): RequestRecord | undefined {
  const row = db.prepare("SELECT * FROM requests WHERE request_id = ?").get(request_id) as Record<string, unknown> | undefined;
  return row ? rowToRequest(row) : undefined;
}

export function getAccountRequests(api_key: string): RequestRecord[] {
  const rows = db.prepare("SELECT * FROM requests WHERE api_key = ? ORDER BY created_at DESC").all(api_key) as Record<string, unknown>[];
  return rows.map(rowToRequest);
}

export function getAllRequests(): RequestRecord[] {
  const rows = db.prepare("SELECT * FROM requests ORDER BY created_at DESC").all() as Record<string, unknown>[];
  return rows.map(rowToRequest);
}

export function getAppointment(appointment_id: string): AppointmentRecord | undefined {
  const rows = db.prepare("SELECT appointments FROM requests").all() as { appointments: string }[];
  for (const row of rows) {
    const apts = JSON.parse(row.appointments) as AppointmentRecord[];
    const found = apts.find((a) => a.appointment_id === appointment_id);
    if (found) return found;
  }
  return undefined;
}
