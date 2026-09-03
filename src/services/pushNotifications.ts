import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const BACKEND_URL = "https://api.silvergraph.ai"; // match your other services
const INTERNAL_SECRET = "silverdab_internal_2024";
const EXPO_PROJECT_ID = "f98cf282-56fe-40e3-9133-5ff96fa4a3fd";

// Same VAPID public key printed by `npx web-push generate-vapid-keys` on the backend.
const VAPID_PUBLIC_KEY = "BIIS-YAqwDFivTHdnE9Omi06kKYzE6yyIT7kfR9FddGe-TXmpvc2MbMV0VmlTIAaNwRUYaCy9y88m0KBc1lAA6o";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Same pattern as getServiceToken() in supplyRequests.ts — uses the backend's
// internal service account rather than the logged-in user's own JWT, so this
// doesn't need any changes to AuthScreen/HomeScreen's login flow.
async function getServiceToken(): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_URL}/auth/service-token`, {
      headers: {
        "x-internal-secret": INTERNAL_SECRET,
        
      },
    });
    const data = await res.json();
    return data?.success ? data.token : "";
  } catch (err) {
    console.warn("Could not fetch service token for push setup:", err);
    return "";
  }
}

// Native (iOS/Android) counterpart to the web push setup below — registers
// for an Expo push token and sends it to POST /push/expo-token, matching
// how the web branch sends its subscription to POST /push/subscribe.
// Reads the JWT the same way AuthScreen.tsx stores it on login — no prop
// needs to be threaded through AppShell/DriverPortalPage for this.
export async function setupExpoPushNotifications() {
  const userToken = await AsyncStorage.getItem("AD_USER_TOKEN");
  if (!Device.isDevice || !userToken) return;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== "granted") {
      console.log("Expo push notification permission not granted.");
      return;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EXPO_PROJECT_ID,
    });

    await fetch(`${BACKEND_URL}/push/expo-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ token: tokenData.data }),
    });

    //console.log("✅ Expo push token registered");
  } catch (err) {
    console.warn("Expo push notification setup failed:", err);
  }
}

export async function setupPushNotifications(userToken: string) {
  // Web push only works in a browser context with service worker support —
  // silently no-op on native (iOS/Android) builds.
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      console.log("Push notification permission not granted.");
      return;
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      });
    }

    if (!userToken) return;

    await fetch(`${BACKEND_URL}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${userToken}`,
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    console.log("✅ Push notifications subscribed");
  } catch (err) {
    console.warn("Push notification setup failed:", err);
  }
}
