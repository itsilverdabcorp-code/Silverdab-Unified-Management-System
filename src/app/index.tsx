import { useState } from "react";
import { ADUser } from "../.././types";
import AppShell from "../components/Navigations/AppShell"; // adjust to your actual saved path
import AuthScreen from "../app/Auth/AuthScreen"; // adjust to your actual saved path
import {
  authenticateWithAD,
  endADSession,
  refreshADSession,
} from "../app/Auth/Auth";
import { useFonts } from "expo-font";
import EmailPreferenceModal from "../components/common/EmailPreferenceModal"; // adjust to wherever you saved it
import { setupPushNotifications } from "../services/pushNotifications";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    Outfit: require("../components/fonts/Outfit-Regular.ttf"),
    "Outfit-Medium": require("../components/fonts/Outfit-Medium.ttf"),
    "Outfit-SemiBold": require("../components/fonts/Outfit-SemiBold.ttf"),
    "Outfit-Bold": require("../components/fonts/Outfit-Bold.ttf"),
  });

  const [user, setUser] = useState<ADUser | null>(null); // ← moved up, above the early return
  const [showEmailPrefModal, setShowEmailPrefModal] = useState(false);

  if (!fontsLoaded) {
    return null; // or a splash/loading screen
  }

const handleLoginSuccess = (loggedInUser: ADUser, token?: string) => {
  setUser(loggedInUser);
  setShowEmailPrefModal(true);
  console.log("PUSH DEBUG:", { hasToken: !!token, role: loggedInUser.role, officeSupplies: loggedInUser.permissions?.officeSupplies }); // ← add this
  if (
    token &&
    (loggedInUser.role === "superadmin" ||
      loggedInUser.permissions?.officeSupplies)
  ) {
    setupPushNotifications(token);
  }
};
  const handleLogout = () => {
    setUser(null);
  };

  if (!user) {
    return (
      <AuthScreen
        onLoginSuccess={handleLoginSuccess}
        onLogout={handleLogout}
        authenticate={authenticateWithAD}
        refreshUser={refreshADSession}
        onSessionEnd={endADSession}
      />
    );
  }

  return (
    <>
      <AppShell user={user} onLogout={handleLogout} />
      <EmailPreferenceModal
        visible={showEmailPrefModal}
        username={user.username}
        onDone={() => setShowEmailPrefModal(false)}
      />
    </>
  );
}
