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
import { X, Car, Plus, MapPin, Calendar as CalendarIcon, Clock as ClockIcon } from "lucide-react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser } from "../../../../../types";
import { submitTripRequest, getAllFleetLocations } from "../../../../services/fleetOps";
import { FleetLocation } from "../../../../../types";

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
  const returnDateRef = React.useRef<HTMLInputElement>(null);
  const returnTimeRef = React.useRef<HTMLInputElement>(null);
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

  const [passengers, setPassengers] = useState<string[]>([]);
  const [passengerInput, setPassengerInput] = useState("");

  const [locations, setLocations] = useState<FleetLocation[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(false);
  const [pickupText, setPickupText] = useState("");
  const [pickupLocationId, setPickupLocationId] = useState<string | null>(null);
  const [dropoffText, setDropoffText] = useState("");
  const [dropoffLocationId, setDropoffLocationId] = useState<string | null>(null);

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

  const [tripType, setTripType] = useState<TripType>("roundtrip");
  const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [returnTime, setReturnTime] = useState("");
  const [purpose, setPurpose] = useState("");

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
    setDropoffText("");
    setDropoffLocationId(null);
    setTripType("roundtrip");
    setDepartureDate("");
    setDepartureTime("");
    setReturnDate("");
    setReturnTime("");
    setPurpose("");
    setError("");
  }

  function handleAddPassenger() {
    const name = passengerInput.trim();
    if (!name) return;
    setPassengers((prev) => [...prev, name]);
    setPassengerInput("");
    // Keep the field focused so the next name can be typed immediately
    // without tapping back into it.
    passengerInputRef.current?.focus();
  }

  function handleRemovePassenger(index: number) {
    setPassengers((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    setError("");

    if (!pickupText.trim() || !dropoffText.trim()) {
      setError("Pickup and drop-off locations are required.");
      return;
    }
    if (!departureDate.trim() || !departureTime.trim()) {
      setError("Departure date and time are required.");
      return;
    }
    if (tripType === "roundtrip" && (!returnDate.trim() || !returnTime.trim())) {
      setError("Estimated return date and time are required for a round trip.");
      return;
    }

    setSubmitting(true);
    try {
      const departureDatetime = `${departureDate}T${departureTime}:00`;
      const returnDatetime =
        tripType === "roundtrip" ? `${returnDate}T${returnTime}:00` : undefined;

      const tripRef = await submitTripRequest({
        pickupLocationId: pickupLocationId ?? undefined,
        pickupLocationText: pickupText.trim(),
        dropoffLocationId: dropoffLocationId ?? undefined,
        dropoffLocationText: dropoffText.trim(),
        tripType,
        departureDatetime,
        returnDatetime,
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

  const MODAL_W = isMobile ? winW - 24 : Math.min(winW * 0.9, 560);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
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
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: isMobile ? 16 : 20, paddingBottom: 30 }}
          >
            {/* Requestor / Passenger count */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Requestor" theme={theme}>
                  <View style={[inputStyle, { opacity: 0.7 }]}>
                    <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.textActive ?? theme.text }}>
                      {user.displayName} {user.department ? `— ${user.department}` : ""}
                    </Text>
                  </View>
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label={`Passengers (${passengers.length})`} theme={theme}>
                  <View style={[inputStyle, { opacity: 0.7 }]}>
                    <Text style={{ fontFamily: "Outfit", fontSize: 13, color: theme.subtext }}>
                      {passengers.length > 0 ? passengers.join(", ") : "—"}
                    </Text>
                  </View>
                </Field>
              </View>
            </View>

            {/* Add passenger */}
            <Field label="Add passenger name" theme={theme}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput
                  ref={passengerInputRef}
                  style={[inputStyle, { flex: 1 }]}
                  placeholder="e.g. Juan Dela Cruz"
                  placeholderTextColor={theme.subtext}
                  value={passengerInput}
                  onChangeText={setPassengerInput}
                  onSubmitEditing={handleAddPassenger}
                  blurOnSubmit={false}
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
                    flexDirection: "row",
                    gap: 5,
                  }}
                >
                  <Plus size={14} color="#fff" />
                  <Text style={{ fontFamily: "Outfit-medium", fontSize: 12, color: "#fff" }}>
                    Add
                  </Text>
                </TouchableOpacity>
              </View>
            </Field>

            {passengers.length === 0 ? (
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 11,
                  color: theme.subtext,
                  marginTop: -6,
                  marginBottom: 14,
                }}
              >
                No passengers added yet.
              </Text>
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: -6, marginBottom: 14 }}>
                {passengers.map((name, i) => (
                  <View
                    key={`${name}-${i}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      backgroundColor: theme.background,
                      borderWidth: 1,
                      borderColor: theme.border,
                      borderRadius: 100,
                      paddingLeft: 10,
                      paddingRight: 6,
                      paddingVertical: 5,
                    }}
                  >
                    <Text style={{ fontFamily: "Outfit", fontSize: 12, color: theme.textActive ?? theme.text }}>
                      {name}
                    </Text>
                    <TouchableOpacity onPress={() => handleRemovePassenger(i)} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <X size={11} color={theme.subtext} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Pickup / Dropoff */}
            <View style={{ flexDirection: "row", gap: 12, zIndex: 30, position: "relative" }}>
              <View style={{ flex: 1 }}>
                <Field label="Pickup location" required theme={theme}>
                  <LocationSelect
                    text={pickupText}
                    locations={locations}
                    loading={loadingLocations}
                    placeholder="Type or select pickup location"
                    theme={theme}
                    webInputStyle={webInputStyle}
                    onTextChange={(t) => {
                      setPickupText(t);
                      setPickupLocationId(null);
                    }}
                    onSelect={(loc) => {
                      setPickupText(loc.name);
                      setPickupLocationId(loc.id);
                    }}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Drop-off location" required theme={theme}>
                  <LocationSelect
                    text={dropoffText}
                    locations={locations}
                    loading={loadingLocations}
                    placeholder="Type or select drop-off location"
                    theme={theme}
                    webInputStyle={webInputStyle}
                    onTextChange={(t) => {
                      setDropoffText(t);
                      setDropoffLocationId(null);
                    }}
                    onSelect={(loc) => {
                      setDropoffText(loc.name);
                      setDropoffLocationId(loc.id);
                    }}
                  />
                </Field>
              </View>
            </View>

            {/* Route preview */}
            {Boolean(pickupText.trim() || dropoffText.trim()) && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 14,
                  gap: 8,
                }}
              >
                <Text
                  style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.textActive ?? theme.text, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {pickupText || "Pickup"}
                </Text>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: "#22c55e", flexShrink: 0 }} />
                <View style={{ flex: 1, height: 1, borderStyle: "dashed", borderWidth: 1, borderColor: theme.border }} />
                <MapPin size={12} color="#ef4444" />
                <Text
                  style={{ fontFamily: "Outfit-medium", fontSize: 12, color: theme.textActive ?? theme.text, flexShrink: 1 }}
                  numberOfLines={1}
                >
                  {dropoffText || "Drop-off"}
                </Text>
              </View>
            )}

            {/* Trip type */}
            <Field label="Trip type" theme={theme}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {(["roundtrip", "oneway"] as TripType[]).map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setTripType(opt)}
                    activeOpacity={0.7}
                    style={{
                      flex: 1,
                      borderRadius: 8,
                      paddingVertical: 10,
                      alignItems: "center",
                      backgroundColor: tripType === opt ? primary : theme.background,
                      borderWidth: 1.5,
                      borderColor: tripType === opt ? primary : theme.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 12,
                        color: tripType === opt ? "#fff" : theme.subtext,
                      }}
                    >
                      {opt === "roundtrip" ? "Round trip — returning" : "One way"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {tripType === "roundtrip" && (
                <Text style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext, marginTop: 6 }}>
                  Provide your estimated return schedule below.
                </Text>
              )}
            </Field>

            {/* Departure — typing directly into the field (e.g. arrow keys
                or numbers) still works; the calendar/clock icon is a
                separate click target that opens the native picker without
                stealing focus from the segment being typed. */}
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
                      className={DATE_INPUT_CLASS}
                      value={departureTime}
                      onChange={(e: any) => setDepartureTime(e.target.value)}
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

            {/* Return — only for round trip */}
            {tripType === "roundtrip" && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Field label="Estimated return date" required theme={theme}>
                    <div style={{ position: "relative" }}>
                      <input
                        ref={returnDateRef as any}
                        type="date"
                        className={DATE_INPUT_CLASS}
                        value={returnDate}
                        onChange={(e: any) => setReturnDate(e.target.value)}
                        min={departureDate || new Date().toISOString().slice(0, 10)}
                        style={webInputStyle}
                      />
                      <button
                        type="button"
                        style={pickerIconBtnStyle}
                        onClick={() => returnDateRef.current?.showPicker?.()}
                      >
                        <CalendarIcon size={14} color={theme.subtext} />
                      </button>
                    </div>
                  </Field>
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Estimated return time" required theme={theme}>
                    <div style={{ position: "relative" }}>
                      <input
                        ref={returnTimeRef as any}
                        type="time"
                        className={DATE_INPUT_CLASS}
                        value={returnTime}
                        onChange={(e: any) => setReturnTime(e.target.value)}
                        style={webInputStyle}
                      />
                      <button
                        type="button"
                        style={pickerIconBtnStyle}
                        onClick={() => returnTimeRef.current?.showPicker?.()}
                      >
                        <ClockIcon size={14} color={theme.subtext} />
                      </button>
                    </div>
                  </Field>
                </View>
              </View>
            )}

            {/* Purpose */}
            <Field label="Purpose / remarks" theme={theme}>
              <TextInput
                style={[inputStyle, { height: 70, textAlignVertical: "top" }]}
                placeholder="e.g. Client visit — pick up 2 delegates from airport arrival"
                placeholderTextColor={theme.subtext}
                multiline
                value={purpose}
                onChangeText={setPurpose}
              />
            </Field>

            {error ? (
              <Text style={{ fontFamily: "Outfit", fontSize: 12, color: "#EF4444", marginBottom: 10 }}>
                {error}
              </Text>
            ) : null}

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.8}
              style={{
                backgroundColor: primary,
                borderRadius: 8,
                paddingVertical: 13,
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "row",
                gap: 8,
                opacity: submitting ? 0.7 : 1,
                marginTop: 4,
              }}
            >
              {submitting ? <ActivityIndicator size="small" color="#fff" /> : <Car size={14} color="#fff" />}
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#fff" }}>
                {submitting ? "Submitting…" : "Submit Booking Request"}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}