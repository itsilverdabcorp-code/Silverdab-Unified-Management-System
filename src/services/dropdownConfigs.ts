// Services/dropdownConfigs.ts — MySQL implementation
//
// Same auth/fetch pattern as officeInventory.ts and supplyRequests.ts:
// service token, BACKEND_URL, readJsonResponse. Duplicated inline rather
// than pulled from a shared module, since that's the pattern the rest of
// your Services/*.ts files already use.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser } from "../../types";

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

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getServiceToken();
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    "ngrok-skip-browser-warning": "true",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── Types ──────────────────────────────────────────────────────────────────

export type DropdownOption = {
  label: string;
  value: string;
  bgColor: string;
  textColor: string;
  // badgeClass kept optional for backward-compat with any component still
  // reading it; new/edited components should render bgColor/textColor as
  // inline styles instead, since superadmin-added options can be any color
  // and can't map onto a fixed set of pre-defined Tailwind classes.
  badgeClass?: string;
};

type DropdownConfigShape = Record<string, Record<string, DropdownOption[]>>;

// ─── Fetch all configs, grouped by module → field ──────────────────────────
// `defaults` is your existing fallback shape, e.g.:
//   { inventory: { status: [...], category: [...], location: [...], company: [...] },
//     ticket: { status: [], category: [], priority: [] },
//     consumable: { status: [], location: [] } }
// On any failure this returns `defaults` unchanged, same safety net the
// Firestore version had.
export async function getAllDropdownConfigs<T extends DropdownConfigShape>(
  defaults: T,
): Promise<T> {
  try {
    const token = await getServiceToken();
    if (!token) return defaults;

    const res = await fetch(`${BACKEND_URL}/dropdown-configs`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
    });
    const data = await readJsonResponse<{
      success?: boolean;
      configs?: DropdownConfigShape;
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !data.configs) {
      console.warn("Dropdown configs endpoint unavailable, using defaults.");
      return defaults;
    }

    // Merge fetched configs over defaults so any module/field the backend
    // doesn't have rows for yet still falls back gracefully instead of
    // rendering an empty dropdown.
    const merged = { ...defaults } as T;
    for (const moduleKey of Object.keys(data.configs)) {
      merged[moduleKey as keyof T] = {
        ...(merged[moduleKey as keyof T] as any),
        ...data.configs[moduleKey],
      } as any;
    }
    return merged;
  } catch (err) {
    console.warn("getAllDropdownConfigs error:", err);
    return defaults;
  }
}

// ─── Save (replace) the option list for one module + field ────────────────
// Call this from ManageColumnsModal's onSave, once per column whose options
// actually changed. Superadmin-only — the backend enforces this via the
// JWT's role claim; this is a UX guard, not the real security boundary.
export async function saveDropdownOptions(
  module: string,
  field: string,
  options: DropdownOption[],
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/dropdown-configs/${encodeURIComponent(module)}/${encodeURIComponent(field)}`,
    {
      method: "PUT",
      headers: await authHeaders(),
      body: JSON.stringify({
        options: options.map((o) => ({
          label: o.label,
          value: o.value,
          bgColor: o.bgColor,
          textColor: o.textColor,
        })),
      }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(res);
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to save dropdown options.");
  }
}
