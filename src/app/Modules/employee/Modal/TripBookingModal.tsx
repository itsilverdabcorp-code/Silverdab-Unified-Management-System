import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
} from "react-native";
import { X, Car, Plus, MapPin, Calendar as CalendarIcon, Clock as ClockIcon, CheckCircle, LocateFixed, ArrowRight, ArrowLeft } from "lucide-react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser, displayDepartment } from "../../../../../types";
import { submitTripRequest, getAllFleetLocations, rescheduleFleetTrip, updateFleetTripDropoffs } from "../../../../services/fleetOps";
import { FleetLocation, FleetTrip } from "../../../../../types";
import FleetLocationPickerMap, { searchAddress, reverseGeocode, PlaceResult } from "../../tripbooking/FleetLocationPickerMap";

type TripType = "oneway" | "roundtrip";

type Props = {
  visible: boolean;
  onClose: () => void;
  user: ADUser;
  onSuccess: (tripRef: string) => void;
  // When set, opens in "modify" mode: fields prefill from this trip and
  // submitting updates it instead of creating a new one.
  editTrip?: FleetTrip;
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

export default function TripBookingModal({ visible, onClose, user, onSuccess, editTrip }: Props) {
  if (Platform.OS !== "web") {
    return (
      <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.45)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View style={{ backgroundColor: "#fff", borderRadius: 16, padding: 20, maxWidth: 320 }}>
            <Text style={{ fontFamily: "Outfit-medium", fontSize: 15, marginBottom: 8 }}>
              Trip booking isn't available on mobile yet
            </Text>
            <Text style={{ fontFamily: "Outfit", fontSize: 13, color: "#666", marginBottom: 16 }}>
              Please use the web app to book or modify a trip for now.
            </Text>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.8}
              style={{ alignSelf: "flex-end", paddingVertical: 8, paddingHorizontal: 14 }}
            >
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#4169E1" }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const isEditMode = !!editTrip;
  const safeUser = user ?? ({ username: "", displayName: "" } as ADUser);
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

  // Inline row search — lets the person type directly into a stop's row
  // (pickup or any drop-off) and get the same Photon address suggestions
  // the map's bottom search bar shows, without needing to switch tabs
  // first. `inlineSearchOpenFor` holds "pickup" or a drop-off stop's id.
  const [inlineSearchResults, setInlineSearchResults] = useState<PlaceResult[]>([]);
  const [inlineSearchLoading, setInlineSearchLoading] = useState(false);
  const [inlineSearchOpenFor, setInlineSearchOpenFor] = useState<string | null>(null);
  const [inlineSearchRect, setInlineSearchRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const inlineSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inlineFieldRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Positions the dropdown as a fixed-position overlay anchored to the
  // row's actual on-screen location, rendered outside the scrollable stop
  // list — otherwise the list's overflow:hidden/auto clips or squashes it.
  function openInlineDropdown(fieldKey: string) {
    const el = inlineFieldRefs.current[fieldKey];
    if (el) {
      const rect = el.getBoundingClientRect();
      setInlineSearchRect({ top: rect.bottom + 4, left: rect.left, width: rect.width });
    }
    setInlineSearchOpenFor(fieldKey);
  }

  // Ref to the portaled dropdown's own DOM node, so the outside-click
  // handler below can tell a click inside the dropdown apart from a
  // genuine "outside" click (the dropdown lives in document.body, not
  // inside any of the row refs, so it needs its own check).
  const inlineDropdownElRef = useRef<HTMLDivElement | null>(null);

  // Closes the inline search dropdown when clicking anywhere outside it
  // and outside the row that opened it (clicking back into that same row
  // is handled by its own onFocus, not this listener).
  useEffect(() => {
    if (!inlineSearchOpenFor) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      const activeFieldEl = inlineFieldRefs.current[inlineSearchOpenFor!];
      if (
        inlineDropdownElRef.current?.contains(target) ||
        activeFieldEl?.contains(target)
      ) {
        return;
      }
      setInlineSearchOpenFor(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [inlineSearchOpenFor]);

  function triggerInlineSearch(fieldKey: string, query: string) {
    if (inlineSearchDebounceRef.current) clearTimeout(inlineSearchDebounceRef.current);
    const trimmed = query.trim();
    if (trimmed.length < 3) {
      setInlineSearchResults([]);
      setInlineSearchOpenFor(null);
      return;
    }
    openInlineDropdown(fieldKey);
    setInlineSearchLoading(true);
    inlineSearchDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchAddress(trimmed);
        setInlineSearchResults(results);
      } catch (err) {
        console.error("Inline address search failed:", err);
        setInlineSearchResults([]);
      } finally {
        setInlineSearchLoading(false);
      }
    }, 300);
  }

  const [locatingPickup, setLocatingPickup] = useState(false);
  const [locatePickupError, setLocatePickupError] = useState("");

  function handleUseCurrentLocation() {
    if (!navigator.geolocation) {
      setLocatePickupError("Geolocation isn't supported on this device.");
      return;
    }
    setLocatingPickup(true);
    setLocatePickupError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        // Drop the pin immediately, then backfill the address once
        // reverse geocoding resolves — same snappy-then-refine pattern
        // the map's own click-to-pin handler uses.
        setPickupPoint({ latitude, longitude });
        setPickupLocationId(null);
        setActiveMapField("pickup");
        try {
          const address = await reverseGeocode(latitude, longitude);
          if (address) {
            setPickupPoint({ latitude, longitude, address });
            setPickupText(address);
            setPickupLabelEdited(true);
          }
        } catch (err) {
          console.error("Reverse geocode failed:", err);
        } finally {
          setLocatingPickup(false);
        }
      },
      (err) => {
        console.error("Geolocation failed:", err);
        setLocatePickupError(
          err.code === err.PERMISSION_DENIED
            ? "Location access was denied."
            : "Couldn't get your location.",
        );
        setLocatingPickup(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function handleInlineSelect(fieldKey: string, result: PlaceResult) {
    const point = { latitude: result.lat, longitude: result.lon, address: result.displayName };
    if (fieldKey === "pickup") {
      setPickupPoint(point);
      setPickupLocationId(null);
      setPickupText(result.displayName);
      setPickupLabelEdited(true);
    } else {
      updateStop(fieldKey, {
        point,
        locationId: null,
        text: result.displayName,
        labelEdited: true,
      });
    }
    setActiveMapField(fieldKey);
    setInlineSearchResults([]);
    setInlineSearchOpenFor(null);
  }

  function handleAddStop() {
    const newStop = makeEmptyStop();
    setDropoffStops((prev) => [...prev, newStop]);
    setActiveMapField(newStop.id);
  }

  // Drag-to-reorder for the drop-off stop list — native HTML5 drag/drop,
  // consistent with the other raw-DOM pieces of this modal (web-only).
  const [draggedStopIndex, setDraggedStopIndex] = useState<number | null>(null);
  const [dragOverStopIndex, setDragOverStopIndex] = useState<number | null>(null);

  function reorderDropoffStops(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setDropoffStops((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
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

  // Prefill from the trip being modified, every time the modal opens for it.
  useEffect(() => {
    if (!visible || !editTrip) return;

    setPassengers(editTrip.passengerNames ?? []);

    setPickupText(editTrip.pickupLabel ?? "");
    setPickupLocationId(editTrip.pickupLocationId ?? null);
    setPickupPoint(
      editTrip.pickupLatitude != null && editTrip.pickupLongitude != null
        ? { latitude: editTrip.pickupLatitude, longitude: editTrip.pickupLongitude, address: editTrip.pickupLabel }
        : null,
    );
    setPickupLabelEdited(true);

    const primaryStop: DropoffStop = {
      ...makeEmptyStop(),
      point:
        editTrip.dropoffLatitude != null && editTrip.dropoffLongitude != null
          ? { latitude: editTrip.dropoffLatitude, longitude: editTrip.dropoffLongitude, address: editTrip.dropoffLabel }
          : null,
      text: editTrip.dropoffLabel ?? "",
      locationId: editTrip.dropoffLocationId ?? null,
      labelEdited: true,
    };
    const extraStops: DropoffStop[] = (editTrip.additionalDropoffs ?? []).map((s) => ({
      ...makeEmptyStop(),
      point: s.latitude != null && s.longitude != null ? { latitude: s.latitude, longitude: s.longitude, address: s.locationText } : null,
      text: s.locationText ?? "",
      locationId: s.locationId ?? null,
      labelEdited: true,
    }));
    setDropoffStops([primaryStop, ...extraStops]);
    setActiveMapField("pickup");

    try {
      const d = new Date(editTrip.departureDatetime);
      if (!isNaN(d.getTime())) {
        setDepartureDate(d.toISOString().slice(0, 10));
        setDepartureTime(d.toTimeString().slice(0, 5));
      }
    } catch {}

    setPurpose(editTrip.purpose ?? "");
    setError("");
    setStep("form");
  }, [visible, editTrip]);

    const [departureDate, setDepartureDate] = useState("");
  const [departureTime, setDepartureTime] = useState("");
  const [purpose, setPurpose] = useState("");

  const [step, setStep] = useState<"form" | "route" | "confirm">("form");
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

  // Mobile splits the form into two pages — details, then route/pins.
  // This validates only the details half so "Next" can block on an empty
  // purpose without requiring pins that haven't been set yet.
  function handleNextToRoute() {
    setError("");

    const modifiableStatuses = ["pending", "approved", "arrived"];
    if (isEditMode && editTrip && !modifiableStatuses.includes(editTrip.status)) {
      setError("This trip can no longer be modified.");
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

    setStep("route");
  }

  function handleReview() {
    setError("");

    const modifiableStatuses = ["pending", "approved", "arrived"];
    if (isEditMode && editTrip && !modifiableStatuses.includes(editTrip.status)) {
      setError("This trip can no longer be modified.");
      return;
    }

    // On mobile each error belongs to a specific page — send the person
    // back to the page that actually holds the offending field, otherwise
    // the message renders on a screen they can't see.
    if (!pickupPoint) {
      setError("Set a pickup point on the map.");
      if (isMobile) setStep("route");
      return;
    }
    if (dropoffStops.some((s) => !s.point)) {
      setError("Set a drop-off point for every stop on the map.");
      if (isMobile) setStep("route");
      return;
    }
    if (!departureDate.trim() || !departureTime.trim()) {
      setError("Departure date and time are required.");
      if (isMobile) setStep("form");
      return;
    }
    if (!purpose.trim()) {
      setError("Purpose / remarks is required.");
      if (isMobile) setStep("form");
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

      if (isEditMode && editTrip) {
        // Compare against the same date/time strings the form was
        // prefilled with (see the prefill effect above), not re-parsed
        // Date objects — avoids a false "changed" positive caused by the
        // browser's local timezone differing from the +08:00 offset used
        // when building departureDatetime below.
        const originalDate = new Date(editTrip.departureDatetime);
        const originalDateStr = !isNaN(originalDate.getTime()) ? originalDate.toISOString().slice(0, 10) : "";
        const originalTimeStr = !isNaN(originalDate.getTime()) ? originalDate.toTimeString().slice(0, 5) : "";
        const scheduleChanged = departureDate !== originalDateStr || departureTime !== originalTimeStr;

        if (scheduleChanged) {
          await rescheduleFleetTrip(editTrip.id, departureDatetime);
        }

        // Only call updateFleetTripDropoffs (and thus log "Drop-offs
        // updated") if the drop-offs actually differ from the trip's
        // original stops — otherwise a schedule-only edit falsely shows
        // up as a drop-off change in status history.
        const newDropoffPayload = {
          dropoffLocationId: primaryStop.locationId,
          dropoffLabel: formatStopText(primaryStop),
          dropoffLatitude: primaryStop.point!.latitude,
          dropoffLongitude: primaryStop.point!.longitude,
          additionalDropoffs: extraStops.map((s) => ({
            locationId: s.locationId,
            locationText: formatStopText(s),
            latitude: s.point!.latitude,
            longitude: s.point!.longitude,
          })),
        };

        const originalAdditional = editTrip.additionalDropoffs ?? [];
        const dropoffsChanged =
          newDropoffPayload.dropoffLabel !== editTrip.dropoffLabel ||
          newDropoffPayload.dropoffLatitude !== editTrip.dropoffLatitude ||
          newDropoffPayload.dropoffLongitude !== editTrip.dropoffLongitude ||
          newDropoffPayload.additionalDropoffs.length !== originalAdditional.length ||
          newDropoffPayload.additionalDropoffs.some((s, i) => {
            const orig = originalAdditional[i];
            return (
              !orig ||
              s.locationText !== orig.locationText ||
              s.latitude !== orig.latitude ||
              s.longitude !== orig.longitude
            );
          });

        if (dropoffsChanged) {
          await updateFleetTripDropoffs(editTrip.id, newDropoffPayload);
        }

        resetForm();
        onSuccess(editTrip.tripRef);
        return;
      }

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

  const inlineDropdown =
    inlineSearchOpenFor && inlineSearchRect && (inlineSearchLoading || inlineSearchResults.length > 0) && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={inlineDropdownElRef}
            // @ts-ignore — plain DOM element, className applies the same
            // themed scrollbar CSS injected for the modal's ScrollViews.
            className={SCROLL_THEME_CLASS}
            style={{
              position: "fixed",
              top: inlineSearchRect.top,
              left: inlineSearchRect.left,
              width: inlineSearchRect.width,
              zIndex: 999999,
              backgroundColor: theme.surface,
              border: `1px solid ${theme.border}`,
              borderRadius: 8,
              boxShadow: "0 4px 16px rgba(0,0,0,0.35)",
              maxHeight: 220,
              overflowY: "auto",
            }}
          >
            {inlineSearchLoading ? (
              <div style={{ padding: 10, fontFamily: "Outfit", fontSize: 12, color: theme.subtext }}>
                Searching…
              </div>
            ) : (
              inlineSearchResults.map((r, idx) => (
                <div
                  key={`${r.lat}-${r.lon}-${idx}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleInlineSelect(inlineSearchOpenFor, r);
                  }}
                  style={{
                    padding: "8px 10px",
                    cursor: "pointer",
                    fontFamily: "Outfit",
                    fontSize: 12,
                    color: theme.textActive ?? theme.text,
                    borderBottom: idx !== inlineSearchResults.length - 1 ? `1px solid ${theme.border}` : "none",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover ?? theme.background)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  {r.displayName}
                </div>
              ))
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
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
                {isMobile && step !== "form" ? (
                  <TouchableOpacity
                    onPress={() => setStep(step === "confirm" ? "route" : "form")}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Go back"
                  >
                    <ArrowLeft size={17} color={theme.subtext} />
                  </TouchableOpacity>
                ) : (
                  <Car size={16} color={primary} />
                )}
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 17,
                    color: theme.textActive ?? theme.text,
                  }}
                >
                  {isEditMode ? "Modify Trip" : "Book a Company Vehicle"}
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
                {isMobile
                  ? step === "route"
                    ? "Step 2 of 2 — set your pickup and drop-off pins."
                    : step === "confirm"
                      ? "Review your request before submitting."
                      : "Step 1 of 2 — trip details."
                  : "Fill in your trip details. Dispatch will assign a vehicle and driver once approved."}
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

          {isMobile && (
            <View style={{ height: 3, backgroundColor: theme.border }}>
              <View
                style={{
                  height: 3,
                  width: step === "form" ? "50%" : "100%",
                  backgroundColor: primary,
                }}
              />
            </View>
          )}

          <ScrollView
            // @ts-ignore — react-native-web forwards className to the underlying div
            className={SCROLL_THEME_CLASS}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: isMobile ? 16 : 20, paddingBottom: 30 }}
          >
            {(step === "form" || step === "route") && (
            <>
            <View style={isMobile ? { flexDirection: "column" } : { flexDirection: "row", gap: 24 }}>
            <View style={isMobile ? (step === "form" ? {} : { display: "none" }) : { flex: 1, minWidth: 0 }}>

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
              onPress={isMobile ? handleNextToRoute : handleReview}
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
              {isMobile ? <ArrowRight size={14} color="#fff" /> : <Car size={14} color="#fff" />}
              <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#fff" }}>
                {isMobile
                  ? "Next: set route"
                  : isEditMode
                    ? "Review Changes"
                    : "Review Booking Request"}
              </Text>
            </TouchableOpacity>
            </View>

            {/* ── Right column: Route (map) + labels — given the extra
                width so the map itself can render bigger. ── */}
            <View style={isMobile ? (step === "route" ? { marginTop: 4 } : { display: "none" }) : { flex: 2, minWidth: 0 }}>

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
              <div
                ref={(el) => { inlineFieldRefs.current["pickup"] = el; }}
                style={{ position: "relative", marginBottom: 6 }}
              >
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
                    borderColor: activeMapField === "pickup" ? primary : theme.border,
                  }}
                >
                  <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#22c55e", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: "#fff" }}>P</Text>
                  </View>
                  <TextInput
                    value={pickupText}
                    onFocus={() => {
                      setActiveMapField("pickup");
                      if (inlineSearchResults.length > 0) openInlineDropdown("pickup");
                    }}
                    onChangeText={(text) => {
                      setPickupText(text);
                      setPickupLabelEdited(true);
                      if (pickupLocationId) setPickupLocationId(null);
                      triggerInlineSearch("pickup", text);
                    }}
                    placeholder="Pickup"
                    placeholderTextColor={theme.subtext}
                    style={{
                      flex: 1,
                      fontFamily: "Outfit-medium",
                      fontSize: 13,
                      color: theme.textActive ?? theme.text,
                      padding: 0,
                    }}
                  />
                  {activeMapField === "pickup" && (
                    <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: primary }}>Editing</Text>
                  )}
                  <TouchableOpacity
                    onPress={handleUseCurrentLocation}
                    disabled={locatingPickup}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                    accessibilityLabel="Use my current location"
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: locatingPickup ? 0.5 : 1,
                    }}
                  >
                    <LocateFixed size={14} color={locatingPickup ? theme.subtext : primary} />
                  </TouchableOpacity>
                </View>
                {locatePickupError ? (
                  <Text style={{ fontFamily: "Outfit", fontSize: 10.5, color: "#EF4444", marginTop: 3 }}>
                    {locatePickupError}
                  </Text>
                ) : null}
              </div>

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
                    <div
                      key={stop.id}
                      draggable
                      onDragStart={(e: React.DragEvent) => {
                        setDraggedStopIndex(i);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e: React.DragEvent) => {
                        e.preventDefault();
                        if (draggedStopIndex !== null && draggedStopIndex !== i) {
                          setDragOverStopIndex(i);
                        }
                      }}
                      onDrop={(e: React.DragEvent) => {
                        e.preventDefault();
                        if (draggedStopIndex !== null) {
                          reorderDropoffStops(draggedStopIndex, i);
                        }
                        setDraggedStopIndex(null);
                        setDragOverStopIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedStopIndex(null);
                        setDragOverStopIndex(null);
                      }}
                      style={{
                        opacity: draggedStopIndex === i ? 0.4 : 1,
                        cursor: "grab",
                      }}
                    >
                      <div
                        ref={(el) => { inlineFieldRefs.current[stop.id] = el; }}
                        style={{ position: "relative" }}
                      >
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
                            borderColor:
                              dragOverStopIndex === i
                                ? primary
                                : activeMapField === stop.id
                                  ? primary
                                  : theme.border,
                            borderStyle: dragOverStopIndex === i ? "dashed" : "solid",
                          }}
                        >
                          <View style={{ opacity: 0.5 }}>
                            <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                              <circle cx="2" cy="2" r="1.3" fill={theme.subtext} />
                              <circle cx="8" cy="2" r="1.3" fill={theme.subtext} />
                              <circle cx="2" cy="7" r="1.3" fill={theme.subtext} />
                              <circle cx="8" cy="7" r="1.3" fill={theme.subtext} />
                              <circle cx="2" cy="12" r="1.3" fill={theme.subtext} />
                              <circle cx="8" cy="12" r="1.3" fill={theme.subtext} />
                            </svg>
                          </View>
                          <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontFamily: "Outfit-medium", fontSize: 10.5, color: "#fff" }}>{i + 1}</Text>
                          </View>
                          <TextInput
                            value={stop.text}
                            onFocus={() => {
                              setActiveMapField(stop.id);
                              if (inlineSearchResults.length > 0) openInlineDropdown(stop.id);
                            }}
                            onChangeText={(text) => {
                              updateStop(stop.id, {
                                text,
                                labelEdited: true,
                                locationId: stop.locationId ? null : stop.locationId,
                              });
                              triggerInlineSearch(stop.id, text);
                            }}
                            placeholder={`Drop-off ${i + 1}`}
                            placeholderTextColor={theme.subtext}
                            style={{
                              flex: 1,
                              fontFamily: "Outfit-medium",
                              fontSize: 13,
                              color: theme.textActive ?? theme.text,
                              padding: 0,
                            }}
                          />
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
                        </View>

                      </div>
                    </div>
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
                hideSearch
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
                height={isMobile ? Math.max(300, Math.round(winH * 0.42)) : 480}
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

            {/* Mobile-only action bar for the route page — the desktop
                layout submits from the left column's button, which is
                hidden here, so page 2 needs its own back/review pair. */}
            {isMobile && (
              <View style={{ marginTop: 12 }}>
                {error ? (
                  <Text style={{ fontFamily: "Outfit", fontSize: 12, color: "#EF4444", marginBottom: 8 }}>
                    {error}
                  </Text>
                ) : null}
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setError("");
                      setStep("form");
                    }}
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
                      Back
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleReview}
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
                    }}
                  >
                    <Car size={14} color="#fff" />
                    <Text style={{ fontFamily: "Outfit-medium", fontSize: 13, color: "#fff" }}>
                      {isEditMode ? "Review Changes" : "Review Booking Request"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

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
                    onPress={() => setStep(isMobile ? "route" : "form")}
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
                      {submitting ? "Saving…" : isEditMode ? "Confirm Changes" : "Confirm & Submit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>
        </TouchableOpacity>
      </View>
    </Modal>
    {inlineDropdown}
    </>
  );
}