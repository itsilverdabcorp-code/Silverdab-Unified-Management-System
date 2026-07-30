import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser, UserPermissions } from "../../../types";

// Same backend that /users, /users/sync, /auth/login, /auth/verify live on.
const BACKEND_URL = "http://10.10.100.112:3000";

// Separate from AuthScreen's own "AD_USER_DATA" cache — this is the JWT
// issued by /auth/login, needed as a Bearer token for every other call.
const TOKEN_KEY = "AD_AUTH_TOKEN";
type BackendRole = "superadmin" | "admin" | "employee";

type LoginApiResponse = {
  success: boolean;
  token?: string;
  message?: string;
  user?: {
    username: string;
    displayName: string;
    email: string;
    department: string;
    title: string;
    phone: string;
    role: BackendRole;
  };
};

type AuthResult = { success: boolean; user?: ADUser; message?: string };

const DEFAULT_PERMISSIONS: UserPermissions = {
  itAccess: false,
  itInventory: false,
  consumables: false,
  tickets: false,
  officeSupplies: false,
};

function mapRowToPermissions(row: any): UserPermissions {
  return {
    itAccess: !!row.perm_it_access,
    itInventory: !!row.perm_it_inventory,
    consumables: !!row.perm_consumables,
    tickets: !!row.perm_tickets,
    officeSupplies: !!row.perm_office_supplies,
    fleetControl: !!row.perm_fleet_control,
    fleetDriver: !!row.perm_fleet_driver,
  };
}
async function fetchUserRow(
  username: string,
  token: string,
): Promise<{ role: BackendRole; permissions: UserPermissions } | null> {
  try {
    const res = await fetch(`${BACKEND_URL}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!data.success) return null;

    const row = (data.users as any[]).find(
      (u) => u.username?.toLowerCase() === username.toLowerCase(),
    );
    if (!row) return null;

    return {
      role: (row.role as BackendRole) ?? "employee",
      permissions: mapRowToPermissions(row),
    };
  } catch (err) {
    console.error("Fetch user row error:", err);
    return null;
  }
}

async function getToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

// /auth/login only tells us AD identity + AD-group role. Per-feature
// toggles (itAccess, officeSupplies, etc.) live in MySQL, same table
// UsersPage reads via GET /users. Pull this user's row for that.
async function fetchPermissions(
  username: string,
  token: string,
): Promise<UserPermissions> {
  try {
    const res = await fetch(`${BACKEND_URL}/users`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const data = await res.json();
    if (!data.success) return DEFAULT_PERMISSIONS;

    const row = (data.users as any[]).find(
      (u) => u.username?.toLowerCase() === username.toLowerCase(),
    );
    return row ? mapRowToPermissions(row) : DEFAULT_PERMISSIONS;
  } catch (err) {
    console.error("Fetch permissions error:", err);
    return DEFAULT_PERMISSIONS;
  }
}

// Upserts this user into MySQL so a first-time AD login shows up in
// UsersPage right away instead of waiting for the next "Sync AD".
async function syncUser(
  user: LoginApiResponse["user"],
  token: string,
): Promise<void> {
  try {
    await fetch(`${BACKEND_URL}/users/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ users: [user], resetRoles: false }),
    });
  } catch (err) {
    // Non-fatal — login can still proceed with default permissions.
    console.error("User sync error:", err);
  }
}

/**
 * Pass this as AuthScreen's `authenticate` prop.
 * Verifies credentials against Active Directory (LDAP bind), then merges
 * in the MySQL-stored permission flags for that user.
 */
export async function authenticateWithAD(
  username: string,
  password: string,
): Promise<AuthResult> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ username, password }),
    });
    const data: LoginApiResponse = await res.json();

    if (!data.success || !data.user || !data.token) {
      return {
        success: false,
        message: data.message || "Login failed. Please try again.",
      };
    }

    await AsyncStorage.setItem(TOKEN_KEY, data.token);
    await syncUser(data.user, data.token);

    // Pull role + permissions from MySQL (source of truth), falling back
    // to the AD-derived role only if the user isn't in MySQL yet.
    const row = await fetchUserRow(data.user.username, data.token);

    const user: ADUser = {
      username: data.user.username,
      displayName: data.user.displayName,
      email: data.user.email || `${data.user.username}@ocgbim.com`,
      department: data.user.department || "",
      title: data.user.title || "",
      phone: data.user.phone || "",
      role: row?.role ?? data.user.role,
      permissions: row?.permissions ?? DEFAULT_PERMISSIONS,
    };

    return { success: true, user };
  } catch (err) {
    console.error("AD login error:", err);
    return {
      success: false,
      message: "Cannot reach the server. Make sure the backend is running.",
    };
  }
}

/**
 * Pass this as AuthScreen's `refreshUser` prop.
 * Runs on app restore (cached user found in AsyncStorage) to make sure the
 * JWT is still valid and permissions haven't changed since last login.
 * Throws if the session is no longer valid, which AuthScreen treats as
 * "not logged in" and falls back to the sign-in form.
 */
export async function refreshADSession(user: ADUser): Promise<ADUser> {
  const token = await getToken();
  if (!token) throw new Error("No active session.");

  const verifyRes = await fetch(`${BACKEND_URL}/auth/verify`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const verifyData = await verifyRes.json();
  if (!verifyData.success) throw new Error("Session expired.");

  // Pull role + permissions from MySQL (source of truth), falling back
  // to the previously cached role only if the user isn't in MySQL.
  const row = await fetchUserRow(user.username, token);

  return {
    ...user,
    role: row?.role ?? verifyData.user?.role ?? user.role,
    permissions: row?.permissions ?? user.permissions,
  };
}

/**
 * Pass this as AuthScreen's `onSessionEnd` prop.
 * The JWTs this backend issues are stateless (no server-side session to
 * revoke), so logout just means dropping the cached token locally.
 */
export async function endADSession(_user: ADUser): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}