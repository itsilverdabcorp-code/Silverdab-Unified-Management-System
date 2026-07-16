// utils/users.ts
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser, UserPermissions, UserRole } from "../../types";

const BACKEND_URL = "http://10.10.100.112:3000";
const INTERNAL_SECRET = "silverdab_internal_2024";
const CACHE_MINUTES = 10;
const LAST_SYNC_KEY = "USERS_LAST_SYNC";

let _serviceToken: string | null = null;

const DEFAULT_PERMISSIONS: UserPermissions = {
  itAccess: false,
  itInventory: false,
  consumables: false,
  tickets: false,
  officeSupplies: false,
};

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

async function fetchAllADUsers(): Promise<ADUser[]> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/employees`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      employees?: any[];
    }>(res);
    if (!res.ok || !data?.success) return [];

    return (data.employees ?? []).map(
      (u: any): ADUser => ({
        username: u.username ?? "",
        displayName: u.displayName ?? u.username ?? "",
        email: u.email ?? `${u.username}@ocgbim.com`,
        department: u.department ?? "",
        title: u.title ?? "",
        phone: u.phone ?? "",
        role: "employee",
        permissions: DEFAULT_PERMISSIONS,
      }),
    );
  } catch (err) {
    console.warn("fetchAllADUsers error:", err);
    return [];
  }
}

function mapRow(row: any): ADUser & { hasLoggedIn: boolean } {
  return {
    username: row.username,
    displayName: row.display_name ?? row.username,
    email: row.email ?? `${row.username}@ocgbim.com`,
    department: row.department ?? "",
    title: row.title ?? "",
    phone: row.phone ?? "",
    role: (row.role as UserRole) ?? "employee",
    permissions: {
      itAccess: !!row.perm_it_access,
      itInventory: !!row.perm_it_inventory,
      consumables: !!row.perm_consumables,
      tickets: !!row.perm_tickets,
      officeSupplies: !!row.perm_office_supplies,
    },
    hasLoggedIn: !!row.last_login,
  };
}

async function getUsersFromMySQL(): Promise<
  (ADUser & { hasLoggedIn: boolean })[]
> {
  try {
    const token = await getServiceToken();
    if (!token) return [];

    const res = await fetch(`${BACKEND_URL}/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      users?: any[];
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !Array.isArray(data.users)) {
      console.warn("Users endpoint unavailable, returning empty user list.");
      return [];
    }

    return data.users.map(mapRow);
  } catch (err) {
    console.warn("getUsersFromMySQL error:", err);
    return [];
  }
}

// resetRoles defaults false — new users always insert as 'employee' regardless (see backend /users/sync)
async function syncADToMySQL(
  adUsers: ADUser[],
  resetRoles = false,
): Promise<boolean> {
  try {
    const token = await getServiceToken();
    if (!token) return false;

    const res = await fetch(`${BACKEND_URL}/users/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ users: adUsers, resetRoles }),
    });

    const data = await readJsonResponse<{
      success?: boolean;
      message?: string;
    }>(res);
    if (!res.ok || !data?.success) {
      if ([404, 405, 410, 501].includes(res.status)) {
        console.warn(
          "User sync endpoint unavailable, continuing with existing users.",
        );
        return false;
      }

      throw new Error(data?.message || "Sync failed");
    }

    return true;
  } catch (err) {
    console.warn("syncADToMySQL error:", err);
    return false;
  }
}

async function isCacheStale(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return true;
    return (Date.now() - Number(raw)) / 1000 / 60 > CACHE_MINUTES;
  } catch {
    return true;
  }
}
// utils/users.ts

export async function getRoleFromMySQL(username: string): Promise<UserRole | null> {
  try {
    const users = await getUsersFromMySQL();
    const match = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    return match?.role ?? null;
  } catch (err) {
    console.warn("getRoleFromMySQL error:", err);
    return null;
  }
}

export async function loadUsers(
  forceSync = false,
  resetRoles = false,
): Promise<{ users: (ADUser & { hasLoggedIn: boolean })[]; synced: boolean }> {
  const stale = forceSync || (await isCacheStale());

  if (stale) {
    const adUsers = await fetchAllADUsers();
    if (adUsers.length > 0) {
      const synced = await syncADToMySQL(adUsers, resetRoles);
      if (synced) {
        await AsyncStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
        return { users: await getUsersFromMySQL(), synced: true };
      }
    }
  }

  return { users: await getUsersFromMySQL(), synced: false };
}

export async function updateUserPermissions(
  username: string,
  permissions: UserPermissions,
): Promise<void> {
  const token = await getServiceToken();
  const res = await fetch(
    `${BACKEND_URL}/users/${encodeURIComponent(username.toLowerCase().trim())}/permissions`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(permissions),
    },
  );
  const data = await res.json();
  if (!data.success)
    throw new Error(data.message || "Failed to save permissions");
}

export async function updateUserRole(
  username: string,
  role: "admin" | "employee",
): Promise<void> {
  const token = await getServiceToken();
  const res = await fetch(
    `${BACKEND_URL}/users/${encodeURIComponent(username.toLowerCase().trim())}/role`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ role }),
    },
  );
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Failed to update role");
}

export async function clearUsers(): Promise<void> {
  const token = await getServiceToken();
  const res = await fetch(`${BACKEND_URL}/users`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!data.success) throw new Error(data.message || "Failed to clear users");
  await AsyncStorage.removeItem(LAST_SYNC_KEY);
}
