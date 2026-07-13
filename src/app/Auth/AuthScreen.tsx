import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Animated,
  Image,
  useWindowDimensions,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ADUser, UserRole } from "../../../types";
import { useTheme } from "../../theme/ThemeContext";
import Svg, { Path, Circle } from "react-native-svg";

const STORAGE_KEY = "AD_USER_DATA";

// ─── Responsive breakpoints ─────────────────────────────────────────────────
const MOBILE_BREAKPOINT = 768; // below this: stack, hide right panel
const SMALL_MOBILE_BREAKPOINT = 380; // below this: tighten paddings/fonts further

function getRoleStyle(role: UserRole): {
  bg: string;
  text: string;
  label: string;
} {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    // "it" is what the AD backend actually returns (getRoleFromGroups).
    // "superadmin" is kept for backward compatibility with older cached data.
    it: { bg: "#1e3a5f", text: "#93c5fd", label: "IT" },
    superadmin: { bg: "#1e3a5f", text: "#93c5fd", label: "Super Admin" },
    admin: { bg: "#3b1f5e", text: "#d8b4fe", label: "Admin" },
    employee: { bg: "#2d3748", text: "#cbd5e0", label: "Employee" },
  };
  return map[role] ?? { bg: "#2d3748", text: "#cbd5e0", label: "Employee" };
}

// ─── Floating label input ──────────────────────────────────────────────────────
function FloatingInput({
  label,
  value,
  onChangeText,
  secureTextEntry,
  showToggle,
  passwordVisible,
  onTogglePassword,
  onSubmitEditing,
  theme,
  compact,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  secureTextEntry?: boolean;
  showToggle?: boolean;
  passwordVisible?: boolean;
  onTogglePassword?: () => void;
  onSubmitEditing?: () => void;
  theme: any;
  compact?: boolean;
}) {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;
  const [focused, setFocused] = useState(false);

  const animate = (toValue: number) =>
    Animated.timing(anim, {
      toValue,
      duration: 180,
      useNativeDriver: false,
    }).start();

  const labelTop = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 6],
  });
  const labelSize = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, 10],
  });
  const labelColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [theme.subtext, theme.iconActive],
  });

  return (
    <View
      style={{
        borderWidth: 1.5,
        borderColor: focused ? theme.iconActive : theme.border,
        borderRadius: 12,
        paddingHorizontal: compact ? 12 : 14,
        paddingTop: 20,
        paddingBottom: 8,
        marginBottom: compact ? 12 : 16,
        backgroundColor: theme.background,
        position: "relative",
        height: 56,
        justifyContent: "flex-end",
      }}
    >
      <Animated.Text
        style={{
          position: "absolute",
          left: compact ? 12 : 14,
          top: labelTop,
          fontSize: labelSize,
          color: labelColor,
          fontWeight: focused || value ? "600" : "400",
          letterSpacing: focused || value ? 0.5 : 0,
          textTransform: focused || value ? "uppercase" : "none",
          pointerEvents: "none",
        }}
      >
        {label}
      </Animated.Text>

      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <TextInput
          style={{
            flex: 1,
            color: theme.text,
            fontSize: 14,
            paddingVertical: 0,
            height: 20,
            paddingRight: showToggle ? 28 : 0,
            ...(Platform.OS === "web" && { outline: "none" }),
          }}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !passwordVisible}
          autoCapitalize="none"
          autoCorrect={false}
          onFocus={() => {
            setFocused(true);
            animate(1);
          }}
          onBlur={() => {
            setFocused(false);
            if (!value) animate(0);
          }}
          onSubmitEditing={onSubmitEditing}
        />
        {showToggle && (
          <TouchableOpacity
            onPress={onTogglePassword}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={{
              width: 28,
              height: 28,
              alignItems: "center",
              justifyContent: "center",
              marginLeft: 4,
            }}
          >
            {passwordVisible ? (
              <Svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.subtext}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                <Path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                <Path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                <Path d="m2 2 20 20" />
              </Svg>
            ) : (
              <Svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                stroke={theme.subtext}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <Path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                <Circle cx={12} cy={12} r={3} />
              </Svg>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}


function IllustrationGraphic({ color }: { color: string }) {
  const line = (
    x: number | string,
    y: number | string,
    w: number | string,
    h = 8,
    opacity = 0.35,
  ) => (
    <View
      style={{
        position: "absolute",
        left: x as any,
        top: y as any,
        width: w as any,
        height: h,
        borderRadius: 4,
        backgroundColor: color,
        opacity,
      }}
    />
  );

  const block = (
    x: number | string,
    y: number | string,
    w: number | string,
    h: number,
    opacity = 0.2,
  ) => (
    <View
      style={{
        position: "absolute",
        left: x as any,
        top: y as any,
        width: w as any,
        height: h,
        borderRadius: 8,
        backgroundColor: color,
        opacity,
      }}
    />
  );

  return (
    <View style={{ width: "100%", height: 360, position: "relative" }}>
      {/* Small circles top-left */}
      {[
        { x: 14, y: 10, r: 14 },
        { x: 42, y: 6, r: 11 },
        { x: 10, y: 40, r: 18 },
        { x: 44, y: 38, r: 13 },
      ].map((c, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: c.x,
            top: c.y,
            width: c.r * 2,
            height: c.r * 2,
            borderRadius: c.r,
            borderWidth: 2,
            borderColor: color,
            opacity: 0.35,
            backgroundColor: "transparent",
          }}
        />
      ))}

      {/* Small squares bottom-right */}
      {[
        { x: 310, y: 282, s: 18 },
        { x: 288, y: 306, s: 24 },
        { x: 318, y: 310, s: 18 },
      ].map((sq, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: sq.x,
            top: sq.y,
            width: sq.s,
            height: sq.s,
            borderRadius: 4,
            borderWidth: 2,
            borderColor: color,
            opacity: 0.35,
            backgroundColor: "transparent",
          }}
        />
      ))}

      {/* Back card — top right */}
      <View
        style={{
          position: "absolute",
          left: 160,
          top: 0,
          width: 220,
          height: 130,
          borderRadius: 14,
          backgroundColor: color,
          opacity: 0.12,
          borderWidth: 1,
          borderColor: `${color}50`,
        }}
      />
      {line(178, 20, 180, 9, 0.3)}
      {line(178, 38, 150, 8, 0.24)}
      {line(178, 54, 165, 8, 0.24)}
      {line(178, 70, 130, 8, 0.2)}
      {line(178, 86, 155, 8, 0.2)}
      {line(178, 102, 140, 8, 0.16)}

      {/* Middle card — large dashboard */}
      <View
        style={{
          position: "absolute",
          left: 60,
          top: 80,
          width: 310,
          height: 190,
          borderRadius: 14,
          backgroundColor: color,
          opacity: 0.12,
          borderWidth: 1,
          borderColor: `${color}50`,
        }}
      />
      {block(76, 98, 60, 72, 0.2)}
      {block(146, 98, 60, 32, 0.2)}
      {block(216, 98, 60, 32, 0.2)}
      {block(146, 138, 130, 30, 0.2)}
      {line(76, 182, 276, 8, 0.24)}
      {line(76, 198, 240, 8, 0.2)}
      {line(76, 214, 260, 8, 0.2)}
      {line(76, 230, 200, 8, 0.16)}

      {/* Front card — bottom left */}
      <View
        style={{
          position: "absolute",
          left: 0,
          top: 172,
          width: 210,
          height: 150,
          borderRadius: 14,
          backgroundColor: color,
          opacity: 0.12,
          borderWidth: 1,
          borderColor: `${color}50`,
        }}
      />
      {line(18, 194, 174, 9, 0.3)}
      {line(18, 212, 155, 8, 0.24)}
      {line(18, 228, 168, 8, 0.24)}
      {line(18, 244, 140, 8, 0.2)}
      {line(18, 260, 160, 8, 0.2)}
      {line(18, 276, 148, 8, 0.16)}
    </View>
  );
}

// ─── Teal Minimal Right Panel ──────────────────────────────────────────────────
// Hidden entirely below the mobile breakpoint to give the form full width.
function RightPanel({ theme }: { theme: any }) {
  if (Platform.OS !== "web") return null;

  const chips = [
    { label: "Inventory", icon: "package" },
    { label: "Requests", icon: "ticket" },
    { label: "Concerns", icon: "info" },
  ];

  const circles = [
    { size: 180, top: -50, right: -50, opacity: 0.1 },
    { size: 100, top: 60, right: 80, opacity: 0.1 },
    { size: 56, top: 30, right: 200, opacity: 0.12 },
    { size: 64, bottom: 80, left: 40, opacity: 0.07 },
    { size: 120, bottom: -40, right: 20, opacity: 0.08 },
  ];

  return (
    <View
      style={{
        flex: 0.55,
        backgroundColor:
          theme.mode === "dark" ? theme.sidebarBg : theme.iconActive,
        overflow: "hidden",
        position: "relative",
        justifyContent: "center",
        paddingHorizontal: 28,
        paddingVertical: 48,
      }}
    >
      {circles.map((c, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            width: c.size,
            height: c.size,
            borderRadius: c.size / 2,
            backgroundColor:
              theme.mode === "dark"
                ? `rgba(53,162,202,${c.opacity * 1.5})`
                : `rgba(255,255,255,${c.opacity})`,
            top: (c as any).top,
            bottom: (c as any).bottom,
            right: (c as any).right,
            left: (c as any).left,
          }}
        />
      ))}

      <View style={{ width: "100%", marginBottom: 32, alignItems: "center" }}>
        <View style={{ width: 400, maxWidth: "100%" }}>
          <IllustrationGraphic
            color={theme.mode === "dark" ? theme.primary : "#ffffff"}
          />
        </View>
      </View>

      {/* Module chips */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 24,
        }}
      >
        {chips.map((chip) => (
          <View
            key={chip.label}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor:
                theme.mode === "dark"
                  ? theme.surfaceRaised
                  : "rgba(255,255,255,0.18)",
              borderWidth: 0.5,
              borderColor:
                theme.mode === "dark"
                  ? theme.borderStrong
                  : "rgba(255,255,255,0.30)",
            }}
          >
            <Svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke={
                theme.mode === "dark"
                  ? theme.primarySubtleText
                  : "rgba(255,255,255,0.92)"
              }
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {chip.icon === "package" && (
                <>
                  <Path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z" />
                  <Path d="M12 22V12" />
                  <Path d="M3.29 7 12 12 20.71 7" />
                  <Path d="m7.5 4.27 9 5.15" />
                </>
              )}
              {chip.icon === "ticket" && (
                <>
                  <Path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z" />
                  <Path d="M13 5v2" />
                  <Path d="M13 17v2" />
                  <Path d="M13 11v2" />
                </>
              )}
              {chip.icon === "info" && (
                <>
                  <Circle cx={12} cy={12} r={10} />
                  <Path d="M12 16v-4" />
                  <Path d="M12 8h.01" />
                </>
              )}
            </Svg>
            <Text
              style={{
                fontSize: 12,
                color:
                  theme.mode === "dark"
                    ? theme.primarySubtleText
                    : "rgba(255,255,255,0.92)",
                fontWeight: "500",
              }}
            >
              {chip.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Tagline */}
      <Text
        style={{
          fontSize: 40,
          fontWeight: "700",
          lineHeight: 40,
          marginBottom: 10,
          color: theme.mode === "dark" ? theme.text : "#ffffff",
        }}
      >
        Hello,{"\n"}Welcome back.
      </Text>

      {/* Description */}
      <Text
        style={{
          fontSize: 15,
          lineHeight: 22,
          color:
            theme.mode === "dark" ? theme.subtext : "rgba(255,255,255,0.72)",
          maxWidth: "80%",
        }}
      >
        Silverdab Unified Management System — your central hub for concerns,
        requests, and inventory.
      </Text>
    </View>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────
// All backend I/O is injected via props so this file has zero knowledge of
// AD/LDAP, Firestore, or any specific server. Swap the backend by passing a
// different `authenticate` (and optional session hooks) from the parent.
type AuthResult = { success: boolean; user?: ADUser; message?: string };

type Props = {
  onLoginSuccess: (user: ADUser) => void;
  onLogout: () => void;

  // REQUIRED: perform the actual login however your new backend works.
  // Should resolve with the fully-populated ADUser (role + permissions included).
  authenticate: (username: string, password: string) => Promise<AuthResult>;

  // OPTIONAL: called after a successful login (e.g. to register a session).
  onSessionStart?: (user: ADUser) => Promise<void> | void;

  // OPTIONAL: called on logout (e.g. to tear down a session).
  onSessionEnd?: (user: ADUser) => Promise<void> | void;

  // OPTIONAL: re-validate/refresh role & permissions for a user restored
  // from local storage (e.g. on page refresh). If omitted, the cached
  // role/permissions are trusted as-is.
  refreshUser?: (user: ADUser) => Promise<ADUser>;
};

export default function AuthScreen({
  onLoginSuccess,
  onLogout,
  authenticate,
  onSessionStart,
  onSessionEnd,
  refreshUser,
}: Props) {
  const { theme, themeMode, setThemeMode } = useTheme();
  const { width } = useWindowDimensions();

  // ── Responsive flags ──
  const isMobile = width < MOBILE_BREAKPOINT;
  const isSmallMobile = width < SMALL_MOBILE_BREAKPOINT;
  const showRightPanel = Platform.OS === "web" && !isMobile;

  const [restoring, setRestoring] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<ADUser | null>(null);
  const [pwVisible, setPwVisible] = useState(false);

  const handleToggleTheme = () => {
    setThemeMode(theme.mode === "dark" ? "light" : "dark");
  };

  useEffect(() => {
    const restoreUser = async () => {
      try {
        const saved = await AsyncStorage.getItem(STORAGE_KEY);
        if (saved) {
          let parsedUser: ADUser = JSON.parse(saved);

          if (refreshUser) {
            parsedUser = await refreshUser(parsedUser);
            await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(parsedUser));
          }

          setUser(parsedUser);
          onLoginSuccess(parsedUser);
        }
      } catch (err) {
        console.error("Restore auth error:", err);
      } finally {
        setRestoring(false);
      }
    };
    restoreUser();
  }, []);

  const handleLogin = async () => {
    setError("");
    if (!username.trim()) {
      setError("Please enter your username.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setLoading(true);
    try {
      const response = await authenticate(username.trim(), password);
      if (response.success && response.user) {
        setUser(response.user);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));
        await onSessionStart?.(response.user);
        onLoginSuccess(response.user);
      } else {
        setError(response.message || "Login failed. Please try again.");
      }
    } catch {
      setError("Cannot reach the server. Make sure the backend is running.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    const outgoingUser = user;
    setUser(null);
    setUsername("");
    setPassword("");
    setError("");
    try {
      if (outgoingUser) {
        await onSessionEnd?.(outgoingUser);
      }
      await AsyncStorage.removeItem(STORAGE_KEY);
      onLogout();
    } catch (err) {
      console.error("Logout storage clear error:", err);
    }
  };

  if (restoring) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.background,
        }}
      >
        <ActivityIndicator color={theme.iconActive} size="large" />
      </View>
    );
  }

  const BRAND = theme.iconActive;

  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        backgroundColor: theme.background,
      }}
    >
      {/* ── Left panel ── */}
      <ScrollView
        style={{ flex: 1, backgroundColor: theme.background }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: isSmallMobile ? 16 : isMobile ? 24 : 32,
          paddingTop: isMobile ? 64 : 32,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme toggle */}
        <TouchableOpacity
          onPress={handleToggleTheme}
          style={{
            position: "absolute",
            top: isSmallMobile ? 12 : 20,
            right: isSmallMobile ? 12 : 20,
            width: isSmallMobile ? 34 : 38,
            height: isSmallMobile ? 34 : 38,
            borderRadius: isSmallMobile ? 17 : 19,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Svg
            width={18}
            height={18}
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.subtext}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {theme.mode === "dark" ? (
              <>
                <Circle cx={12} cy={12} r={4} />
                <Path d="M12 2v2" />
                <Path d="M12 20v2" />
                <Path d="m4.93 4.93 1.41 1.41" />
                <Path d="m17.66 17.66 1.41 1.41" />
                <Path d="M2 12h2" />
                <Path d="M20 12h2" />
                <Path d="m6.34 17.66-1.41 1.41" />
                <Path d="m19.07 4.93-1.41 1.41" />
              </>
            ) : (
              <Path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
            )}
          </Svg>
        </TouchableOpacity>

        <View style={{ width: "100%", maxWidth: isMobile ? 420 : 560 }}>
          {/* Logo */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              marginBottom: isSmallMobile ? 24 : isMobile ? 28 : 36,
              justifyContent: isMobile ? "center" : "flex-start",
            }}
          >
            <Image
              source={
                theme.mode === "dark"
                  ? require("../../components/icons/sdb-logo-white.png")
                  : require("../../components/icons/sdb-logo-black.png")
              }
              style={{
                width: isSmallMobile ? 160 : isMobile ? 190 : 220,
                height: isSmallMobile ? 52 : isMobile ? 62 : 72,
              }}
              resizeMode="contain"
            />
          </View>

          {user ? (
            /* ── Logged-in state ── */
            <>
              <Text
                style={{
                  color: theme.text,
                  fontSize: isSmallMobile ? 19 : 22,
                  fontWeight: "700",
                  marginBottom: 4,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Welcome, {user.displayName.split(" ")[0]}! 👋
              </Text>

              <View
                style={{
                  flexDirection: "row",
                  marginBottom: 16,
                  justifyContent: isMobile ? "center" : "flex-start",
                }}
              >
                <View
                  style={{
                    backgroundColor: getRoleStyle(user.role).bg,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                    borderRadius: 99,
                  }}
                >
                  <Text
                    style={{
                      color: getRoleStyle(user.role).text,
                      fontSize: 10,
                      fontWeight: "600",
                      textTransform: "uppercase",
                      letterSpacing: 0.8,
                    }}
                  >
                    {getRoleStyle(user.role).label}
                  </Text>
                </View>
              </View>

              <View
                style={{
                  backgroundColor: theme.bgActive,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 14,
                  padding: isSmallMobile ? 12 : 16,
                  marginBottom: 14,
                  gap: 10,
                }}
              >
                {[
                  { label: "Full Name", value: user.displayName },
                  { label: "Username", value: user.username },
                  {
                    label: "Email",
                    value: user.email || `${user.username}@ocgbim.com`,
                  },
                  { label: "Department", value: user.department || "—" },
                  ...(user.title
                    ? [{ label: "Title", value: user.title }]
                    : []),
                  ...(user.phone
                    ? [{ label: "Phone", value: user.phone }]
                    : []),
                ].map((row, i, arr) => (
                  <View key={row.label}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 4,
                      }}
                    >
                      <Text style={{ color: theme.subtext, fontSize: 11 }}>
                        {row.label}
                      </Text>
                      <Text
                        style={{
                          color: theme.text,
                          fontSize: 11,
                          fontWeight: "600",
                          textAlign: "right",
                        }}
                      >
                        {row.value}
                      </Text>
                    </View>
                    {i < arr.length - 1 && (
                      <View
                        style={{
                          height: 1,
                          backgroundColor: theme.border,
                          marginTop: 10,
                        }}
                      />
                    )}
                  </View>
                ))}
              </View>

              <View
                style={{
                  backgroundColor: theme.bgActive,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  padding: 12,
                  marginBottom: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: "#4ade80",
                  }}
                />
                <Text style={{ color: BRAND, fontSize: 11, flexShrink: 1 }}>
                  Connected · ocgbim.com
                </Text>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: theme.bgActive,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  paddingVertical: 12,
                  alignItems: "center",
                }}
                onPress={handleLogout}
              >
                <Text
                  style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}
                >
                  Log out
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            /* ── Sign-in form ── */
            <>
              <Text
                style={{
                  color: theme.text,
                  fontSize: isSmallMobile ? 22 : 26,
                  fontWeight: "700",
                  marginBottom: 4,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Sign in
              </Text>
              <Text
                style={{
                  color: theme.subtext,
                  fontSize: 13,
                  marginBottom: isSmallMobile ? 20 : 24,
                  textAlign: isMobile ? "center" : "left",
                }}
              >
                Sign in with your computer login
              </Text>

              {/* Error */}
              {error ? (
                <View
                  style={{
                    backgroundColor: theme.dangerBg,
                    borderWidth: 1,
                    borderColor: theme.dangerBorder,
                    borderRadius: 10,
                    padding: 12,
                    marginBottom: 16,
                  }}
                >
                  <Text style={{ color: theme.dangerText, fontSize: 13 }}>
                    ⚠ {error}
                  </Text>
                </View>
              ) : null}

              <FloatingInput
                label="Username"
                value={username}
                onChangeText={setUsername}
                theme={theme}
                compact={isSmallMobile}
              />

              <FloatingInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                showToggle
                passwordVisible={pwVisible}
                onTogglePassword={() => setPwVisible((v) => !v)}
                onSubmitEditing={handleLogin}
                theme={theme}
                compact={isSmallMobile}
              />

              <TouchableOpacity
                style={{
                  backgroundColor: loading ? theme.primaryDisabled : BRAND,
                  borderRadius: 12,
                  paddingVertical: 13,
                  alignItems: "center",
                  marginTop: 4,
                }}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={theme.primaryText} />
                ) : (
                  <Text
                    style={{
                      color: theme.primaryText,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    Sign in
                  </Text>
                )}
              </TouchableOpacity>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 24,
                  gap: 8,
                }}
              />
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Right panel (Teal Minimal) — hidden on mobile/narrow web views ── */}
      {showRightPanel && <RightPanel theme={theme} />}
    </View>
  );
}