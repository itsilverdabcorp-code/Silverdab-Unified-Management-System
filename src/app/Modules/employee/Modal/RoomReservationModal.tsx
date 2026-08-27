import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  ActivityIndicator,
  Platform,
  useWindowDimensions,
} from "react-native";
import { X, Users, Calendar as CalendarIcon, Clock as ClockIcon, ChevronLeft, ChevronRight } from "lucide-react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser } from "../../../../../types";
import { createRoomReservation, getEmailPreference, getRoomReservations, RoomReservationPayload } from "@/services/roomReservation";

// ─── Config (mirrors ocgbim.com Bookings page) ─────────────────────────────

const ROOMS = [
  { name: "Conference Room" as const, maxAttendees: 15 },
  { name: "Meeting Room 1" as const, maxAttendees: 6 },
  { name: "Meeting Room 2" as const, maxAttendees: 6 },
];

const AV_OPTIONS = [
  "None",
  "With video presentation",
  "With Audio and Video presentation",
  "Audio only",
] as const;

const WIFI_OPTIONS = ["Not needed", "Needed"] as const;



const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toDateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "13:00:00" -> "1:00 PM"
function formatDisplayTime(value: string): string {
  if (!value) return "—";
  const [hStr, mStr] = value.split(":");
  let h = Number(hStr);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${period}`;
}



// ─── Mini calendar ──────────────────────────────────────────────────────────

function MiniCalendar({
  selectedDate,
  onSelect,
  theme,
  primary,
}: {
  selectedDate: Date;
  onSelect: (d: Date) => void;
  theme: any;
  primary: string;
}) {
  const [viewMonth, setViewMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
  );

  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const daysInMonth = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth() + 1,
    0,
  ).getDate();
  const firstWeekday = new Date(
    viewMonth.getFullYear(),
    viewMonth.getMonth(),
    1,
  ).getDay();

  const cells: (Date | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      new Date(viewMonth.getFullYear(), viewMonth.getMonth(), i + 1),
    ),
  ];

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <TouchableOpacity
          onPress={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1),
            )
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronLeft size={16} color={theme.subtext} />
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 13,
            color: theme.textActive ?? theme.text,
          }}
        >
          {MONTH_NAMES[viewMonth.getMonth()]} {viewMonth.getFullYear()}
        </Text>
        <TouchableOpacity
          onPress={() =>
            setViewMonth(
              new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1),
            )
          }
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ChevronRight size={16} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <View key={`${d}-${i}`} style={{ flex: 1, alignItems: "center" }}>
            <Text
              style={{ fontFamily: "Outfit", fontSize: 10, color: theme.subtext }}
            >
              {d}
            </Text>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {cells.map((d, i) => {
          if (!d) return <View key={i} style={{ width: "14.28%", height: 32 }} />;
          const isPast = d < today;
          const isSelected = toDateKey(d) === toDateKey(selectedDate);
          return (
            <View key={i} style={{ width: "14.28%", height: 32, alignItems: "center", justifyContent: "center" }}>
              <TouchableOpacity
                disabled={isPast}
                onPress={() => onSelect(d)}
                activeOpacity={0.7}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: isSelected ? primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: isSelected ? "Outfit-medium" : "Outfit",
                    fontSize: 12,
                    color: isPast
                      ? theme.border
                      : isSelected
                        ? "#fff"
                        : (theme.textActive ?? theme.text),
                  }}
                >
                  {d.getDate()}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </View>
  );
}

// ─── Field wrapper ──────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
  theme,
  raised,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  theme: any;
  raised?: boolean;
}) {
  return (
    <View
      style={[
        { marginBottom: 14, position: "relative", zIndex: raised ? 50 : 1 },
        Platform.OS === "web" ? ({ isolation: raised ? "isolate" : "auto" } as any) : null,
      ]}
    >
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 13,
          color: theme.textActive ?? theme.text,
          marginBottom: 6,
        }}
      >
        {label}
        {required && <Text style={{ color: "#EF4444" }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

// ─── Toggle switch ──────────────────────────────────────────────────────────

function Toggle({
  value,
  onChange,
  theme,
  primary,
  label,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  theme: any;
  primary: string;
  label: string;
}) {
  return (
    <TouchableOpacity
      onPress={() => onChange(!value)}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: theme.background,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: theme.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <Text
        style={{
          fontFamily: "Outfit",
          fontSize: 13,
          color: theme.textActive ?? theme.text,
        }}
      >
        {label}
      </Text>
      <View
        style={{
          width: 40,
          height: 22,
          borderRadius: 11,
          backgroundColor: value ? primary : theme.border,
          padding: 2,
          justifyContent: "center",
        }}
      >
        <View
          style={{
            width: 18,
            height: 18,
            borderRadius: 9,
            backgroundColor: "#fff",
            alignSelf: value ? "flex-end" : "flex-start",
          }}
        />
      </View>
    </TouchableOpacity>
  );
}

// ─── Time slot helpers ──────────────────────────────────────────────────────

// Half-hour slots from 6:00 AM to 9:00 PM (last bookable start is 8:30 PM).
function generateTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 6; h <= 21; h++) {
    slots.push(`${pad(h)}:00`);
    if (h !== 21) slots.push(`${pad(h)}:30`);
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function isSlotBooked(
  slot: string,
  bookedSlots: { startTime: string; endTime: string }[],
): boolean {
  const slotStart = `${slot}:00`;
  return bookedSlots.some((b) => slotStart >= b.startTime && slotStart < b.endTime);
}

// ─── Time slot dropdown ─────────────────────────────────────────────────────

// Injects theme-aware scrollbar styling for the time slot dropdown (web only).
function useTimeSlotScrollbarStyle(theme: any) {
  React.useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const styleId = "time-slot-scroll-style";
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = `
      .time-slot-scroll::-webkit-scrollbar {
        width: 6px;
      }
      .time-slot-scroll::-webkit-scrollbar-track {
        background: transparent;
      }
      .time-slot-scroll::-webkit-scrollbar-thumb {
        background: ${theme.border};
        border-radius: 99px;
      }
      .time-slot-scroll::-webkit-scrollbar-thumb:hover {
        background: ${theme.subtext};
      }
      .time-slot-scroll {
        scrollbar-width: thin;
        scrollbar-color: ${theme.border} transparent;
      }
    `;
  }, [theme.border, theme.subtext]);
}

function TimeSlotDropdown({
  value,
  onSelect,
  bookedSlots,
  minTime,
  theme,
  primary,
  placeholder,
  onOpenChange,
}: {
  value: string;
  onSelect: (v: string) => void;
  bookedSlots: { startTime: string; endTime: string }[];
  minTime?: string;
  theme: any;
  primary: string;
  placeholder: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      onOpenChange?.(next);
      return next;
    });
  };

  useTimeSlotScrollbarStyle(theme);

  return (
    <View
      style={[
        { position: "relative", zIndex: open ? 50 : 1 },
        Platform.OS === "web" ? ({ isolation: open ? "isolate" : "auto" } as any) : null,
      ]}
    >
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        style={{
          backgroundColor: theme.background,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: theme.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 13,
            color: value ? (theme.textActive ?? theme.text) : theme.subtext,
          }}
        >
          {value ? formatDisplayTime(`${value}:00`) : placeholder}
        </Text>
        <ClockIcon size={13} color={theme.subtext} />
      </TouchableOpacity>
      {open && (
        <ScrollView
          className={Platform.OS === "web" ? "time-slot-scroll" : undefined}
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 220,
            backgroundColor: theme.surface ?? theme.background,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: theme.border,
            zIndex: 50,
            elevation: 8,
          }}
          showsVerticalScrollIndicator
        >
          {TIME_SLOTS.map((slot) => {
            const booked = isSlotBooked(slot, bookedSlots);
            const belowMin = minTime ? slot <= minTime : false;
            const disabled = booked || belowMin;
            const selected = slot === value;
            return (
              <TouchableOpacity
                key={slot}
                disabled={disabled}
                onPress={() => {
                  onSelect(slot);
                  setOpen(false);
                }}
                activeOpacity={0.7}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: selected ? (theme.bgActive ?? "#EEF2FF") : "transparent",
                  opacity: disabled ? 0.4 : 1,
                }}
              >
                <Text
                  style={{
                    fontFamily: selected ? "Outfit-medium" : "Outfit",
                    fontSize: 13,
                    color: selected ? primary : (theme.textActive ?? theme.text),
                    textDecorationLine: booked ? "line-through" : "none",
                  }}
                >
                  {formatDisplayTime(`${slot}:00`)}
                </Text>
                {booked && (
                  <Text style={{ fontFamily: "Outfit", fontSize: 10, color: theme.subtext }}>
                    Booked
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

// ─── Simple dropdown (native select would be nicer on web, this is portable) ─

function SimpleDropdown({
  value,
  options,
  onSelect,
  theme,
  primary,
  onOpenChange,
}: {
  value: string;
  options: readonly string[];
  onSelect: (v: string) => void;
  theme: any;
  primary: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpenState] = useState(false);
  const setOpen = (v: boolean | ((o: boolean) => boolean)) => {
    setOpenState((prev) => {
      const next = typeof v === "function" ? v(prev) : v;
      onOpenChange?.(next);
      return next;
    });
  };
  return (
    <View
      style={[
        { position: "relative", zIndex: open ? 50 : 1 },
        Platform.OS === "web" ? ({ isolation: open ? "isolate" : "auto" } as any) : null,
      ]}
    >
      <TouchableOpacity
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
        style={{
          backgroundColor: theme.background,
          borderRadius: 8,
          borderWidth: 1.5,
          borderColor: theme.border,
          paddingHorizontal: 12,
          paddingVertical: 10,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 13,
            color: theme.textActive ?? theme.text,
          }}
        >
          {value}
        </Text>
        <ChevronRight
          size={13}
          color={theme.subtext}
          style={{ transform: [{ rotate: open ? "90deg" : "0deg" }] }}
        />
      </TouchableOpacity>
      {open && (
        <View
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            backgroundColor: theme.surface ?? theme.background,
            borderRadius: 8,
            borderWidth: 1.5,
            borderColor: theme.border,
            overflow: "hidden",
            zIndex: 50,
            elevation: 8,
          }}
        >
          {options.map((opt) => (
            <TouchableOpacity
              key={opt}
              onPress={() => {
                onSelect(opt);
                setOpen(false);
              }}
              activeOpacity={0.7}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: opt === value ? (theme.bgActive ?? "#EEF2FF") : "transparent",
              }}
            >
              <Text
                style={{
                  fontFamily: opt === value ? "Outfit-medium" : "Outfit",
                  fontSize: 13,
                  color: opt === value ? primary : (theme.textActive ?? theme.text),
                }}
              >
                {opt}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Main modal ─────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  user: ADUser;
  onSuccess: (bookingRef: string) => void;
};

export default function RoomReservationModal({ visible, onClose, user, onSuccess }: Props) {
  const { theme } = useTheme();
  const primary = theme.primary ?? "#4169E1";
  const { width: winW, height: winH } = useWindowDimensions();
  const isMobile = winW < 768;

  const [selectedRoom, setSelectedRoom] = useState<(typeof ROOMS)[number]>(ROOMS[0]);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  const [fullName, setFullName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState("");
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [guestEmailsRaw, setGuestEmailsRaw] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [avRequirement, setAvRequirement] = useState<(typeof AV_OPTIONS)[number]>("None");
  const [wifi, setWifi] = useState<(typeof WIFI_OPTIONS)[number]>("Needed");
  const [agenda, setAgenda] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [startTimeOpen, setStartTimeOpen] = useState(false);
  const [endTimeOpen, setEndTimeOpen] = useState(false);
  const [avOpen, setAvOpen] = useState(false);
  const [wifiOpen, setWifiOpen] = useState(false);

  const [bookedSlots, setBookedSlots] = useState<{ startTime: string; endTime: string; fullName: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Tracks whether we've pulled the notification email at least once,
  // so re-opening the modal doesn't overwrite a manually-adjusted value —
  // though the field is currently read-only, so this mainly guards against
  // an unnecessary refetch.
  const hasLoadedEmail = React.useRef(false);

  useEffect(() => {
    if (visible) {
      setError("");

      // Only prefill full name on first-ever open (or if it's still empty),
      // so we don't clobber something the user already has in progress.
      setFullName((prev) => prev || user.displayName || "");

      // Email is sourced server-side and can't be hand-edited here, so it's
      // safe (and correct) to refresh it every time the modal opens.
      setLoadingEmail(true);
      getEmailPreference(user.username)
        .then((pref) => setEmail(pref.current || ""))
        .catch((err) => {
          console.error("getEmailPreference failed:", err.message);
          setEmail("");
        })
        .finally(() => {
          setLoadingEmail(false);
          hasLoadedEmail.current = true;
        });
    }
  }, [visible, user]);

  // Reload booked slots for the currently selected room + date whenever
  // either changes, so the person can see what's already taken before
  // picking a start/end time.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingSlots(true);
    getRoomReservations({ date: toDateKey(selectedDate), room: selectedRoom.name })
      .then((reservations) => {
        if (cancelled) return;
        setBookedSlots(
          reservations
            .map((r: any) => ({
              startTime: r.startTime ?? r.start_time,
              endTime: r.endTime ?? r.end_time,
              fullName: r.fullName ?? r.full_name ?? "Unknown",
            }))
            .sort((a, b) => a.startTime.localeCompare(b.startTime)),
        );
      })
      .catch((err) => {
        console.error("getRoomReservations failed:", err.message);
        if (!cancelled) setBookedSlots([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSlots(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, selectedRoom, selectedDate]);

  const inputStyle = {
    backgroundColor: theme.background,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: "Outfit",
    fontSize: 13,
    color: theme.textActive ?? theme.text,
  };

  const webInputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    backgroundColor: theme.background,
    borderRadius: 8,
    border: `1.5px solid ${theme.border}`,
    padding: "9px 12px",
    paddingRight: 34,
    fontFamily: "Outfit",
    fontSize: 13,
    color: theme.textActive ?? theme.text,
    colorScheme: theme.mode,
  };

  const pickerIconBtnStyle: React.CSSProperties = {
    position: "absolute",
    right: 8,
    top: "50%",
    transform: "translateY(-50%)",
    background: "none",
    border: "none",
    padding: 4,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  // Only :00 and :30 are bookable slots.
  function isHalfHourAligned(value: string): boolean {
    if (!value) return false;
    const minute = Number(value.split(":")[1]);
    return minute === 0 || minute === 30;
  }

  const handleSubmit = async () => {
    setError("");

    if (!startTime || !endTime) {
      setError("Select a start and end time for your booking.");
      return;
    }
    if (!isHalfHourAligned(startTime) || !isHalfHourAligned(endTime)) {
      setError("Times must be on the hour or half hour (e.g. 11:00 or 11:30).");
      return;
    }
    if (endTime <= startTime) {
      setError("End time must be after the start time.");
      return;
    }
    if (!fullName.trim()) {
      setError("Full name is required.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("A valid email is required.");
      return;
    }
    if (!agenda.trim()) {
      setError("Agenda is required.");
      return;
    }

    const guestEmails = guestEmailsRaw
      .split(/[,\n]/)
      .map((e) => e.trim())
      .filter(Boolean);

    if (guestEmails.length > 10) {
      setError("You can add up to 10 additional guests.");
      return;
    }

    const payload: RoomReservationPayload = {
      roomName: selectedRoom.name,
      bookingDate: toDateKey(selectedDate),
      startTime: `${startTime}:00`,
      endTime: `${endTime}:00`,
      fullName: fullName.trim(),
      email: email.trim(),
      guestEmails,
      specialRequests: specialRequests.trim(),
      avRequirement,
      needsWifi: wifi === "Needed",
      agenda: agenda.trim(),
    };

    setSubmitting(true);
    try {
      const result = await createRoomReservation(payload);
      resetForm();
      onSuccess(result.roomRef);
    } catch (err: any) {
      setError(err?.message ?? "Failed to book the room.");
    } finally {
      setSubmitting(false);
    }
  };

  // Clears everything back to defaults after a successful booking, so the
  // next time this modal opens it doesn't still show the previous request's
  // room/date/time/agenda/etc. Full name + email are intentionally re-derived
  // from the user prop / getEmailPreference() on next open (see the `visible`
  // effect above), so they don't need resetting here.
  const resetForm = () => {
    setSelectedRoom(ROOMS[0]);
    setSelectedDate(new Date());
    setStartTime("");
    setEndTime("");
    setGuestEmailsRaw("");
    setSpecialRequests("");
    setAvRequirement("None");
    setWifi("Needed");
    setAgenda("");
    setError("");
  };

  if (!visible) return null;

  const MODAL_W = isMobile ? winW - 24 : Math.min(winW * 0.92, 560);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            width: MODAL_W,
            maxHeight: winH * 0.88,
            backgroundColor: theme.surface,
            borderRadius: isMobile ? 16 : 20,
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: isMobile ? 16 : 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 10,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: theme.subtext,
                  marginBottom: 2,
                }}
              >
                Facilities
              </Text>
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 17,
                  color: theme.textActive ?? theme.text,
                }}
              >
                Room Reservation
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: theme.background,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={15} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: isMobile ? 16 : 20, paddingBottom: 30, position: "relative" }}
          >
            {/* ── Select a service (room) ── */}
            <Field label="Select a room" required theme={theme}>
              <View style={{ gap: 8 }}>
                {ROOMS.map((room) => {
                  const selected = selectedRoom.name === room.name;
                  return (
                    <TouchableOpacity
                      key={room.name}
                      onPress={() => setSelectedRoom(room)}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: 12,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: selected ? primary : theme.border,
                        backgroundColor: selected ? (theme.bgActive ?? "#EEF2FF") : theme.background,
                      }}
                    >
                      <View>
                        <Text
                          style={{
                            fontFamily: "Outfit-medium",
                            fontSize: 13,
                            color: theme.textActive ?? theme.text,
                          }}
                        >
                          {room.name}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3 }}>
                          <Users size={11} color={theme.subtext} />
                          <Text style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}>
                            Max {room.maxAttendees}
                          </Text>
                        </View>
                      </View>
                      <View
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: 9,
                          borderWidth: 2,
                          borderColor: selected ? primary : theme.border,
                          backgroundColor: selected ? primary : "transparent",
                        }}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            </Field>

            {/* ── Date & Time ── */}
            <Field label="Date" required theme={theme}>
              <View
                style={{
                  backgroundColor: theme.background,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                  padding: 12,
                }}
              >
                <MiniCalendar
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  theme={theme}
                  primary={primary}
                />
              </View>
            </Field>

            {/* ── Already-booked slots for the selected room + date ── */}
            <View style={{ marginBottom: 14 }}>
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 12,
                  color: theme.subtext,
                  marginBottom: 6,
                }}
              >
                Booked times for {selectedRoom.name} on{" "}
                {selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </Text>
              {loadingSlots ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 }}>
                  <ActivityIndicator size="small" color={theme.subtext} />
                  <Text style={{ fontFamily: "Outfit", fontSize: 12, color: theme.subtext }}>
                    Checking availability…
                  </Text>
                </View>
              ) : bookedSlots.length === 0 ? (
                <Text style={{ fontFamily: "Outfit", fontSize: 12, color: theme.subtext }}>
                  No bookings yet — the room is open all day.
                </Text>
              ) : (
                <View style={{ gap: 6 }}>
                  {bookedSlots.map((slot, i) => (
                    <View
                      key={i}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        backgroundColor: theme.background,
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 8,
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                      }}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <ClockIcon size={12} color={theme.subtext} />
                        <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.textActive ?? theme.text }}>
                          {formatDisplayTime(slot.startTime)} – {formatDisplayTime(slot.endTime)}
                        </Text>
                      </View>
                      <Text
                        style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}
                        numberOfLines={1}
                      >
                        {slot.fullName}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View
              style={{
                flexDirection: "row",
                gap: 12,
                position: "relative",
                zIndex: startTimeOpen || endTimeOpen ? 50 : 1,
              }}
            >
              <View style={{ flex: 1, zIndex: startTimeOpen ? 50 : 1 }}>
                <Field label="Start time" required theme={theme} raised={startTimeOpen}>
                  <TimeSlotDropdown
                    value={startTime}
                    onSelect={(v) => {
                      setStartTime(v);
                      if (endTime && endTime <= v) setEndTime("");
                    }}
                    bookedSlots={bookedSlots}
                    theme={theme}
                    primary={primary}
                    placeholder="Select start time"
                    onOpenChange={setStartTimeOpen}
                  />
                </Field>
              </View>
              <View style={{ flex: 1, zIndex: endTimeOpen ? 50 : 1 }}>
                <Field label="End time" required theme={theme} raised={endTimeOpen}>
                  <TimeSlotDropdown
                    value={endTime}
                    onSelect={setEndTime}
                    bookedSlots={bookedSlots}
                    minTime={startTime || undefined}
                    theme={theme}
                    primary={primary}
                    placeholder="Select end time"
                    onOpenChange={setEndTimeOpen}
                  />
                </Field>
              </View>
            </View>

            {/* ── Requester details ── */}
            <Field label="First and last name" required theme={theme}>
              <TextInput
                style={inputStyle}
                placeholder="First and last name"
                placeholderTextColor={theme.subtext}
                value={fullName}
                onChangeText={setFullName}
              />
            </Field>

            <Field label="Email" required theme={theme}>
              <View style={[inputStyle, { opacity: 0.7 }]}>
                <Text style={{ fontFamily: "Outfit", fontSize: 13, color: email ? (theme.textActive ?? theme.text) : "#EF4444" }}>
                  {loadingEmail ? "Loading…" : email || "No notification email on file — set one before booking."}
                </Text>
              </View>
            </Field>

            <Field label="Guest email(s) — up to 10, comma or newline separated" theme={theme}>
              <TextInput
                style={[inputStyle, { height: 60, textAlignVertical: "top" }]}
                placeholder="guest1@ocgbim.com, guest2@ocgbim.com"
                placeholderTextColor={theme.subtext}
                multiline
                value={guestEmailsRaw}
                onChangeText={setGuestEmailsRaw}
              />
            </Field>

            <Field label="Special requests" theme={theme}>
              <TextInput
                style={[inputStyle, { height: 50, textAlignVertical: "top" }]}
                placeholder="Add any special requests"
                placeholderTextColor={theme.subtext}
                multiline
                value={specialRequests}
                onChangeText={setSpecialRequests}
              />
            </Field>

            {/* ── Additional info ── */}
            <Field label="Require Audio and Video Presentation?" theme={theme} raised={avOpen}>
              <SimpleDropdown
                value={avRequirement}
                options={AV_OPTIONS}
                onSelect={(v) => setAvRequirement(v as typeof avRequirement)}
                theme={theme}
                primary={primary}
                onOpenChange={setAvOpen}
              />
            </Field>

            <Field label="Need Wifi? (optional)" theme={theme} raised={wifiOpen}>
              <SimpleDropdown
                value={wifi}
                options={WIFI_OPTIONS}
                onSelect={(v) => setWifi(v as typeof wifi)}
                theme={theme}
                primary={primary}
                onOpenChange={setWifiOpen}
              />
            </Field>

            <Field label="Agenda" required theme={theme}>
              <TextInput
                style={[inputStyle, { height: 70, textAlignVertical: "top" }]}
                placeholder="Add your answer here"
                placeholderTextColor={theme.subtext}
                multiline
                value={agenda}
                onChangeText={setAgenda}
              />
            </Field>

            {error ? (
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 12,
                  color: "#EF4444",
                  marginBottom: 10,
                }}
              >
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
              style={{
                backgroundColor: primary,
                borderRadius: 10,
                paddingVertical: 13,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                marginTop: 6,
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : null}
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 14,
                  color: "#fff",
                }}
              >
                {submitting ? "Booking…" : "Book"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}