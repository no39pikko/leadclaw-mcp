import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "..", "data");
const DATA_FILE = join(DATA_DIR, "store.json");

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
  requests: Record<string, RequestRecord>;
};

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function load(): Store {
  ensureDir();
  if (!existsSync(DATA_FILE)) return { requests: {} };
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf8")) as Store;
  } catch {
    return { requests: {} };
  }
}

function save(store: Store) {
  ensureDir();
  writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), "utf8");
}

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
