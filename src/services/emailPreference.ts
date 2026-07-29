// Services/emailPreference.ts
//
// Mirrors the pattern used in Services/supplyRequests.ts: service token auth,
// BACKEND_URL, readJsonResponse. Used by the one-time "choose your
// notification email" modal shown after login when the user has no
// notification_email saved yet.

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
    
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// ─── GET preference + suggested options ─────────────────────────────────────

export type EmailPreferenceOptions = {
  current: string | null;
  options: {
    silverdab: string;
    ocgbim: string | null;
  };
};

export async function getEmailPreference(
  username: string,
): Promise<EmailPreferenceOptions | null> {
  try {
    const res = await fetch(
      `${BACKEND_URL}/users/${encodeURIComponent(username)}/email-preference`,
      { headers: await authHeaders(false) },
    );
    const data = await readJsonResponse<{
      success?: boolean;
      current?: string | null;
      options?: { silverdab: string; ocgbim: string | null };
      message?: string;
    }>(res);

    if (!res.ok || !data?.success || !data.options) {
      console.warn("getEmailPreference failed:", data?.message);
      return null;
    }

    return { current: data.current ?? null, options: data.options };
  } catch (err) {
    console.warn("getEmailPreference error:", err);
    return null;
  }
}

// ─── PATCH save chosen preference ────────────────────────────────────────────

export async function saveEmailPreference(
  username: string,
  email: string,
): Promise<void> {
  const res = await fetch(
    `${BACKEND_URL}/users/${encodeURIComponent(username)}/email-preference`,
    {
      method: "PATCH",
      headers: await authHeaders(),
      body: JSON.stringify({ email }),
    },
  );

  const data = await readJsonResponse<{ success?: boolean; message?: string }>(
    res,
  );
  if (!res.ok || !data?.success) {
    throw new Error(data?.message || "Failed to save email preference.");
  }
}
