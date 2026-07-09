import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

const STORAGE_KEY = "AD_USER_DATA";
// auth.ts

export async function clearUserSession(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error("Logout error:", err);
  }
}

export async function logout(): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      "Log out",
      "Are you sure you want to log out?",
      [
        { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
        {
          text: "Log out",
          style: "destructive",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(STORAGE_KEY);
            } catch (err) {
              console.error("Logout error:", err);
            }
            resolve(true);
          },
        },
      ]
    );
  });
}