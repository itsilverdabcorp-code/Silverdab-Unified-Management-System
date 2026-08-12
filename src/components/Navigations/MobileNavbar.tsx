import React, { useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  Animated,
  Easing,
  ScrollView,
} from "react-native";
import { getNavColors, getNavSectionsForUser, NavItem } from "./NavItems";
import { useTheme } from "../../theme/ThemeContext";
import { ADUser } from "../../../types";
import { LogOut, Sun, Moon, Monitor, Settings, Menu, X } from "lucide-react-native";
import LogoutModal from "../../app/Auth/LogoutModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const STORAGE_KEY = "AD_USER_DATA";

type MobileNavbarProps = {
  user: ADUser;
  activeKey: string;
  onNavigate: (key: string) => void;
  onLogout: () => void;
};

export const DRAWER_W = 260;
export const HEADER_H = 56;

const THEME_CYCLE = ["light", "dark", "system"] as const;
type ThemeMode = (typeof THEME_CYCLE)[number];

const THEME_META: Record<
  ThemeMode,
  { label: string; Icon: typeof Sun; next: ThemeMode }
> = {
  light: { label: "Light", Icon: Sun, next: "dark" },
  dark: { label: "Dark", Icon: Moon, next: "system" },
  system: { label: "System", Icon: Monitor, next: "light" },
};

// ── Mobile top bar + slide-in drawer ────────────────────────────────────────
// Meant to replace Sidebar entirely below the responsive breakpoint (see
// AppShell). Renders a fixed/absolute top header with a hamburger button,
// and a full-height drawer that slides in from the left over a dimmed
// backdrop. Shares the same nav config, theming, and logout flow as
// Sidebar so behavior stays consistent between layouts.
export default function MobileNavbar({
  user,
  activeKey,
  onNavigate,
  onLogout,
}: MobileNavbarProps) {
  const [open, setOpen] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const { theme, themeMode, setThemeMode } = useTheme();
  const C = getNavColors(theme);
  const insets = useSafeAreaInsets();

  const normalizedUser: ADUser = {
    ...user,
    permissions: {
      itAccess:
        Boolean(user.permissions?.itAccess) ||
        Boolean(user.permissions?.itInventory) ||
        Boolean(user.permissions?.consumables) ||
        Boolean(user.permissions?.tickets),
      itInventory: user.permissions?.itInventory ?? false,
      consumables: user.permissions?.consumables ?? false,
      tickets: user.permissions?.tickets ?? false,
      officeSupplies: Boolean(
        user.permissions?.officeSupplies ||
        (user.permissions as any)?.officesupplies,
      ),
    },
  };

  const sections = getNavSectionsForUser(normalizedUser);

  const translateX = useRef(new Animated.Value(-DRAWER_W)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const openDrawer = () => {
    setOpen(true);
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = () => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: -DRAWER_W,
        duration: 200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setOpen(false);
      setSettingsOpen(false);
    });
  };

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Logout storage error:", err);
    }
    onLogout();
  };

  const handleThemeCycle = () => {
    const next = THEME_META[themeMode as ThemeMode]?.next ?? "light";
    setThemeMode(next);
  };

  const currentTheme = THEME_META[themeMode as ThemeMode] ?? THEME_META.system;
  const ThemeIcon = currentTheme.Icon;

  const handleNavItemPress = (item: NavItem) => {
    if (
      Platform.OS === "web" &&
      typeof window !== "undefined" &&
      window.history?.pushState &&
      window.location.pathname !== item.href
    ) {
      window.history.pushState({}, "", item.href);
    }
    onNavigate(item.key);
    closeDrawer();
  };

  const renderNavItem = (item: NavItem) => {
    const isActive = item.key === activeKey;
    const Icon = item.icon;

    return (
      <TouchableOpacity
        key={item.key}
        onPress={() => handleNavItemPress(item)}
        activeOpacity={0.7}
        style={{
          position: "relative",
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          marginHorizontal: 8,
          marginVertical: 2,
          paddingHorizontal: 12,
          paddingVertical: 12,
          borderRadius: 10,
          backgroundColor: isActive ? theme.bgActive : "transparent",
        }}
      >
        {isActive && (
          <View
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              marginTop: -11,
              width: 3,
              height: 22,
              borderTopLeftRadius: 3,
              borderBottomLeftRadius: 3,
              backgroundColor: C.activeBar,
            }}
          />
        )}
        <View style={{ flexShrink: 0, alignItems: "center", justifyContent: "center" }}>
          <Icon color={isActive ? C.iconActive : C.iconInactive} size={23} />
        </View>
        <Text
          numberOfLines={1}
          style={{
            fontFamily: isActive ? "Outfit-medium" : "Outfit",
            fontSize: 15.5,
            letterSpacing: -0.1,
            color: isActive ? C.textActive : C.textInactive,
          }}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      {/* ── Fixed top header ── */}
      <View
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
          top: 0,
          left: 0,
          right: 0,
          height: HEADER_H + insets.top,
          paddingTop: insets.top,
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 12,
          backgroundColor: theme.sidebarBg,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.navBorder,
          zIndex: 100,
          elevation: 100,
        }}
      >
        {/* Center: logo + title, absolutely centered on the header regardless of left/right content width */}
        {/* Rendered BEFORE the hamburger below so it paints underneath it, not on top — a later
            sibling in RN's render order draws over earlier ones regardless of pointerEvents,
            and "none" isn't always reliably passed through to touch hit-testing on Android/web. */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            zIndex: 0,
          }}
          pointerEvents="box-none"
        >
          <Image
            source={require("../icons/silverdab-logo.png")}
            style={{ width: 26, height: 26 }}
            resizeMode="contain"
          />
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 15,
              color: C.textActive,
              letterSpacing: -0.3,
            }}
          >
            Silverdab
          </Text>
        </View>

        {/* Left: hamburger — rendered AFTER the center block so it's on top and always tappable */}
        <View style={{ width: 36, alignItems: "flex-start", zIndex: 1 }}>
          <TouchableOpacity
            onPress={openDrawer}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Menu color={C.iconActive} size={22} />
          </TouchableOpacity>
        </View>

        {/* Right: empty spacer matching the hamburger's width to balance the row */}
        <View style={{ width: 36, zIndex: 1 }} />
      </View>

      {/* ── Backdrop ── */}
      {open && (
        <Animated.View
          style={{
            position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0,0,0,0.4)",
            opacity: backdropOpacity,
            zIndex: 101,
          }}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={closeDrawer}
          />
        </Animated.View>
      )}

      {/* ── Slide-in drawer ── */}
      <Animated.View
        style={{
          position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
          top: 0,
          left: 0,
          bottom: 0,
          width: DRAWER_W,
          backgroundColor: theme.sidebarBg,
          borderRightWidth: 0.5,
          borderRightColor: theme.navBorder,
          transform: [{ translateX }],
          zIndex: 102,
          elevation: 102,
          flexDirection: "column",
        }}
      >
        {/* ── Drawer header ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            height: HEADER_H + insets.top,
            paddingTop: insets.top,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.navBorder,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Image
              source={require("../icons/silverdab-logo.png")}
              style={{ width: 30, height: 30 }}
              resizeMode="contain"
            />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 16,
                color: C.textActive,
                letterSpacing: -0.3,
              }}
            >
              Silverdab
            </Text>
          </View>
          <TouchableOpacity
            onPress={closeDrawer}
            activeOpacity={0.7}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X color={C.iconActive} size={20} />
          </TouchableOpacity>
        </View>

        {/* ── Scrollable nav ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section, sIdx) => (
            <View
              key={sIdx}
              style={
                sIdx > 0
                  ? {
                      marginTop: 8,
                      borderTopWidth: 0.5,
                      borderTopColor: theme.navBorder,
                      paddingTop: 8,
                    }
                  : undefined
              }
            >
              {section.sectionLabel && (
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 10,
                    letterSpacing: 0.8,
                    color: C.textInactive,
                    textTransform: "uppercase",
                    paddingHorizontal: 20,
                    paddingBottom: 4,
                  }}
                >
                  {section.sectionLabel}
                </Text>
              )}
              {section.items.map(renderNavItem)}
            </View>
          ))}
        </ScrollView>

        {/* ── Settings popout ── */}
        {settingsOpen && (
          <View
            style={{
              marginHorizontal: 8,
              marginBottom: 6,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.navBorder,
              backgroundColor: theme.surface,
              overflow: "hidden",
            }}
          >
            <TouchableOpacity
              onPress={handleThemeCycle}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <ThemeIcon color={theme.iconActive} size={16} />
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13.5,
                  color: theme.textActive,
                  flex: 1,
                }}
              >
                {currentTheme.label}
              </Text>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 999,
                  backgroundColor: theme.iconActive,
                }}
              />
            </TouchableOpacity>

            <View style={{ height: 0.5, backgroundColor: theme.navBorder }} />

            <TouchableOpacity
              onPress={() => {
                setSettingsOpen(false);
                setLogoutModalVisible(true);
              }}
              activeOpacity={0.7}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <LogOut color="#f87171" size={16} />
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 13.5,
                  color: "#f87171",
                  flex: 1,
                }}
              >
                Log out
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── User footer ── */}
        <View
          style={{
            borderTopWidth: 0.5,
            borderTopColor: theme.navBorder,
            paddingHorizontal: 12,
            paddingTop: 14,
            paddingBottom: 14 + insets.bottom,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 999,
              backgroundColor: theme.iconActive,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Text style={{ fontFamily: "Outfit-Bold", color: "#fff", fontSize: 13 }}>
              {user.displayName?.charAt(0) ?? "U"}
            </Text>
          </View>

          <View style={{ flex: 1 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 12.5,
                color: theme.textActive,
                lineHeight: 17,
              }}
            >
              {user.displayName}
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 11,
                color: theme.textInactive,
                textTransform: "capitalize",
              }}
            >
              {user.role}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setSettingsOpen((prev) => !prev)}
            activeOpacity={0.7}
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: settingsOpen ? theme.bgActive : "transparent",
            }}
          >
            <Settings
              color={settingsOpen ? theme.iconActive : theme.iconInactive}
              size={16}
            />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <LogoutModal
        visible={logoutModalVisible}
        onConfirm={handleLogoutConfirm}
        onCancel={() => setLogoutModalVisible(false)}
      />
    </>
  );
}