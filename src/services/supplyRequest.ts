// Services/supplyRequests.ts — MySQL implementation
//
// Mirrors the pattern used in Services/officeInventory.ts (MySQL version):
// service token auth, BACKEND_URL, readJsonResponse, snake_case -> camelCase
// row mapping. Function signatures match the old Firestore version 1:1,
// so SupplyRequestsPage.tsx, PartialApprovalModal, RejectModal, and
// FailedDeliveryModal all work unchanged against this file.
//
// NOTE: audit logging (logAudit) was intentionally omitted, same reasoning
// as officeInventory.ts — no audit table in the MySQL schema yet. If you
// want audit rows for approve/reject/deliver/fail, write them server-side
// in the corresponding route handlers below.
//
// NOTE 2: endpoint paths are assumed to follow the same REST convention as
// /office-inventory/:id/adjust-stock, /office-inventory/:id/deliver, etc.
// Adjust the URLs below if your backend routes differ.
//
// NOTE 3: confirmed schema is two real tables — supply_requests (parent)
// and supply_request_items (child, FK request_id). GET /supply-requests
// is expected to join and nest items per request; POST /supply-requests
// is expected to insert one supply_requests row plus one
// supply_request_items row per line in the `items` array below.
//
// NOTE 4: your status enum includes both 'delivered' and 'resolved' as
// distinct values, but this file (and SupplyRequestsPage.tsx) only ever
// sets/reads 'resolved' as the terminal "done" state — markDelivered()
// jumps straight from 'out_for_delivery' to 'resolved', so 'delivered'
// is currently unused by the frontend. If you want a real two-step
// out_for_delivery -> delivered -> resolved flow (e.g. courier marks
// delivered, then requester/admin confirms receipt as resolved), that
// needs a UI change too — happy to build that out if it's what you want.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser, SupplyRequest, SupplyRequestStatus } from "../../types";

const BACKEND_URL = "https://darkness-hardness-effects.ngrok-free.dev";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

// ─── Shared helpers (identical to officeInventory.ts) ──────────────────────

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

// ─── Row mapping ────────────────────────────────────────────────────────────
// supply_requests and supply_request_items are two real tables (one-to-many
// on request_id), not a JSON column. The backend is expected to join them
// and return each request with a nested `items` array — each item row still
// in snake_case (item_id, item_name, item_code, quantity_requested,
// stock_status_at_request) matching the supply_request_items columns
// directly. mapItemRow below converts each of those to the camelCase shape
// the UI (SupplyRequestsPage, PartialApprovalModal, DetailDrawer, etc.)
// already expects.

function mapItemRow(item: any) {
  const rawApproved = item.quantity_approved ?? item.quantityApproved;
  return {
    itemId: item.item_id ?? item.itemId,
    itemName: item.item_name ?? item.itemName,
    itemCode: item.item_code ?? item.itemCode,
    category: item.category,
    quantityRequested: Number(item.quantity_requested ?? item.quantityRequested),
    quantityApproved:
      rawApproved === null || rawApproved === undefined
        ? null
        : Number(rawApproved),
    stockStatusAtRequest: item.stock_status_at_request ?? item.stockStatusAtRequest,
  };
}

function mapRow(row: any): SupplyRequest {
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    requestedById: row.requested_by_id ?? "",
    requestedByName: row.requested_by_name,
    items: Array.isArray(row.items) ? row.items.map(mapItemRow) : [],
    status: (row.status ?? "pending") as SupplyRequestStatus,
    notes: row.notes ?? "",
    rejectionReason: row.rejection_reason ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedByName: row.reviewed_by_name ?? null,
    reviewedAt: row.reviewed_at ?? null,
    createdAt: row.created_at ?? "",
    resolvedAt: row.resolved_at ?? null,
    approvedAt: row.approved_at ?? undefined,
    approvedByName: row.approved_by_name ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    deliveredByName: row.delivered_by_name ?? undefined,
    failedReason: row.failed_reason ?? undefined,
    failedAt: row.failed_at ?? undefined,
  };
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function getAllSupplyRequests(): Promise<SupplyRequest[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/supply-requests`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      requests?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.requests)) {
      console.warn("Supply requests endpoint unavailable, returning empty list.");
      return [];
    }

    return data.requests.map(mapRow);
  } catch (err) {
    console.warn("getAllSupplyRequests error:", err);
    return [];
  }
}

// ─── CREATE (employee submit) ───────────────────────────────────────────────

export async function submitSupplyRequest(payload: {
  requestedById: string;
  requestedByName: string;
  items: {
    itemId: string;
    itemName: string;
    itemCode: string;
    category: string;
    quantityRequested: number;
    stockStatusAtRequest: string;
  }[];
  notes: string;
}): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/supply-requests`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(payload),
  });

  const data = await readJsonResponse<{
    success?: boolean;
    ticketNumber?: string;
    message?: string;
  }>(res);

  if (!res.ok || !data?.success || !data.ticketNumber) {
    throw new Error(data?.message || "Unable to submit supply request.");
  }

  return data.ticketNumber;
}

// ─── APPROVE (full) ─────────────────────────────────────────────────────────

export async function approveSupplyRequest(requestId: string): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(requestId)}/approve`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ approvedByName: user.name, approvedById: user.id }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to approve request.");
  }
}

// ─── APPROVE (partial) ──────────────────────────────────────────────────────

export async function approveSupplyRequestPartial(
  requestId: string,
  lines: { itemId: string; qtyToDispense: number }[],
): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(requestId)}/approve-partial`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        lines,
        approvedByName: user.name,
        approvedById: user.id,
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to approve request.");
  }
}

// ─── REJECT ─────────────────────────────────────────────────────────────────

export async function rejectSupplyRequest(
  requestId: string,
  reason: string,
): Promise<void> {
  const user = await getCurrentUser();

  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(requestId)}/reject`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({
        reason,
        reviewedByName: user.name,
        reviewedById: user.id,
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to reject request.");
  }
}

// ─── DELIVER ────────────────────────────────────────────────────────────────

export async function markDelivered(id: string, byName: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(id)}/deliver`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ deliveredByName: byName }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to mark as delivered.");
  }
}

// ─── FAILED DELIVERY ────────────────────────────────────────────────────────

export async function markFailedDelivery(
  id: string,
  reason: string,
  byName: string,
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(id)}/fail`,
    {
      method: "POST",
      headers: await authHeaders(),
      body: JSON.stringify({ reason, deliveredByName: byName }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to update delivery status.");
  }
}

// ─── ARCHIVE ────────────────────────────────────────────────────────────────

export async function archiveSupplyRequest(id: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(id)}/archive`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to archive request.");
  }
}

export async function unarchiveSupplyRequest(id: string): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/supply-requests/${encodeURIComponent(id)}/unarchive`,
    {
      method: "POST",
      headers: await authHeaders(),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to unarchive request.");
  }
}