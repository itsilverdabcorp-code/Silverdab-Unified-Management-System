import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { X, Car, Plus, MapPin, Calendar as CalendarIcon, Clock as ClockIcon, CheckCircle } from "lucide-react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser, displayDepartment } from "../../../../../types";
import { submitTripRequest, getAllFleetLocations } from "../../../../services/fleetOps";
import { FleetLocation } from "../../../../../types";
import FleetLocationPickerMap from "../../tripbooking/FleetLocationPickerMap";

type TripType = "oneway" | "roundtrip";

type Props = {
  visible: boolean;
  onClose: () => void;
  user: ADUser;
  onSuccess: (tripRef: string) => void;
};

function Field({
  label,
  required,
  children,
  theme,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  theme: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 12,
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

// ─── LocationSelect — searchable dropdown, same pattern as the assignee
// SearchableSelect on ITInventoryPage, adapted for FleetLocation records
// fetched from the DB via getAllFleetLocations(). Web-only (div/input),
// consistent with the other raw-DOM pickers already in this modal
// (date/time inputs) since this screen only renders on web.
type LocationSelectProps = {
  text: string;
  locations: FleetLocation[];
  loading: boolean;
  placeholder: string;
  theme: any;
  webInputStyle: React.CSSProperties;
  onTextChange: (text: string) => void;
  onSelect: (loc: FleetLocation) => void;
};

function LocationSelect({
  text,
  locations,
  loading,
  placeholder,
  theme,
  webInputStyle,
  onTextChange,
  onSelect,
}: LocationSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = text.trim()
    ? locations.filter((l) => l.name.toLowerCase().includes(text.trim().toLowerCase()))
    : locations;

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <input
        type="text"
        value={text}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e: any) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        style={{ ...webInputStyle, paddingRight: 12 }}
      />

      {open && (loading || filtered.length > 0) && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 1000,
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
            overflow: "hidden",
          }}
        >
          <div style={{ maxHeight: 176, overflowY: "auto" }}>
            {loading ? (
              <div style={{ padding: 12, fontFamily: "Outfit", fontSize: 12, color: theme.subtext }}>
                Loading…
              </div>
            ) : (
              filtered.map((loc) => (
                <div
                  key={loc.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelect(loc);
                    setOpen(false);
                  }}
                  style={{
                    padding: "8px 12px",
                    cursor: "pointer",
                    fontFamily: "Outfit",
                    fontSize: 12,
                    color: text === loc.name ? (theme.primary ?? "#4169E1") : (theme.textActive ?? theme.text),
                    fontWeight: text === loc.name ? 600 : 400,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover ?? theme.background)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {loc.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function TripBookingModal({ visible, onClose, user, onSuccess }: Props) {
  const { theme } = useTheme();
  const primary = theme.primary ?? "#4169E1";
  const { width: winW, height: winH } = useWindowDimensions();
  const isMobile = winW < 768;

  const departureDateRef = React.useRef<HTMLInputElement>(null);
  const departureTimeRef = React.useRef<HTMLInputElement>(null);
  const passengerInputRef = React.useRef<TextInput>(null);

  // Hides the browser's own built-in calendar/clock icon on native
  // date/time inputs so only our themed icon button shows.
  const DATE_INPUT_CLASS = "trip-booking-date-input";

  // Inject the picker-indicator CSS via document.head instead of a JSX
  // <style> tag — a raw <style> element nested inside RN Views/TouchableOpacity
  // triggers "Unexpected text node ... cannot be a child of a <View>" warnings
  // on react-native-web, since its text-node child isn't wrapped in <Text>.
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "trip-booking-date-input-style";
    if (document.getElementById(styleId)) return;
    const el = document.createElement("style");
    el.id = styleId;
    el.textContent = `
      .${DATE_INPUT_CLASS}::-webkit-calendar-picker-indicator {
        opacity: 0;
        pointer-events: none;
      }
      .${DATE_INPUT_CLASS}::-webkit-inner-spin-button {
        display: none;
      }
    `;
    document.head.appendChild(el);
  }, []);

  // Themed scrollbars — the modal's ScrollViews render as raw overflow
  // divs on web, so the browser default scrollbar ignores our theme.
  // Inject CSS scoped to a class, re-running on theme change so
  // light/dark switches update the bar colors live.
  const SCROLL_THEME_CLASS = "trip-booking-scroll-theme";
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "trip-booking-scrollbar-style";
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = styleId;
      document.head.appendChild(el);
    }
    const track = theme.background;
    const thumb = theme.border;
    const thumbHover = theme.subtext;
    el.textContent = `
      .${SCROLL_THEME_CLASS} {
        scrollbar-width: thin;
        scrollbar-color: ${thumb} ${track};
      }
      .${SCROLL_THEME_CLASS}::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      .${SCROLL_THEME_CLASS}::-webkit-scrollbar-track {
        background: ${track};
        border-radius: 8px;
      }
      .${SCROLL_THEME_CLASS}::-webkit-scrollbar-thumb {
        background-color: ${thumb};
        border-radius: 8px;
        border: 2px solid ${track};
      }
      .${SCROLL_THEME_CLASS}::-webkit-scrollbar-thumb:hover {
        background-color: ${thumbHover};
      }
    `;
  }, [theme.background, theme.border, theme.subtext]);

  const [passengers, setPassengers] = useState<string[]>([]);
  const [passengerInput, setPassengerInput] = useState("");
  const [addingPassenger, setAddingPassenger] = useState(false);

  const [locations, setLocations] = useState<FleetLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [pickupText, setPickupText] = useState("");
  const [pickupLocationId, setPickupLocationId] = useState<string | null>(null);
  const [pickupLabel, setPickupLabel] = useState("");

  // Map pin state — populated automatically when a preset is picked from
  // the dropdown (flies the map to that preset's coords), or set directly
  // by tapping/searching the map when no preset matches what was typed.
  // activeMapField controls which stop's pin the shared map below is
  // currently showing/editing — "pickup" or a dropoff stop's id.
  type PickedPoint = { latitude: number; longitude: number; address?: string };

  // A single drop-off stop. Multiple stops let a trip cover several
  // destinations in order (e.g. drop delegate A at the airport, then
  // delegate B downtown) — each stop gets its own pin, search text,
  // and optional custom label, same shape as the old single dropoff.
  type DropoffStop = {
    id: string;
    point: PickedPoint | null;
    text: string;
    locationId: string | null;
    label: string;
    labelEdited: boolean;
  };

  function makeEmptyStop(): DropoffStop {
    return {
      id: `stop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      point: null,
      text: "",
      locationId: null,
      label: "",
      labelEdited: false,
    };
  }

  const [pickupPoint, setPickupPoint] = useState<PickedPoint | null>(null);
  const [dropoffStops, setDropoffStops] = useState<DropoffStop[]>([makeEmptyStop()]);
  const [activeMapField, setActiveMapField] = useState<string>("pickup");
  // True once the requestor has typed their own custom label for pickup —
  // once set, dropping a new pin no longer overwrites it with the
  // reverse-geocoded address, since a person's own wording wins.
  const [pickupLabelEdited, setPickupLabelEdited] = useState(false);

  function updateStop(stopId: string, patch: Partial<DropoffStop>) {
    setDropoffStops((prev) =>
      prev.map((s) => (s.id === stopId ? { ...s, ...patch } : s)),
    );
  }

  function handleAddStop() {
    const newStop = makeEmptyStop();
    setDropoffStops((prev) => [...prev, newStop]);
    setActiveMapField(newStop.id);
  }

  function handleRemoveStop(stopId: string) {
    setDropoffStops((prev) => {
      const next = prev.filter((s) => s.id !== stopId);
      return next.length > 0 ? next : [makeEmptyStop()];
    });
    setActiveMapField((current) => (current === stopId ? "pickup" : current));
  }

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoadingLocations(true);
    getAllFleetLocations()
      .then((rows) => {
        if (!cancelled) setLocations(rows);
      })
      .finally(() => {
        if (!cancelled) setLoadingLocations(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible]);

    const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [purpose, setPurpose] = useState("");

  const [step, setStep] = useState<"form" | "confirm">("form");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

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

  // Plain-CSS counterpart of inputStyle for native <input> date/time fields —
  // same pattern as the "Date Purchased" column in ITInventoryPage (native
  // input + showPicker() on click, colorScheme matched to the app theme).
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

  // Rounds a "HH:MM" string to the nearest allowed :00/:30 slot — guards
  // against manual keyboard entry, since `step` on <input type="time">
  // only constrains the native picker's scroll increments, not typing.
  function snapToHalfHour(value: string): string {
    if (!value) return value;
    const [hStr, mStr] = value.split(":");
    let h = Number(hStr);
    const m = Number(mStr);
    const snappedMinute = m < 15 ? 0 : m < 45 ? 30 : 0;
    if (m >= 45) h = (h + 1) % 24;
    return `${String(h).padStart(2, "0")}:${String(snappedMinute).padStart(2, "0")}`;
  }

  // Small button style for the calendar/clock trigger icon overlaid on
  // each date/time field — clicking it (not the input) opens the picker,
  // so typing directly into the field's segments still works normally.
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

  function resetForm() {
    setPassengers([]);
    setPassengerInput("");
    setPickupText("");
    setPickupLocationId(null);
    setPickupLabel("");
    setPickupPoint(null);
    setDropoffStops([makeEmptyStop()]);
    setActiveMapField("pickup");
    setPickupLabelEdited(false);
    setDepartureDate("");
    setDepartureTime("");
    setPurpose("");
    setError("");
    setStep("form");
  }

  function handleAddPassenger() {
    const name = passengerInput.trim();
    if (!name) {
      setAddingPassenger(false);
      return;
    }
    setPassengers((prev) => [...prev, name]);
    setPassengerInput("");
    // Keep the field focused so the next name can be typed immediately
    // without tapping back into it.
    passengerInputRef.current?.focus();
  }

  function handleRemovePassenger(index: number) {
    setPassengers((prev) => prev.filter((_, i) => i !== index));
  }

  function handleReview() {
    setError("");

    if (!pickupPoint) {
      setError("Set a pickup point on the map.");
      return;
    }
    if (dropoffStops.some((s) => !s.point)) {
      setError("Set a drop-off point for every stop on the map.");
      return;
    }
    if (!departureDate.trim() || !departureTime.trim()) {
      setError("Departure date and time are required.");
      return;
    }
    if (!purpose.trim()) {
      setError("Purpose / remarks is required.");
      return;
    }

    setStep("confirm");
  }

  function formatStopText(stop: { point: PickedPoint | null; text: string; label: string }) {
    if (!stop.point) return "";
    return (
      (stop.text.trim() ||
        stop.point.address ||
        `${stop.point.latitude.toFixed(5)}, ${stop.point.longitude.toFixed(5)}`) +
      (stop.label.trim() ? ` (${stop.label.trim()})` : "")
    );
  }

  async function handleSubmit() {
    if (!pickupPoint || dropoffStops.some((s) => !s.point)) {
      setError("Set both a pickup and every drop-off point on the map.");
      setStep("form");
      return;
    }

    setError("");
    setSubmitting(true);
    try {
       // Build the departure datetime as an explicit Philippine-time (+08:00)
       // ISO string. This guards against the *browser's* local timezone ever
       // differing from PH time (e.g. testing from a different machine) —
       // the backend still receives a fully explicit, unambiguous instant.
       const departureDatetime = `${departureDate}T${departureTime}:00+08:00`;

      const primaryStop = dropoffStops[0];
      const extraStops = dropoffStops.slice(1);

      const tripRef = await submitTripRequest({
        pickupLocationId: pickupLocationId ?? undefined,
        pickupLocationText:
          (pickupText.trim() ||
            pickupPoint.address ||
            `${pickupPoint.latitude.toFixed(5)}, ${pickupPoint.longitude.toFixed(5)}`) +
          (pickupLabel.trim() ? ` (${pickupLabel.trim()})` : ""),
        pickupLatitude: pickupPoint.latitude,
        pickupLongitude: pickupPoint.longitude,
        dropoffLocationId: primaryStop.locationId ?? undefined,
        dropoffLocationText: formatStopText(primaryStop),
        dropoffLatitude: primaryStop.point!.latitude,
        dropoffLongitude: primaryStop.point!.longitude,
        // Additional stops beyond the first, in visit order — backend/service
        // layer appends these to the trip record for multi-stop trips.
        additionalDropoffs: extraStops.map((s) => ({
          locationId: s.locationId ?? undefined,
          locationText: formatStopText(s),
          latitude: s.point!.latitude,
          longitude: s.point!.longitude,
        })),
        tripType: "oneway",
        departureDatetime,
        purpose: purpose.trim(),
        passengerCount: passengers.length + 1, // +1 for the requestor
        passengerNames: passengers,
      });

      resetForm();
      onSuccess(tripRef);
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit booking request.");
    } finally {
      setSubmitting(false);
    }
  }

  // Wider on the form step (two-column layout needs the room), same as
  // before on the confirm step and on mobile (single column either way).
  const MODAL_W = isMobile
    ? winW - 24
          : step === "form"
        ? Math.min(winW * 0.98, 1280)
        : Math.min(winW * 0.9, 560);

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
            alignSelf: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 24,
            elevation: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              paddingHorizontal: isMobile ? 16 : 20,
              paddingTop: 18,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 10,
                  letterSpacing: 0.5,
                  textTransform: "uppercase",
                  color: theme.subtext,
                  marginBottom: 3,
                }}
              >
                New request
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <Car size={16} color={primary} />
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 17,
                    color: theme.textActive ?? theme.text,
                  }}
                >
                  Book a Company Vehicle
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 12,
                  color: theme.subtext,
                  marginTop: 4,
                  lineHeight: 17,
                }}
              >
                Fill in your trip details. Dispatch will assign a vehicle and
                driver once approved.
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
                marginTop: 4,
              }}
            >
              <X size={15} color={theme.subtext} />
            </TouchableOpacity>
          </View>

          <ScrollView
            // @ts-ignore — react-native-web forwards className to the underlying div
            className={SCROLL_THEME_CLASS}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: isMobile ? 16 : 20, paddingBottom: 30 }}
          >
            {step === "form" && (
            <>
            <View style={isMobile ? { flexDirection: "column" } : { flexDirection: "row", gap: 24 }}>
            <View style={isMobile ? {} : { flex: 1, minWidth: 0 }}>

            {/* ── Card: Trip details ── */}
            <View style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, marginBottom: 10 }}>
                Trip details
              </Text>

            {/* Requestor — now its own full-width row */}
            <Field label="Requestor" theme={theme}>
              <View style={[inputStyle, { opacity: 0.7 }]}>
                <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.textActive ?? theme.text }}>
                  {user.displayName} {user.department ? `— ${displayDepartment(user.department)}` : ""}
                </Text>
              </View>
            </Field>

            {/* Passengers — same row/list pattern as the drop-off stops:
                numbered circle + name + remove X, capped-height scroll,
                dashed "Add another passenger" trigger underneath. */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.textActive ?? theme.text }}>
                Passengers
              </Text>
              <Text style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}>
                {passengers.length + 1} total
              </Text>
            </View>

            <View style={{ marginBottom: 14 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: theme.background,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                  marginBottom: 6,
                }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: "#fff" }}>Y</Text>
                </View>
                <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }} numberOfLines={1}>
                  {user.displayName} (you)
                </Text>
              </View>

              {passengers.length > 0 && (
                <ScrollView
                  // @ts-ignore — react-native-web forwards className to the underlying div
                  className={SCROLL_THEME_CLASS}
                  style={{ maxHeight: 168 }}
                  showsVerticalScrollIndicator
                  nestedScrollEnabled
                >
                  <View style={{ gap: 6 }}>
                    {passengers.map((name, i) => (
                      <View
                        key={`${name}-${i}`}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          paddingVertical: 8,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          backgroundColor: theme.background,
                          borderWidth: 1.5,
                          borderColor: theme.border,
                        }}
                      >
                        <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}>
                          <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: "#fff" }}>{i + 1}</Text>
                        </View>
                        <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }} numberOfLines={1}>
                          {name}
                        </Text>
                        <TouchableOpacity
                          onPress={() => handleRemovePassenger(i)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{ width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                        >
                          <X size={12} color={theme.subtext} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                </ScrollView>
              )}

              {addingPassenger ? (
                <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                  <TextInput
                    ref={passengerInputRef}
                    style={[inputStyle, { flex: 1 }]}
                    placeholder="e.g. Juan Dela Cruz"
                    placeholderTextColor={theme.subtext}
                    value={passengerInput}
                    onChangeText={setPassengerInput}
                    onSubmitEditing={handleAddPassenger}
                    blurOnSubmit={false}
                    autoFocus
                  />
                  <TouchableOpacity
                    onPress={handleAddPassenger}
                    activeOpacity={0.8}
                    style={{
                      backgroundColor: primary,
                      borderRadius: 8,
                      paddingHorizontal: 14,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Plus size={14} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  onPress={() => setAddingPassenger(true)}
                  activeOpacity={0.8}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    paddingVertical: 9,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                    borderStyle: "dashed",
                    marginTop: 6,
                  }}
                >
                  <Plus size={13} color={theme.subtext} />
                  <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.subtext }}>
                    Add another passenger
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            </View>

            {/* ── Card: Schedule ── */}
            <View style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 14 }}>
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, marginBottom: 10 }}>
                Schedule
              </Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Departure date" required theme={theme}>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={departureDateRef as any}
                      type="date"
                      className={DATE_INPUT_CLASS}
                      value={departureDate}
                      onChange={(e: any) => setDepartureDate(e.target.value)}
                      min={new Date().toISOString().slice(0, 10)}
                      style={webInputStyle}
                    />
                    <button
                      type="button"
                      style={pickerIconBtnStyle}
                      onClick={() => departureDateRef.current?.showPicker?.()}
                    >
                      <CalendarIcon size={14} color={theme.subtext} />
                    </button>
                  </div>
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Departure time" required theme={theme}>
                  <div style={{ position: "relative" }}>
                    <input
                      ref={departureTimeRef as any}
                      type="time"
                      step={1800}
                      className={DATE_INPUT_CLASS}
                      value={departureTime}
                      onChange={(e: any) => setDepartureTime(snapToHalfHour(e.target.value))}
                      style={webInputStyle}
                    />
                    <button
                      type="button"
                      style={pickerIconBtnStyle}
                      onClick={() => departureTimeRef.current?.showPicker?.()}
                    >
                      <ClockIcon size={14} color={theme.subtext} />
                    </button>
                  </div>
                </Field>
              </View>
            </View>

            </View>

            {/* ── Card: Purpose ── */}
            <View style={{ backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <Field label="Purpose / remarks" required theme={theme}>
              <TextInput
                style={[inputStyle, { height: 70, textAlignVertical: "top" }]}
                placeholder="e.g. Client visit — pick up 2 delegates from airport arrival"
                placeholderTextColor={theme.subtext}
                multiline
                value={purpose}
                onChangeText={setPurpose}
              />
            </Field>
            </View>

            {error ? (
              <Text style={{ fontFamily: "Outfit", fontSize: 12, color: "#EF4444", marginBottom: 10 }}>
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleReview}
              activeOpacity={0.8}
              style={{
                backgroundColor: primary,
                borderRadius: 8,
                paddingVertical: 13,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                marginTop: 4,
              }}
            >
              <Car size={14} color="#fff" />
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#fff" }}>
                Review Booking Request
              </Text>
            </TouchableOpacity>
            </View>

            {/* ── Right column: Route (map) + labels — given the extra
                width so the map itself can render bigger. ── */}
            <View style={isMobile ? { marginTop: 4 } : { flex: 2, minWidth: 0 }}>

            {/* Pickup / Drop-off pin map — the actual source of truth for
                where the trip starts and ends. Tap the map, search an
                address, or pick an existing preset (grey dots). The tab
                strip switches which stop's pin the shared map below is
                currently showing/editing. Layout is vertical (pickup, then
                each drop-off stacked underneath) rather than a 2-column
                pickup/drop-off split, since there can now be several stops. */}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.textActive ?? theme.text }}>
                Route<Text style={{ color: "#EF4444" }}> *</Text>
              </Text>
              <Text style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}>
                {1 + dropoffStops.length} stop{1 + dropoffStops.length !== 1 ? "s" : ""}
              </Text>
            </View>

            {/* Numbered stop list — same items the old tab row used to
                switch, now shown as rows: green "P" circle for pickup, red
                numbered circles for each drop-off, in visit order. Tapping
                a row still sets which stop the map below is editing. */}
            <View style={{ marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => setActiveMapField("pickup")}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: theme.background,
                  borderWidth: 1.5,
                  borderColor: activeMapField === "pickup" ? primary : theme.border,
                  marginBottom: 6,
                }}
              >
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: "#fff" }}>P</Text>
                </View>
                <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }} numberOfLines={1}>
                  {pickupText || pickupPoint?.address || "Pickup"}
                </Text>
                {activeMapField === "pickup" && (
                  <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: primary }}>Editing</Text>
                )}
              </TouchableOpacity>

              {/* Drop-off list — capped height with its own scroll so a
                  trip with many stops doesn't keep growing the whole
                  modal/form vertically. Pickup row and "Add another
                  drop-off" stay outside the scroll, always visible. */}
              <ScrollView
                // @ts-ignore — react-native-web forwards className to the underlying div
                className={SCROLL_THEME_CLASS}
                style={{ maxHeight: 168 }}
                showsVerticalScrollIndicator
                nestedScrollEnabled
              >
                <View style={{ gap: 6 }}>
                  {dropoffStops.map((stop, i) => (
                    <TouchableOpacity
                      key={stop.id}
                      onPress={() => setActiveMapField(stop.id)}
                      activeOpacity={0.8}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingVertical: 8,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        backgroundColor: theme.background,
                        borderWidth: 1.5,
                        borderColor: activeMapField === stop.id ? primary : theme.border,
                      }}
                    >
                      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: "#fff" }}>{i + 1}</Text>
                      </View>
                      <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }} numberOfLines={1}>
                        {stop.text || stop.point?.address || `Drop-off ${i + 1}`}
                      </Text>
                      {activeMapField === stop.id && (
                        <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: primary }}>Editing</Text>
                      )}
                      {dropoffStops.length > 1 && (
                        <TouchableOpacity
                          onPress={() => handleRemoveStop(stop.id)}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          style={{ width: 22, height: 22, borderRadius: 6, alignItems: "center", justifyContent: "center" }}
                        >
                          <X size={12} color={theme.subtext} />
                        </TouchableOpacity>
                      )}
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>

              <TouchableOpacity
                onPress={handleAddStop}
                activeOpacity={0.8}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 9,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                  borderStyle: "dashed",
                  marginTop: 6,
                }}
              >
                <Plus size={13} color={theme.subtext} />
                <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.subtext }}>
                  Add another drop-off
                </Text>
              </TouchableOpacity>
            </View>

            <Field label="" theme={theme}>

              <FleetLocationPickerMap
                presets={locations}
                allStops={[
                  {
                    key: "pickup",
                    label: pickupText || pickupPoint?.address || "Pickup",
                    point: pickupPoint,
                  },
                  ...dropoffStops.map((stop, i) => ({
                    key: stop.id,
                    label: `Drop-off ${i + 1}: ${stop.text || stop.point?.address || "—"}`,
                    point: stop.point,
                  })),
                ]}
                activeKey={activeMapField}
                value={
                  activeMapField === "pickup"
                    ? pickupPoint
                    : dropoffStops.find((s) => s.id === activeMapField)?.point ?? null
                }
                onPick={(pt: PickedPoint) => {
                  if (activeMapField === "pickup") {
                    setPickupPoint(pt);
                    setPickupLocationId(null);
                    // Prefill the optional label with the map's own
                    // address as soon as it's picked — only while the
                    // requestor hasn't already typed their own wording.
                    if (!pickupLabelEdited && pt.address) setPickupText(pt.address);
                  } else {
                    const stop = dropoffStops.find((s) => s.id === activeMapField);
                    if (!stop) return;
                    updateStop(stop.id, {
                      point: pt,
                      locationId: null,
                      text: !stop.labelEdited && pt.address ? pt.address : stop.text,
                    });
                  }
                }}
                searchValue={
                  activeMapField === "pickup"
                    ? pickupText
                    : dropoffStops.find((s) => s.id === activeMapField)?.text ?? ""
                }
                onSearchChange={(text) => {
                  if (activeMapField === "pickup") {
                    setPickupText(text);
                    setPickupLabelEdited(true);
                    if (pickupLocationId) setPickupLocationId(null);
                  } else {
                    const stop = dropoffStops.find((s) => s.id === activeMapField);
                    if (!stop) return;
                    updateStop(stop.id, {
                      text,
                      labelEdited: true,
                      locationId: stop.locationId ? null : stop.locationId,
                    });
                  }
                }}
                theme={theme}
                height={isMobile ? 260 : 480}
              />

              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginTop: 6,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 11,
                    color: theme.subtext,
                    flex: 1,
                    marginRight: 8,
                  }}
                >
                  {(() => {
                    if (activeMapField === "pickup") {
                      return pickupPoint
                        ? (pickupPoint.address ?? `Pickup pin: ${pickupPoint.latitude.toFixed(5)}, ${pickupPoint.longitude.toFixed(5)}`)
                        : "Tap the map, search an address, or pick a preset to set the pickup pin.";
                    }
                    const stop = dropoffStops.find((s) => s.id === activeMapField);
                    return stop?.point
                      ? (stop.point.address ?? `Drop-off pin: ${stop.point.latitude.toFixed(5)}, ${stop.point.longitude.toFixed(5)}`)
                      : "Tap the map, search an address, or pick a preset to set this drop-off pin.";
                  })()}
                </Text>
                {(() => {
                  const hasPin =
                    activeMapField === "pickup"
                      ? !!pickupPoint
                      : !!dropoffStops.find((s) => s.id === activeMapField)?.point;
                  if (!hasPin) return null;
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        if (activeMapField === "pickup") {
                          setPickupPoint(null);
                        } else {
                          updateStop(activeMapField, { point: null });
                        }
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 11,
                          color: theme.subtext,
                          textDecorationLine: "underline",
                        }}
                      >
                        Clear pin
                      </Text>
                    </TouchableOpacity>
                  );
                })()}
              </View>
            </Field>



            </View>
            </View>
            </>
            )}

            {step === "confirm" && (
              <>
                <View
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 1.5,
                    borderColor: theme.border,
                    borderRadius: 12,
                    padding: 15,
                    marginBottom: 18,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Outfit-medium",
                      fontSize: 10,
                      color: theme.subtext,
                      textTransform: "uppercase",
                      letterSpacing: 0.7,
                      marginBottom: 10,
                    }}
                  >
                    Trip Summary
                  </Text>
                  {[
                    { label: "Requestor", value: `${user.displayName}${user.department ? ` — ${displayDepartment(user.department)}` : ""}` },
                    { label: "Passengers", value: passengers.length > 0 ? `${passengers.length + 1} (${passengers.join(", ")})` : "1 (just you)" },
                    {
                      label: "Pickup",
                      value:
                        (pickupText.trim() || pickupPoint?.address || "—") +
                        (pickupLabel.trim() ? ` (${pickupLabel.trim()})` : ""),
                    },
                    ...dropoffStops.map((stop, i) => ({
                      label: dropoffStops.length > 1 ? `Drop-off ${i + 1}` : "Drop-off",
                      value: formatStopText(stop) || "—",
                    })),
                    { label: "Departure", value: departureDate && departureTime ? `${departureDate} ${departureTime}` : "—" },
                    { label: "Purpose", value: purpose.trim() || "—" },
                  ].map((row, i, arr) => (
                    <View
                      key={row.label}
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        paddingVertical: 7,
                        borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                        borderBottomColor: theme.border,
                        gap: 12,
                      }}
                    >
                      <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.subtext }}>
                        {row.label}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 13,
                          color: theme.textActive ?? theme.text,
                          flexShrink: 1,
                          textAlign: "right",
                        }}
                      >
                        {row.value}
                      </Text>
                    </View>
                  ))}
                </View>

                {error ? (
                  <Text style={{ fontFamily: "Outfit", fontSize: 12, color: "#EF4444", marginBottom: 10 }}>
                    {error}
                  </Text>
                ) : null}

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setStep("form")}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      paddingVertical: 13,
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: theme.border,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.subtext }}>
                      Edit
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
                    style={{
                      flex: 2,
                      backgroundColor: primary,
                      borderRadius: 8,
                      paddingVertical: 13,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                      opacity: submitting ? 0.7 : 1,
                    }}
                  >
                    {submitting ? <ActivityIndicator size="small" color="#fff" /> : <CheckCircle size={14} color="#fff" />}
                    <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#fff" }}>
                      {submitting ? "Submitting…" : "Confirm & Submit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}