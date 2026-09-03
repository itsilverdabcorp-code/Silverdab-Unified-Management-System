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
import { LogOut, Sun, Moon, Monitor, Settings, Mail } from "lucide-react-native";
import LogoutModal from "../../app/Auth/LogoutModal";
import EmailPreferenceModal from "@/components/common/EmailPreferenceModal";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "AD_USER_DATA";

type SidebarProps = {
  user: ADUser;
  activeKey: string;
  onNavigate: (key: string) => void;
  onLogout: () => void;
};

const COLLAPSED_W = 64;
const EXPANDED_W = 220;

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

export default function Sidebar({
  user,
  activeKey,
  onNavigate,
  onLogout,
}: SidebarProps) {
  const [expanded, setExpanded] = useState(true);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [emailModalVisible, setEmailModalVisible] = useState(false);

  const { theme, themeMode, setThemeMode } = useTheme();
  const C = getNavColors(theme);

  // ✅ Normalize permissions so undefined fields default to false
  //    This ensures officeSupplies (and any future key) always evaluates correctly
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
      fleetControl: Boolean(user.permissions?.fleetControl),
      fleetDriver: Boolean(user.permissions?.fleetDriver),
    },
  };

  const sections = getNavSectionsForUser(normalizedUser);

  const animatedWidth = useRef(new Animated.Value(EXPANDED_W)).current;
  const animatedExpand = useRef(new Animated.Value(1)).current;

  const labelOpacity = animatedExpand;
  const labelTranslateX = animatedExpand.interpolate({
    inputRange: [0, 1],
    outputRange: [-6, 0],
  });

  const hoverTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const animateSidebar = (toValue: number) => {
    const expandTo = toValue === EXPANDED_W ? 1 : 0;
    Animated.parallel([
      Animated.timing(animatedWidth, {
        toValue,
        duration: 240,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }),
      Animated.timing(animatedExpand, {
        toValue: expandTo,
        duration: expandTo === 1 ? 180 : 120,
        delay: expandTo === 1 ? 60 : 0,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleExpand = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    hoverTimeout.current = setTimeout(() => {
      setExpanded(true);
      animateSidebar(EXPANDED_W);
    }, 150);
  };

  const handleCollapse = () => {
    if (hoverTimeout.current) clearTimeout(hoverTimeout.current);
    setExpanded(false);
    setSettingsOpen(false);
    animateSidebar(COLLAPSED_W);
  };

  const webHoverProps =
    Platform.OS === "web"
      ? { onMouseEnter: handleExpand, onMouseLeave: handleCollapse }
      : {};

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

  // ─── Nav item press → real URL + page switch ─────────────────────────────
  // No router library in this app, so "href" navigation means: update the
  // address bar via history.pushState (web only, so refresh/copy-link/back
  // button behave sensibly), then drive the actual page swap the same way
  // it already worked — through the onNavigate callback.
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
  };

  // ─── Nav item renderer ───────────────────────────────────────────────────────
  const renderNavItem = (item: NavItem) => {
    const isActive = item.key === activeKey;
    const isHovered = hoveredKey === item.key;
    const Icon = item.icon;

    const navItemWebProps =
      Platform.OS === "web"
        ? {
            onMouseEnter: () => {
              if (!isActive) setHoveredKey(item.key);
            },
            onMouseLeave: () => setHoveredKey(null),
          }
        : {};

    return (
      <TouchableOpacity
        key={item.key}
        onPress={() => handleNavItemPress(item)}
        activeOpacity={0.7}
        style={{
          position: "relative",
          flexDirection: "row",
          alignItems: "center",
          justifyContent: expanded ? "flex-start" : "center", // ← center when collapsed
          gap: expanded ? 8 : 0, // ← no phantom gap when collapsed
          marginHorizontal: 8,
          marginVertical: 1,
          paddingHorizontal: expanded ? 10 : 0, // ← full-width tap target, icon centered
          paddingVertical: 7,
          borderRadius: 8,
          backgroundColor: isActive
            ? theme.bgActive
            : isHovered
              ? theme.bgHover
              : "transparent",
        }}
        {...navItemWebProps}
      >
        {isActive && (
          <View
            style={{
              position: "absolute",
              right: 0,
              top: "50%",
              marginTop: -8,
              width: 3,
              height: 16,
              borderTopLeftRadius: 3,
              borderBottomLeftRadius: 3,
              backgroundColor: C.activeBar,
            }}
          />
        )}
        <View
          style={{
            flexShrink: 0,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon color={isActive ? C.iconActive : C.iconInactive} size={18} />
        </View>

        {/* Label now collapses its actual width, not just opacity */}
        <Animated.View
          style={{
            overflow: "hidden",
            width: animatedExpand.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 160],
            }),
          }}
        >
          <Animated.Text
            numberOfLines={1}
            style={{
              fontFamily: isActive ? "Outfit-medium" : "Outfit",
              fontSize: 13.5,
              letterSpacing: -0.1,
              color: isActive ? C.textActive : C.textInactive,
              opacity: labelOpacity,
              transform: [{ translateX: labelTranslateX }],
            }}
          >
            {item.label}
          </Animated.Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <>
      <Animated.View
        style={{
          width: animatedWidth,
          minHeight: "100%",
          backgroundColor: theme.sidebarBg,
          borderRightWidth: 0.5,
          borderRightColor: theme.navBorder,
          flexDirection: "column",
          overflow: "hidden",
          zIndex: 100,
        }}
        {...webHoverProps}
      >
        {/* ── Logo ── */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            if (Platform.OS !== "web") {
              const next = !expanded;
              setExpanded(next);
              animateSidebar(next ? EXPANDED_W : COLLAPSED_W);
            }
          }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 20,
            paddingBottom: 18,
            borderBottomWidth: 0.5,
            borderBottomColor: theme.navBorder,
            overflow: "hidden",
          }}
        >
          <View style={{ flexShrink: 0 }}>
            <Image
              source={require("../icons/SilvergraphLogo.png")}
              style={{ width: 35, height: 35 }}
              resizeMode="contain"
            />
          </View>
          <Animated.Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 16,
              color: C.textActive,
              letterSpacing: -0.3,
              opacity: labelOpacity,
              transform: [{ translateX: labelTranslateX }],
            }}
            numberOfLines={1}
          >
            Silvergraph
          </Animated.Text>
        </TouchableOpacity>

        {/* ── Scrollable nav ── */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingVertical: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {sections.map((section, sIdx) => (
            <View
              key={sIdx}
              style={
                sIdx > 0
                  ? {
                      marginTop: 6,
                      borderTopWidth: 0.5,
                      borderTopColor: theme.navBorder,
                      paddingTop: 6,
                    }
                  : undefined
              }
            >
              {section.sectionLabel && expanded && (
                <Animated.Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 10,
                    letterSpacing: 0.8,
                    color: C.textInactive,
                    textTransform: "uppercase",
                    paddingHorizontal: 20,
                    paddingBottom: 4,
                    opacity: labelOpacity,
                  }}
                >
                  {section.sectionLabel}
                </Animated.Text>
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
                setEmailModalVisible(true);
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
              <Mail color={theme.iconActive} size={16} />
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13.5,
                  color: theme.textActive,
                  flex: 1,
                }}
              >
                Notification email
              </Text>
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
            paddingVertical: 30,
            height: 32,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: expanded ? "flex-start" : "center",
            gap: expanded ? 10 : 0,
            overflow: "hidden",
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
            <Text
              style={{ fontFamily: "Outfit-Bold", color: "#fff", fontSize: 13 }}
            >
              {user.displayName?.charAt(0) ?? "U"}
            </Text>
          </View>

          <Animated.View
            style={{
              opacity: labelOpacity,
              transform: [{ translateX: labelTranslateX }],
              overflow: "hidden",
              width: animatedExpand.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 120],
              }),
            }}
          >
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
          </Animated.View>

          <Animated.View
            style={{
              opacity: labelOpacity,
              overflow: "hidden",
              width: animatedExpand.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 28],
              }),
            }}
          >
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
          </Animated.View>
        </View>
      </Animated.View>

      <LogoutModal
        visible={logoutModalVisible}
        onConfirm={handleLogoutConfirm}
        onCancel={() => setLogoutModalVisible(false)}
      />

      <EmailPreferenceModal
        visible={emailModalVisible}
        username={user.username}
        alwaysShow
        onDone={() => setEmailModalVisible(false)}
      />
    </>
  );
}
