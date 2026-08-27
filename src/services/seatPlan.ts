import { SeatPlanLayout } from "../../types"; // keep whatever relative path already resolves correctly in your project

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "https://api.silvergraph.ai";

async function getAuthToken(): Promise<string> {
  const AsyncStorage = (await import("@react-native-async-storage/async-storage")).default;
  const token = await AsyncStorage.getItem("AD_AUTH_TOKEN");
  if (!token) throw new Error("Not authenticated.");
  return token;
}

async function authedFetch(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.message || `Request failed (${res.status})`);
  }
  return data;
}

export async function getSeatPlanLayout(
  planKey: string,
): Promise<SeatPlanLayout | null> {
  const data = await authedFetch(`/seat-plan/${planKey}`);
  return data.layout ?? null;
}

export async function saveSeatPlanLayout(
  planKey: string,
  layout: SeatPlanLayout,
  updatedByName?: string,
): Promise<void> {
  await authedFetch(`/seat-plan/${planKey}`, {
    method: "POST",
    body: JSON.stringify({ layout, updatedByName }),
  });
}