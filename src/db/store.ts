import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const DATA_FILE = join(DATA_DIR, "store.json");

// ---- Types ----

export type Account = {
  api_key: string;
  company_name: string;
  company_info: string;
  icp: string;
  industry: string;
  target_role: string;
  credits: number;
  created_at: number;
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
};

type Store = {
  accounts: Record<string, Account>;
  requests: Record<string, RequestRecord>;
};

// ---- Internal I/O ----

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function load(): Store {
  ensureDir();
  if (!existsSync(DATA_FILE)) return { accounts: {}, requests: {} };
  try {
    const raw = JSON.parse(readFileSync(DATA_FILE, "utf8")) as Partial<Store>;
    return {
      accounts: raw.accounts ?? {},
      requests: raw.requests ?? {},
    };
  } catch {
    return { accounts: {}, requests: {} };
  }
}

function save(store: Store) {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

// ---- Account operations ----

export function createAccount(partial: Partial<Omit<Account, "api_key" | "created_at">>): Account {
  const store = load();
  const api_key = "lc_" + randomBytes(12).toString("hex");
  const account: Account = {
    api_key,
    company_name: partial.company_name ?? "",
    company_info: partial.company_info ?? "",
    icp: partial.icp ?? "",
    industry: partial.industry ?? "",
    target_role: partial.target_role ?? "",
    credits: partial.credits ?? 0,
    created_at: Date.now(),
  };
  store.accounts[api_key] = account;
  save(store);
  return account;
}

export function getAccount(api_key: string): Account | undefined {
  return load().accounts[api_key];
}

export function updateAccount(
  api_key: string,
  patch: Partial<Omit<Account, "api_key" | "created_at">>
): Account | undefined {
  const store = load();
  const account = store.accounts[api_key];
  if (!account) return undefined;
  Object.assign(account, patch);
  save(store);
  return account;
}

export function addCredits(api_key: string, amount: number): Account | undefined {
  const store = load();
  const account = store.accounts[api_key];
  if (!account) return undefined;
  account.credits += amount;
  save(store);
  return account;
}

export function deductCredits(api_key: string, amount: number): { ok: boolean; remaining: number } {
  const store = load();
  const account = store.accounts[api_key];
  if (!account) return { ok: false, remaining: 0 };
  if (account.credits < amount) return { ok: false, remaining: account.credits };
  account.credits -= amount;
  save(store);
  return { ok: true, remaining: account.credits };
}

export function listAccounts(): Account[] {
  return Object.values(load().accounts);
}

// ---- Request operations ----

export function putRequest(record: RequestRecord) {
  const store = load();
  store.requests[record.request_id] = record;
  save(store);
}

export function getRequest(request_id: string): RequestRecord | undefined {
  return load().requests[request_id];
}

export function getAppointment(appointment_id: string): AppointmentRecord | undefined {
  const store = load();
  for (const req of Object.values(store.requests)) {
    const found = req.appointments.find((a) => a.appointment_id === appointment_id);
    if (found) return found;
  }
  return undefined;
}
