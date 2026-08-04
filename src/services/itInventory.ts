// Services/itInventory.ts — MySQL implementation
//
// Mirrors Services/officeInventory.ts (service token, BACKEND_URL,
// readJsonResponse). No audit logging — out of scope for now. If you add
// an audit table later, the cleanest place to write those rows is
// server-side inside these same route handlers (you already have
// created_at/updated_at to derive most of it from).

import { ITInventory, NewAssetInput, EditAssetInput } from "../../types";

const BACKEND_URL = "https://ums.silvergraph.ai";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

// ─── Shared helpers ─────────────────────────────────────────────────────────

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
    const data = await readJsonResponse<{
      success?: boolean;
      token?: string;
      message?: string;
    }>(res);
    if (!res.ok || !data?.success || !data.token) {
      console.warn(
        "Service token unavailable, continuing without backend auth.",
      );
      return "";
    }
    _serviceToken = data.token;
    return _serviceToken;
  } catch (err) {
    console.warn("Could not fetch service token:", err);
    return "";
  }
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getServiceToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Maps a snake_case MySQL row -> the camelCase ITInventory shape the UI expects.
function mapRow(row: any): ITInventory {
  return {
    assetTag: row.asset_tag,
    company: row.company ?? "",
    serialNumber: row.serial_number ?? "",
    model: row.model ?? "",
    brand: row.brand ?? "",
    category: row.category,
    status: row.status,
    assigneeId: row.assignee_id ?? "",
    assigneeName: row.assignee_name ?? "",
    location: row.location,
    datePurchased: row.date_purchased
      ? String(row.date_purchased).slice(0, 10)
      : "",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

// ─── READ ───────────────────────────────────────────────────────────────────

export async function getAllAssets(): Promise<ITInventory[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/it-inventory`, {
  headers: {
    Authorization: `Bearer ${token}`,
    
  },
});
    const data = await readJsonResponse<{
      success?: boolean;
      items?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.items)) {
      console.warn("IT inventory endpoint unavailable, returning empty list.");
      return [];
    }

    return data.items.map(mapRow);
  } catch (err) {
    console.warn("getAllAssets error:", err);
    return [];
  }
}

// ─── CREATE ─────────────────────────────────────────────────────────────────

export async function addAsset(input: NewAssetInput): Promise<ITInventory> {
  const res = await fetch(`${BACKEND_URL}/it-inventory`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      assetTag: input.assetTag,
      company: input.company,
      serialNumber: input.serialNumber ?? "",
      model: input.model ?? "",
      brand: input.brand,
      category: input.category,
      status: input.status,
      assigneeId: input.assigneeId ?? "",
      assigneeName: input.assigneeName ?? "",
      location: input.location,
      datePurchased: input.datePurchased || null,
      notes: input.notes ?? "",
    }),
  });

  const data = await readJsonResponse<{
    success?: boolean;
    item?: any;
    message?: string;
  }>(res);

  if (!res.ok || !data?.success || !data.item) {
    // Surfaces backend validation errors, e.g. duplicate asset tag
    throw new Error(data?.message || "Unable to add asset.");
  }
  return mapRow(data.item);
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────
// One call, partial-field update — same shape as updateInventoryItem() in
// Services/officeInventory.ts. Callers (inline table edits, EditAssetModal)
// only send the fields that actually changed.

export async function updateAsset(
  assetTag: string,
  updates: Partial<EditAssetInput>,
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/it-inventory/${encodeURIComponent(assetTag)}`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(updates),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Unable to update asset.");
  }
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function deleteAsset(assetTag: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/it-inventory/${encodeURIComponent(assetTag)}`,
    {
      method: "DELETE",
      headers: await authHeaders(false),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Unable to delete asset.");
  }
}
