import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Platform,
  Modal,
  ActivityIndicator,
} from "react-native";
import { Clock as ClockIcon } from "lucide-react-native";
import { getNavColors } from "./NavItems";
import { useTheme } from "../../theme/ThemeContext";
import { ADUser } from "../../../types";
import { LogOut, Sun, Moon, Monitor, Clock } from "lucide-react-native";
import LogoutModal from "../../app/Auth/LogoutModal";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getAllFleetDrivers, setDriverShift } from "../../services/fleetOps";
import {
  SHIFT_OPTIONS,
  findShiftOption,
  formatShiftLabel,
  hasNoShift,
} from "@/utils/shiftUtils";

const STORAGE_KEY = "AD_USER_DATA";

type DriverNavbarProps = {
  user: ADUser;
  onLogout: () => void;
};

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

// Rounds a "HH:MM" string from the native <input type="time"> up/down to
// the nearest whole hour — guards against manual keyboard entry, since
// `step` on the input only constrains the native picker's scroll
// increments, not typing (same reasoning as snapToHalfHour in
// TripBookingModal.tsx, just locked to :00 instead of :00/:30).
function snapToWholeHour(value: string): string {
  if (!value) return value;
  const [hStr, mStr] = value.split(":");
  let h = Number(hStr);
  const m = Number(mStr);
  if (m >= 30) h = (h + 1) % 24;
  return `${String(h).padStart(2, "0")}:00`;
}

// ── Driver top bar ──────────────────────────────────────────────────────────
// Drivers have no side nav to open (no other modules to switch between), so
// this is a plain fixed header: logo + wordmark, and an avatar on the right
// that pops out the user's name/role, a theme toggle, and a logout action.
// No hamburger, no drawer — mirrors MobileNavbar's theming/logout flow
// without the nav list.
export default function DriverNavbar({ user, onLogout }: DriverNavbarProps) {
  const [popoutOpen, setPopoutOpen] = useState(false);
  const [logoutModalVisible, setLogoutModalVisible] = useState(false);
  const [shiftModalVisible, setShiftModalVisible] = useState(false);
  const [myDriverId, setMyDriverId] = useState<string | null>(null);
  const [myShiftStart, setMyShiftStart] = useState<string | null>(null);
  const [myShiftEnd, setMyShiftEnd] = useState<string | null>(null);
  const [savingShift, setSavingShift] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customError, setCustomError] = useState<string | null>(null);
  const customStartRef = useRef<HTMLInputElement>(null);
  const customEndRef = useRef<HTMLInputElement>(null);

  const { theme, themeMode, setThemeMode } = useTheme();
  const C = getNavColors(theme);
  const insets = useSafeAreaInsets();

  // Look up this user's fleet_drivers row so the popout can show/edit
  // their shift — same name-match DriverPortalPage.tsx uses for "myDriver".
  useEffect(() => {
    let cancelled = false;
    getAllFleetDrivers()
      .then((drivers) => {
        if (cancelled) return;
        const mine = drivers.find(
          (d) => d.name?.toLowerCase() === user.displayName?.toLowerCase(),
        );
        if (mine) {
          setMyDriverId(mine.id);
          setMyShiftStart(mine.shiftStart ?? null);
          setMyShiftEnd(mine.shiftEnd ?? null);
          // No shift on file — force the picker open instead of leaving
          // the driver stuck with no auto duty-status coverage.
          if (hasNoShift(mine.shiftStart, mine.shiftEnd)) {
            setShiftModalVisible(true);
          }
        }
      })
      .catch((err) => console.error("Load driver shift failed:", err));
    return () => {
      cancelled = true;
    };
  }, [user.displayName]);

  // Hides the browser's own built-in clock icon on the native time inputs
  // below so only our themed icon button shows — same pattern as
  // TripBookingModal's DATE_INPUT_CLASS.
  const TIME_INPUT_CLASS = "driver-shift-time-input";
  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "driver-shift-time-input-style";
    if (document.getElementById(styleId)) return;
    const el = document.createElement("style");
    el.id = styleId;
    el.textContent = `
      .${TIME_INPUT_CLASS}::-webkit-calendar-picker-indicator {
        opacity: 0;
        pointer-events: none;
      }
    `;
    document.head.appendChild(el);
  }, []);

  const myShiftOption = findShiftOption(myShiftStart, myShiftEnd);
  const myShiftLabel = myShiftOption
    ? myShiftOption.label
    : myShiftStart && myShiftEnd
    ? formatShiftLabel(myShiftStart, myShiftEnd)
    : null;

  async function handleSelectShift(start: string, end: string) {
    if (!myDriverId) return;
    setSavingShift(true);
    try {
      await setDriverShift(myDriverId, start, end);
      setMyShiftStart(start);
      setMyShiftEnd(end);
      setShiftModalVisible(false);
      setCustomMode(false);
      setCustomError(null);
      setCustomStart("");
      setCustomEnd("");
    } catch (err) {
      console.error("Set shift failed:", err);
    } finally {
      setSavingShift(false);
    }
  }

  function handleSaveCustomShift() {
    if (!customStart || !customEnd) {
      setCustomError("Pick both a start and end time.");
      return;
    }
    if (customStart === customEnd) {
      setCustomError("Start and end time can't be the same.");
      return;
    }
    setCustomError(null);
    handleSelectShift(customStart, customEnd);
  }

  const handleThemeCycle = () => {
    const next = THEME_META[themeMode as ThemeMode]?.next ?? "light";
    setThemeMode(next);
  };

  const currentTheme = THEME_META[themeMode as ThemeMode] ?? THEME_META.system;
  const ThemeIcon = currentTheme.Icon;

  const handleLogoutConfirm = async () => {
    setLogoutModalVisible(false);
    setPopoutOpen(false);
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error("Logout storage error:", err);
    }
    onLogout();
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
          paddingHorizontal: 16,
          backgroundColor: theme.sidebarBg,
          borderBottomWidth: 0.5,
          borderBottomColor: theme.navBorder,
          zIndex: 100,
          elevation: 100,
        }}
      >
        {/* Left: logo + wordmark */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            flex: 1,
          }}
        >
          <Image
            source={require("../icons/SilvergraphLogo.png")}
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
            Silvergraph
          </Text>
        </View>

        {/* Right: avatar, toggles popout */}
        <TouchableOpacity
          onPress={() => setPopoutOpen((prev) => !prev)}
          activeOpacity={0.7}
          style={{
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: theme.iconActive,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ fontFamily: "Outfit-Bold", color: "#fff", fontSize: 13 }}>
            {user.displayName?.charAt(0) ?? "U"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Backdrop to dismiss popout ── */}
      {popoutOpen && (
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setPopoutOpen(false)}
          style={{
            position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 101,
          }}
        />
      )}

      {/* ── Popout: name, role, logout ── */}
      {popoutOpen && (
        <View
          style={{
            position: (Platform.OS === "web" ? "fixed" : "absolute") as any,
            top: HEADER_H + insets.top + 6,
            right: 16,
            width: 220,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.navBorder,
            backgroundColor: theme.surface,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 8,
            zIndex: 102,
          }}
        >
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderBottomWidth: 0.5,
              borderBottomColor: theme.navBorder,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13.5,
                color: theme.textActive,
              }}
            >
              {user.displayName}
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 11.5,
                color: theme.textInactive,
                textTransform: "capitalize",
                marginTop: 1,
              }}
            >
              {user.role}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleThemeCycle}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
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

          {myDriverId && (
            <>
              <View style={{ height: 0.5, backgroundColor: theme.navBorder }} />
              <TouchableOpacity
                onPress={() => {
                  setPopoutOpen(false);
                  setShiftModalVisible(true);
                }}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                }}
              >
                <Clock color={theme.iconActive} size={16} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Outfit-medium",
                      fontSize: 13.5,
                      color: theme.textActive,
                    }}
                  >
                    Shift
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Outfit",
                      fontSize: 11,
                      color: theme.textInactive,
                      marginTop: 1,
                    }}
                  >
                    {myShiftLabel ?? "Not set"}
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          <View style={{ height: 0.5, backgroundColor: theme.navBorder }} />

          <TouchableOpacity
            onPress={() => {
              setPopoutOpen(false);
              setLogoutModalVisible(true);
            }}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingHorizontal: 14,
              paddingVertical: 11,
            }}
          >
            <LogOut color="#f87171" size={16} />
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 13.5,
                color: "#f87171",
              }}
            >
              Log out
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <LogoutModal
        visible={logoutModalVisible}
        onConfirm={handleLogoutConfirm}
        onCancel={() => setLogoutModalVisible(false)}
      />

      {/* Shift picker — sets shiftStart/shiftEnd on this driver's
          fleet_drivers row; on/off duty is derived from this automatically
          (see computeAutoDutyStatus in shiftUtils.ts). */}
      <Modal
        visible={shiftModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setShiftModalVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShiftModalVisible(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={{
              width: "100%",
              maxWidth: 340,
              backgroundColor: theme.surface,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 16,
                color: theme.textActive,
                marginBottom: 14,
              }}
            >
              Set your shift
            </Text>

            {SHIFT_OPTIONS.map((opt) => {
              const selected =
                !customMode && opt.start === myShiftStart && opt.end === myShiftEnd;
              return (
                <TouchableOpacity
                  key={opt.key}
                  onPress={() => {
                    setCustomMode(false);
                    setCustomError(null);
                    handleSelectShift(opt.start, opt.end);
                  }}
                  disabled={savingShift}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingVertical: 13,
                    paddingHorizontal: 14,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: selected ? theme.iconActive : theme.navBorder,
                    backgroundColor: selected ? theme.iconActive + "1a" : "transparent",
                    marginBottom: 10,
                    opacity: savingShift ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Outfit-medium",
                      fontSize: 13.5,
                      color: theme.textActive,
                    }}
                  >
                    {opt.label}
                  </Text>
                  {selected && (
                    <View
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        backgroundColor: theme.iconActive,
                      }}
                    />
                  )}
                </TouchableOpacity>
              );
            })}

            {/* Custom time — toggles two HH:MM inputs instead of picking
                one of the fixed SHIFT_OPTIONS above. */}
            <TouchableOpacity
              onPress={() => {
                setCustomError(null);
                setCustomMode((prev) => !prev);
              }}
              disabled={savingShift}
              activeOpacity={0.8}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 13,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: customMode ? theme.iconActive : theme.navBorder,
                backgroundColor: customMode ? theme.iconActive + "1a" : "transparent",
                marginBottom: customMode ? 12 : 10,
                opacity: savingShift ? 0.6 : 1,
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13.5,
                  color: theme.textActive,
                }}
              >
                Custom time
              </Text>
              {customMode && (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 999,
                    backgroundColor: theme.iconActive,
                  }}
                />
              )}
            </TouchableOpacity>

            {customMode && Platform.OS !== "web" && (
              <View
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: theme.background,
                  marginBottom: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 12,
                    color: theme.subtext,
                  }}
                >
                  Custom time entry isn't available on this device yet. Please
                  pick one of the preset shifts above, or use the app on web.
                </Text>
              </View>
            )}

            {customMode && Platform.OS === "web" && (
              <View style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 11,
                        color: theme.subtext,
                        marginBottom: 6,
                      }}
                    >
                      Start
                    </Text>
                    <div style={{ position: "relative" }}>
                      <input
                        ref={customStartRef as any}
                        type="time"
                        step={3600}
                        className={TIME_INPUT_CLASS}
                        value={customStart}
                        disabled={savingShift}
                        onChange={(e: any) => setCustomStart(snapToWholeHour(e.target.value))}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          backgroundColor: theme.background,
                          borderRadius: 8,
                          border: `1px solid ${theme.navBorder}`,
                          padding: "9px 34px 9px 12px",
                          fontFamily: "Outfit-medium",
                          fontSize: 13,
                          color: theme.textActive,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => customStartRef.current?.showPicker?.()}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          padding: 4,
                          cursor: "pointer",
                          display: "flex",
                        }}
                      >
                        <ClockIcon size={14} color={theme.subtext} />
                      </button>
                    </div>
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 11,
                        color: theme.subtext,
                        marginBottom: 6,
                      }}
                    >
                      End
                    </Text>
                    <div style={{ position: "relative" }}>
                      <input
                        ref={customEndRef as any}
                        type="time"
                        step={3600}
                        className={TIME_INPUT_CLASS}
                        value={customEnd}
                        disabled={savingShift}
                        onChange={(e: any) => setCustomEnd(snapToWholeHour(e.target.value))}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          backgroundColor: theme.background,
                          borderRadius: 8,
                          border: `1px solid ${theme.navBorder}`,
                          padding: "9px 34px 9px 12px",
                          fontFamily: "Outfit-medium",
                          fontSize: 13,
                          color: theme.textActive,
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => customEndRef.current?.showPicker?.()}
                        style={{
                          position: "absolute",
                          right: 8,
                          top: "50%",
                          transform: "translateY(-50%)",
                          background: "none",
                          border: "none",
                          padding: 4,
                          cursor: "pointer",
                          display: "flex",
                        }}
                      >
                        <ClockIcon size={14} color={theme.subtext} />
                      </button>
                    </div>
                  </View>
                </View>

                {customError && (
                  <Text
                    style={{
                      fontFamily: "Outfit",
                      fontSize: 11.5,
                      color: "#dc2626",
                      marginBottom: 8,
                    }}
                  >
                    {customError}
                  </Text>
                )}

                <TouchableOpacity
                  onPress={handleSaveCustomShift}
                  disabled={savingShift}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: theme.iconActive,
                    borderRadius: 8,
                    paddingVertical: 11,
                    alignItems: "center",
                    opacity: savingShift ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Outfit-medium",
                      fontSize: 13,
                      color: "#fff",
                    }}
                  >
                    Save custom shift
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {false && customError}

            {savingShift && (
              <ActivityIndicator size="small" color={theme.iconActive} style={{ marginTop: 4 }} />
            )}

            <TouchableOpacity
              onPress={() => {
                setShiftModalVisible(false);
                setCustomMode(false);
                setCustomError(null);
                setCustomStart("");
                setCustomEnd("");
              }}
              disabled={savingShift}
              activeOpacity={0.8}
              style={{
                marginTop: 6,
                paddingVertical: 11,
                borderRadius: 8,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13,
                  color: theme.subtext,
                }}
              >
                Close
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}