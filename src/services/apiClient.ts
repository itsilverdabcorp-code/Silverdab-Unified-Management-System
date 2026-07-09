import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKEND_URL = "https://darkness-hardness-effects.ngrok-free.dev";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem("AD_AUTH_TOKEN");

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      "ngrok-skip-browser-warning": "true",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  return res;
}