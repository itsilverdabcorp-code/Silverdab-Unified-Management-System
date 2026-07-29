// src/hooks/useEmployees.ts
import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser } from "../../types";

export interface EmployeeOption {
  id: string;   // username — the key stored in assigneeId/requesterId fields
  name: string; // displayName shown in dropdowns
}

const BACKEND_URL = "http://10.10.100.112:3000";
const INTERNAL_SECRET = "silverdab_internal_2024";

let _serviceToken: string | null = null;

// ─── Shared helpers (same pattern as itInventory.ts / officeInventory.ts) ───

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
      headers: { "x-internal-secret": INTERNAL_SECRET },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      token?: string;
      message?: string;
    }>(res);
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

// Maps a snake_case MySQL `users` row -> the EmployeeOption shape dropdowns expect.
// id is keyed by username (matches how AD_USER_DATA / changedById is stored
// everywhere else — assignee fields, audit actor ids, etc.)
function mapRow(row: any): EmployeeOption {
  return {
    id: row.username,
    name: row.display_name ?? row.displayName ?? row.username,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export const useEmployees = () => {
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string | null>(null);

  // Resolve the logged-in AD user from AsyncStorage (set at login by
  // utils/auth.ts) instead of a Firebase Auth listener.
  useEffect(() => {
    const resolveCurrentUser = async () => {
      try {
        const saved = await AsyncStorage.getItem("AD_USER_DATA");
        if (saved) {
          const user: ADUser = JSON.parse(saved);
          setCurrentUserId(user.username ?? null);
          setCurrentUserName(user.displayName ?? user.username ?? null);
        } else {
          setCurrentUserId(null);
          setCurrentUserName(null);
        }
      } catch {
        setCurrentUserId(null);
        setCurrentUserName(null);
      }
    };
    resolveCurrentUser();
  }, []);

  // Fetch all users from the MySQL `users` table for assignee/requester
  // dropdowns. Every synced AD account (employee, admin, it) shows up here —
  // there's no more per-role Firestore collection split.
  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const token = await getServiceToken();
        if (!token) {
          setEmployees([]);
          return;
        }

        const res = await fetch(`${BACKEND_URL}/users`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await readJsonResponse<{
          success?: boolean;
          users?: any[];
          message?: string;
        }>(res);

        if (!res.ok || !data?.success || !Array.isArray(data.users)) {
          console.warn("Users endpoint unavailable, returning empty list.");
          setEmployees([]);
          return;
        }

        setEmployees(data.users.map(mapRow));
      } catch (err) {
        console.error("Failed to fetch employees:", err);
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    };

    fetchEmployees();
  }, []);

  return { employees, loading, currentUserId, currentUserName };
};
