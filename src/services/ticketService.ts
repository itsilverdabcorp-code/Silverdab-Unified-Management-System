// Services/ticketService.ts — MySQL implementation
//
// Mirrors the pattern used in Services/officeInventory.ts and
// Services/supplyRequests.ts (MySQL versions): service token auth,
// BACKEND_URL, readJsonResponse, snake_case -> camelCase row mapping.
// Function signatures match the old Firestore version 1:1, so
// TicketHubPage.tsx, ITConcernModal, and any tickets admin page keep
// working unchanged against this file.
//
// NOTE: audit logging (logAudit calls, including the old
// updateTicketField "fetch old value, diff, then logAudit" dance) was
// removed here, same reasoning as officeInventory.ts — no audit table
// in the MySQL schema yet. If you want audit rows for ticket field
// changes, the cleanest place is server-side inside the PATCH route
// handler (it already has the old row before applying the update, so
// it can diff there instead of the client doing a round-trip fetch
// first).
//
// NOTE 2: endpoint paths are assumed to follow the same REST convention
// as /office-inventory and /supply-requests. Adjust the URLs below if
// your backend routes differ. In particular, getTicketsByRequester is
// assumed to be a query param (?requesterId=...) rather than a
// client-side filter — much cheaper than pulling every ticket, unlike
// the Firestore version which had a real `where()` clause server-side
// already, so this keeps that same efficiency.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser, ConcernTicket } from "../../types";

const BACKEND_URL = "https://ums.silvergraph.ai";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

// ─── Shared helpers (identical to officeInventory.ts / supplyRequests.ts) ───

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
// Adjust field names here if your `concern_tickets` table columns differ
// from this guess. Everything downstream (TicketHubPage, modals) only
// cares about the camelCase shape coming out of this function.

function mapRow(row: any): ConcernTicket {
  return {
    id: row.id ?? row.ticket_number,
    ticketNumber: row.ticket_number,
    summary: row.summary,
    category: row.category ?? "",
    priority: row.priority ?? "",
    status: row.status ?? "Pending",
    assigneeId: row.assignee_id ?? null,
    assigneeName: row.assignee_name ?? "",
    requesterId: row.requester_id,
    requesterName: row.requester_name ?? "",
    details: row.details ?? "",
    dueDate: row.due_date ?? "",
    dateCreated: row.date_created ?? row.created_at ?? "",
    updatedAt: row.updated_at ?? "",
  } as ConcernTicket;
}

// ─── CREATE ─────────────────────────────────────────────────────────────────

export const addTicket = async (
  data: Omit<ConcernTicket, "id" | "dateCreated" | "dueDate"> & {
    dueDate: Date | string;
    dateCreated?: Date | string;
  },
): Promise<void> => {
  const res = await fetch(`${BACKEND_URL}/tickets`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({
      ...data,
      dueDate:
        data.dueDate instanceof Date
          ? data.dueDate.toISOString()
          : data.dueDate,
    }),
  });

  const result = await readJsonResponse<{
    success?: boolean;
    message?: string;
  }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || "Unable to create ticket.");
  }
};

// ─── READ ALL ─────────────────────────────────────────────────────────────────

export const getAllTickets = async (): Promise<ConcernTicket[]> => {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/tickets`, {
      headers: {
        Authorization: `Bearer ${token}`,
        
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      tickets?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.tickets)) {
      console.warn("Tickets endpoint unavailable, returning empty list.");
      return [];
    }

    return data.tickets.map(mapRow);
  } catch (err) {
    console.warn("getAllTickets error:", err);
    return [];
  }
};

// ─── READ BY REQUESTER ────────────────────────────────────────────────────────

export const getTicketsByRequester = async (
  requesterId: string,
): Promise<ConcernTicket[]> => {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(
      `${BACKEND_URL}/tickets?requesterId=${encodeURIComponent(requesterId)}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          
        },
      },
    );
    const data = await readJsonResponse<{
      success?: boolean;
      tickets?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.tickets)) {
      console.warn("Tickets endpoint unavailable, returning empty list.");
      return [];
    }

    return data.tickets.map(mapRow);
  } catch (err) {
    console.warn("getTicketsByRequester error:", err);
    return [];
  }
};

// ─── UPDATE FULL TICKET (batch modal save) ─────────────────────────────────

export const updateTicket = async (
  ticketNumber: string,
  data: Partial<Omit<ConcernTicket, "id" | "ticketNumber" | "dateCreated">>,
): Promise<void> => {
  const payload: any = { ...data };
  if (payload.dueDate instanceof Date) {
    payload.dueDate = payload.dueDate.toISOString();
  }

  const res = await fetch(
    `${BACKEND_URL}/tickets/${encodeURIComponent(ticketNumber)}`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    },
  );

  const result = await readJsonResponse<{
    success?: boolean;
    message?: string;
  }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || "Unable to update ticket.");
  }
};

// ─── UPDATE SINGLE FIELD ──────────────────────────────────────────────────────
// The old Firestore version fetched the old value client-side, diffed it,
// and wrote its own audit row. Without an audit table, this just applies
// the field update; if/when audit logging is added, do the diff server-side
// in this route handler instead of round-tripping a GET first.

export const updateTicketField = async (
  ticketNumber: string,
  field: string,
  value: any,
  changedBy?: string,
  changedById?: string,
): Promise<void> => {
  if (!changedBy) {
    const user = await getCurrentUser();
    changedBy = user.name;
    changedById = user.id;
  }

  let updateValue = value;
  if (field === "dueDate" && value instanceof Date) {
    updateValue = value.toISOString();
  }

  const res = await fetch(
    `${BACKEND_URL}/tickets/${encodeURIComponent(ticketNumber)}/field`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({
        field,
        value: updateValue,
        changedBy,
        changedById,
      }),
    },
  );

  const result = await readJsonResponse<{
    success?: boolean;
    message?: string;
  }>(res);
  if (!res.ok || !result?.success) {
    throw new Error(result?.message || "Unable to update ticket field.");
  }
};
