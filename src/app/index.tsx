import { useState } from "react";
import { ADUser } from "../.././types";
import AppShell from "../components/Navigations/AppShell"; // adjust to your actual saved path
import AuthScreen from "../app/Auth/AuthScreen"; // adjust to your actual saved path
import { authenticateWithAD, endADSession, refreshADSession } from "../app/Auth/Auth";
import { useFonts } from "expo-font";


export default function HomeScreen() {
  const [fontsLoaded] = useFonts({
    "Outfit": require("../components/fonts/Outfit-Regular.ttf"),
    "Outfit-Medium": require("../components/fonts/Outfit-Medium.ttf"),
    "Outfit-SemiBold": require("../components/fonts/Outfit-SemiBold.ttf"),
    "Outfit-Bold": require("../components/fonts/Outfit-Bold.ttf"),
  });

  const [user, setUser] = useState<ADUser | null>(null); // ← moved up, above the early return

  if (!fontsLoaded) {
    return null; // or a splash/loading screen
  }

  const handleLoginSuccess = (loggedInUser: ADUser) => {
    setUser(loggedInUser);
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

  return <AppShell user={user} onLogout={handleLogout} />;
}