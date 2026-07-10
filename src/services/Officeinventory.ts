// Services/officeInventory.ts — MySQL implementation
//
// Mirrors the auth/fetch pattern used in utils/users.ts (service token,
// BACKEND_URL, readJsonResponse). Function signatures are kept identical
// to the old Firestore version, so AddItemModal, EditItemModal,
// AdjustStockModal, AddDeliveryModal, and PartialApprovalModal all work
// unchanged against this file.
//
// NOTE: audit logging (logAudit calls) was removed here since there's no
// audit table in the MySQL schema you shared. If AuditTrailModal needs
// audit rows, the cleanest place to write them is server-side inside the
// same route handlers below (you already have created_at/updated_at on
// office_inventory and stock_transactions to derive most of that from).
//
// NOTE 2: route paths/response shapes below are assumed to follow the same
// REST pattern as your existing /employees, /users, /users/sync endpoints.
// Adjust the URLs/body shapes if your backend differs.

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ADUser,
  EditItemInput,
  NewItemInput,
  OfficeInventoryItem,
  StockStatus,
  StockTransaction,
} from "../../types";

const BACKEND_URL = "https://darkness-hardness-effects.ngrok-free.dev";
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
    "ngrok-skip-browser-warning": "true",
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
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function getCurrentUser(): Promise<{ name: string; id: string }> {
  try {
    const saved = await AsyncStorage.getItem("AD_USER_DATA");
    if (saved) {
      const user: ADUser = JSON.parse(saved);
      return { name: user.displayName, id: user.username };
    }
  } catch {}
  return { name: "Unknown", id: "" };
}

export const computeStockStatus = (
  currentStock: number,
  inStockThreshold: number,
): StockStatus => {
  if (currentStock <= 0) return "out_of_stock";
  if (currentStock <= inStockThreshold) return "low_stock";
  return "in_stock";
};

// Maps a snake_case MySQL row -> the camelCase OfficeInventoryItem shape
// the UI already expects.
function mapRow(row: any): OfficeInventoryItem {
  return {
    id: row.id,
    itemCode: row.item_code,
    name: row.name,
    brand: row.brand ?? "",
    category: row.category,
    unit: row.unit,
    pricePerUnit: Number(row.price_per_unit),
    currentStock: Number(row.current_stock),
    stockStatus: row.stock_status as StockStatus,
    lowStockThreshold: Number(row.low_stock_threshold),
    inStockThreshold: Number(row.in_stock_threshold),
    isActive: !!row.is_active,
    createdAt: row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────
// ─── ADDITIONS to Services/officeInventory.ts ───────────────────────────────
// 1. getAllInventoryItems now takes an optional includeArchived flag.
// 2. New restoreInventoryItem(id) — the undo for archiveInventoryItem(id).
//
// Replace your existing getAllInventoryItems with this version, and add
// restoreInventoryItem anywhere near archiveInventoryItem.

export async function getAllInventoryItems(
  includeArchived = false,
): Promise<OfficeInventoryItem[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const url = `${BACKEND_URL}/office-inventory${
      includeArchived ? "?includeArchived=true" : ""
    }`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      items?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.items)) {
      console.warn(
        "Office inventory endpoint unavailable, returning empty list.",
      );
      return [];
    }

    // Server now does the is_active filtering when includeArchived is
    // omitted/false (see server.js change below), so no client-side
    // filter needed here anymore — but keep it as a defensive fallback
    // in case an older backend build is still deployed.
    const rows = includeArchived
      ? data.items
      : data.items.filter((row) => !!row.is_active);

    return rows.map(mapRow);
  } catch (err) {
    console.warn("getAllInventoryItems error:", err);
    return [];
  }
}

// ─── RESTORE (undo archive) ─────────────────────────────────────────────────

export async function restoreInventoryItem(id: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/office-inventory/${encodeURIComponent(id)}/restore`,
    {
      method: "PATCH",
      headers: await authHeaders(),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to restore item");
  }
}

// ─── CREATE ─────────────────────────────────────────────────────────────────

export async function createInventoryItem(
  input: NewItemInput,
): Promise<OfficeInventoryItem> {
  const lowStockThreshold = input.lowStockThreshold ?? 5;
  const inStockThreshold = input.inStockThreshold ?? 10;
  const user = await getCurrentUser();

  const res = await fetch(`${BACKEND_URL}/office-inventory`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      itemCode: input.itemCode,
      name: input.name,
      brand: input.brand ?? "",
      category: input.category,
      unit: input.unit,
      pricePerUnit: input.pricePerUnit,
      currentStock: input.beginningInventory,
      stockStatus: computeStockStatus(
        input.beginningInventory,
        inStockThreshold,
      ),
      lowStockThreshold,
      inStockThreshold,
      performedByName: user.name,
    }),
  });

  const data = await readJsonResponse<{
    success?: boolean;
    item?: any;
    message?: string;
  }>(res);

  if (!res.ok || !data?.success || !data.item) {
    throw new Error(data?.message || "Unable to create item.");
  }

  return mapRow(data.item);
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

export async function updateInventoryItem(
  id: string,
  updates: EditItemInput,
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/office-inventory/${encodeURIComponent(id)}`,
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
    throw new Error(data?.message || "Unable to update item.");
  }
}

// ─── ARCHIVE ────────────────────────────────────────────────────────────────

export async function archiveInventoryItem(id: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/office-inventory/${encodeURIComponent(id)}/archive`,
    {
      method: "PATCH",
      headers: await authHeaders(),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to archive item");
  }
}

// ─── ADJUST STOCK (deduct) ──────────────────────────────────────────────────

export async function adjustStock(
  itemId: string,
  quantityToDeduct: number,
  date: string,
  reason: string,
  performedByName?: string,
): Promise<void> {
  const user = await getCurrentUser();
  const actor = performedByName ?? user.name;

  const res = await fetch(
    `${BACKEND_URL}/office-inventory/${encodeURIComponent(itemId)}/adjust-stock`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        quantity: quantityToDeduct,
        date,
        reason,
        performedByName: actor,
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    // e.g. backend returns 400 with "Cannot deduct more than current stock."
    throw new Error(data?.message || "Unable to adjust stock.");
  }
}

// ─── ADD DELIVERY (restock) ─────────────────────────────────────────────────

export async function addDelivery(
  itemId: string,
  quantityDelivered: number,
  date: string,
  pricePerUnit: number,
  notes: string,
  performedByName?: string,
): Promise<void> {
  const user = await getCurrentUser();
  const actor = performedByName ?? user.name;

  const res = await fetch(
    `${BACKEND_URL}/office-inventory/${encodeURIComponent(itemId)}/deliver`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        quantity: quantityDelivered,
        date,
        pricePerUnit,
        notes,
        performedByName: actor,
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Unable to record delivery.");
  }
}

// ─── STOCK TRANSACTIONS (used by ActivityPage) ──────────────────────────────

function mapTransactionRow(row: any): StockTransaction {
  return {
    id: row.id,
    itemId: row.item_id,
    itemCode: row.item_code,
    itemName: row.item_name,
    type: row.type,
    quantityChange: Number(row.quantity_change),
    stockBefore: Number(row.stock_before),
    stockAfter: Number(row.stock_after),
    pricePerUnit: Number(row.price_per_unit),
    totalAmount: Number(row.total_amount),
    reason: row.reason ?? "",
    performedByName: row.performed_by_name,
    transactionDate: row.transaction_date
      ? String(row.transaction_date).slice(0, 10)
      : "",
    createdAt: row.created_at ?? "",
  };
}

export async function getAllStockTransactions(): Promise<StockTransaction[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/stock-transactions`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      transactions?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.transactions)) {
      console.warn("Stock transactions endpoint unavailable, returning empty list.");
      return [];
    }

    return data.transactions.map(mapTransactionRow);
  } catch (err) {
    console.warn("getAllStockTransactions error:", err);
    return [];
  }

  
}