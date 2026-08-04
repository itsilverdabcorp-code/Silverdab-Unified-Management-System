// Services/consumablesService.ts — MySQL implementation
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser, ITConsumable } from "../../types";
import { logAudit } from "./auditlogs";

const BACKEND_URL = "https://ums.silvergraph.ai";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

// ─── Shared helpers (same pattern as your other Services/*.ts files) ───────

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

// ─── User helper (same pattern as your Firestore version) ──────────────────

const getCurrentUser = async (): Promise<{ name: string; id: string }> => {
  try {
    const saved = await AsyncStorage.getItem("AD_USER_DATA");
    if (saved) {
      const user: ADUser = JSON.parse(saved);
      return { name: user.displayName, id: user.username };
    }
  } catch {}
  return { name: "Unknown", id: "" };
};

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "—";
  return String(value);
};

// ─── Row mapping (snake_case DB columns -> camelCase ITConsumable) ─────────

type RawConsumableRow = {
  model: string;
  name: string;
  status: ITConsumable["status"];
  location: ITConsumable["location"];
  ip_address: string | null;
  mac_address: string | null;
  black: number;
  photo_black: number;
  cyan: number;
  magenta: number;
  yellow: number;
  maintenance_box: number;
  created_at: string;
  updated_at: string;
};

function mapRow(raw: RawConsumableRow): ITConsumable {
  return {
    id: raw.model,
    model: raw.model,
    name: raw.name,
    status: raw.status,
    location: raw.location,
    ipAddress: raw.ip_address ?? "",
    macAddress: raw.mac_address ?? "",
    black: raw.black,
    photoBlack: raw.photo_black,
    cyan: raw.cyan,
    magenta: raw.magenta,
    yellow: raw.yellow,
    maintenanceBox: raw.maintenance_box,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  } as ITConsumable;
}

// ─── CREATE ───────────────────────────────────────────────────────────────

export const addConsumable = async (
  data: Omit<ITConsumable, "id" | "createdAt" | "updatedAt">,
): Promise<void> => {
  const res = await fetch(`${BACKEND_URL}/it-consumables`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || "Failed to add consumable.");
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────

export const getAllConsumables = async (): Promise<ITConsumable[]> => {
  const res = await fetch(`${BACKEND_URL}/it-consumables`, {
    headers: await authHeaders(),
  });
  const data = await readJsonResponse<{ success?: boolean; items?: RawConsumableRow[] }>(res);
  if (!res.ok || !data?.success || !data.items) {
    console.warn("Failed to fetch consumables, returning empty list.");
    return [];
  }
  return data.items.map(mapRow);
};

// ─── UPDATE FULL ──────────────────────────────────────────────────────────

export const updateConsumable = async (
  serial: string,
  data: Partial<Omit<ITConsumable, "id" | "createdAt">>,
): Promise<void> => {
  const res = await fetch(`${BACKEND_URL}/it-consumables/${encodeURIComponent(serial)}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify(data),
  });
  const result = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || "Failed to update consumable.");
  }
};

// ─── UPDATE SINGLE FIELD (with audit) ────────────────────────────────────

export const updateConsumableField = async (
  serial: string,
  field: string,
  value: string | number,
  changedBy?: string,
  changedById?: string,
): Promise<void> => {
  if (!changedBy) {
    const user = await getCurrentUser();
    changedBy = user.name;
    changedById = user.id;
  }

  // Fetch current value for the audit "old value" — mirrors the Firestore
  // getDoc() call, just via the list endpoint since there's no single-item GET yet.
  let oldValue = "—";
  try {
    const all = await getAllConsumables();
    const current = all.find((c) => c.model === serial);
    if (current) oldValue = formatValue((current as any)[field]);
  } catch {}

  const res = await fetch(`${BACKEND_URL}/it-consumables/${encodeURIComponent(serial)}`, {
    method: "PATCH",
    headers: await authHeaders(),
    body: JSON.stringify({ [field]: value }),
  });
  const result = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || `Failed to update ${field}.`);
  }

  await logAudit({
    table: "consumables",
    recordId: serial,
    recordLabel: serial,
    field,
    oldValue,
    newValue: formatValue(value),
    changedBy: changedBy ?? "Unknown",
    changedById: changedById ?? "",
  });
};

// ─── DELETE ───────────────────────────────────────────────────────────────

export const deleteConsumable = async (serial: string): Promise<void> => {
  const res = await fetch(`${BACKEND_URL}/it-consumables/${encodeURIComponent(serial)}`, {
    method: "DELETE",
    headers: await authHeaders(),
  });
  const result = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || "Failed to delete consumable.");
  }
};
