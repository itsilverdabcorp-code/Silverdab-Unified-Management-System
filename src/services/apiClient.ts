import AsyncStorage from "@react-native-async-storage/async-storage";

export const BACKEND_URL = "http://10.10.100.112:3000";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await AsyncStorage.getItem("AD_AUTH_TOKEN");

  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  return res;
}