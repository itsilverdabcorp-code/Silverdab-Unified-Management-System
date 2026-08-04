const BACKEND_URL = "https://ums.silvergraph.ai"; // match your other services
const INTERNAL_SECRET = "silverdab_internal_2024";

// Same VAPID public key printed by `npx web-push generate-vapid-keys` on the backend.
const VAPID_PUBLIC_KEY = "BIIS-YAqwDFivTHdnE9Omi06kKYzE6yyIT7kfR9FddGe-TXmpvc2MbMV0VmlTIAaNwRUYaCy9y88m0KBc1lAA6o";

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

export async function setupPushNotifications() {
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

    const token = await getServiceToken();
    if (!token) return;

    await fetch(`${BACKEND_URL}/push/subscribe`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        
      },
      body: JSON.stringify({ subscription: subscription.toJSON() }),
    });

    console.log("✅ Push notifications subscribed");
  } catch (err) {
    console.warn("Push notification setup failed:", err);
  }
}
