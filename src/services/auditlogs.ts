// Services/auditLog.ts — MySQL implementation
// Same auth/fetch pattern as your other Services/*.ts files.

const BACKEND_URL = "http://10.10.100.112:3000";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

async function readJsonResponse<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function getServiceToken(): Promise<string> {
  if (_serviceToken) return _serviceToken;
  try {
    const res = await fetch(`${BACKEND_URL}/auth/service-token`, {
  headers: {
    "x-internal-secret": INTERNAL_SECRET,
    
  },
});
    const data = await readJsonResponse<{ success?: boolean; token?: string }>(res);
    if (!res.ok || !data?.success || !data.token) {
      console.warn("Service token unavailable, continuing without backend auth.");
      return "";
    }
    _serviceToken = data.token;
    return _serviceToken;
  } catch (err) {
    console.warn("Could not fetch service token:", err);
    return "";
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getServiceToken();
  return {
    "Content-Type": "application/json",
    
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuditTable = "inventory" | "consumables" | "tickets" | "office_inventory" | "supply_requests";

export type AuditFieldChange = {
  field: string;
  oldValue: string;
  newValue: string;
};

export type AuditBatchEntry = {
  id?: string;
  table: AuditTable;
  recordId: string;
  recordLabel: string;
  changes: AuditFieldChange[];
  changedBy: string;
  changedById: string;
  timestamp: string | null; // ISO string from MySQL DATETIME
  entryType: "batch";
};

export type AuditEntry = {
  id?: string;
  table: AuditTable;
  recordId: string;
  recordLabel: string;
  field: string;
  oldValue: string;
  newValue: string;
  changedBy: string;
  changedById: string;
  timestamp: string | null;
  entryType?: "single";
};

export type AnyAuditEntry = AuditEntry | AuditBatchEntry;

type RawAuditRow = {
  id: number;
  module: AuditTable;
  record_id: string;
  record_label: string;
  entry_type: "single" | "batch";
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  changes: AuditFieldChange[] | null;
  performed_by_name: string;
  performed_by_username: string;
  created_at: string;
};

function mapRow(raw: RawAuditRow): AnyAuditEntry {
  const base = {
    id: String(raw.id),
    table: raw.module,
    recordId: raw.record_id,
    recordLabel: raw.record_label,
    changedBy: raw.performed_by_name,
    changedById: raw.performed_by_username,
    timestamp: raw.created_at,
  };

  if (raw.entry_type === "batch") {
    return { ...base, entryType: "batch", changes: raw.changes ?? [] };
  }

  return {
    ...base,
    entryType: "single",
    field: raw.field_name ?? "",
    oldValue: raw.old_value ?? "",
    newValue: raw.new_value ?? "",
  };
}

// ─── Write — single field (legacy / inline edits) ─────────────────────────────

export const logAudit = async (
  entry: Omit<AuditEntry, "id" | "timestamp">,
): Promise<void> => {
  try {
    const res = await fetch(`${BACKEND_URL}/audit-logs`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(entry),
    });
    const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
    if (!res.ok || !data?.success) {
      console.error(
        "[audit] Failed to write audit log:",
        "status:", res.status,
        "data:", JSON.stringify(data),
      );
    }
  } catch (err) {
    console.error("[audit] Failed to write audit log (fetch threw):", err);
  }
};

// ─── Write — batch (Edit modal saves) ─────────────────────────────────────────

export const logAuditBatch = async (
  entry: Omit<AuditBatchEntry, "id" | "timestamp" | "entryType">,
): Promise<void> => {
  if (!entry.changes.length) return; // nothing changed — skip
  try {
    const res = await fetch(`${BACKEND_URL}/audit-logs/batch`, {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify(entry),
    });
    const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
    if (!res.ok || !data?.success) {
      console.error("[audit] Failed to write batch audit log:", data?.message);
    }
  } catch (err) {
    console.error("[audit] Failed to write batch audit log:", err);
  }
};

// ─── Read ─────────────────────────────────────────────────────────────────────

export const getAuditLogs = async (
  table: AuditTable,
  maxEntries = 200,
  recordId?: string,
): Promise<AnyAuditEntry[]> => {
  try {
    const params = new URLSearchParams({ limit: String(maxEntries) });
    if (recordId) params.set("recordId", recordId);

    const res = await fetch(`${BACKEND_URL}/audit-logs/${table}?${params.toString()}`, {
      headers: await authHeaders(),
    });
    const data = await readJsonResponse<{ success?: boolean; entries?: RawAuditRow[] }>(res);
    if (!res.ok || !data?.success || !data.entries) {
      console.warn("Failed to fetch audit logs, returning empty list.");
      return [];
    }
    return data.entries.map(mapRow);
  } catch (err) {
    console.error("[audit] Failed to fetch audit logs:", err);
    return [];
  }
};

// ─── Type guards ──────────────────────────────────────────────────────────────

export const isBatchEntry = (e: AnyAuditEntry): e is AuditBatchEntry =>
  (e as AuditBatchEntry).entryType === "batch";

export const isSingleEntry = (e: AnyAuditEntry): e is AuditEntry =>
  !isBatchEntry(e);
