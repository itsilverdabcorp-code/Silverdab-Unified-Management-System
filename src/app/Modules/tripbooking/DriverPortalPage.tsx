// app/Driver/DriverPortalPage.tsx
//
// Fleet Ops — Driver Portal
// Native counterpart to the "Driver view (mobile prototype)" screen in
// trip-booking-prototype.html. The HTML version wraps everything in a fake
// phone bezel/notch because it's a static demo meant to be viewed inside a
// desktop browser; here the screen just fills the device's own native
// viewport, but keeps the same visual language as the prototype and the
// rest of the app (theme.* tokens, avatar-initial header, stat row,
// segmented Active/Previous tabs, trip cards with a single "next action"
// button) so it feels like the same product as FleetControlTowerPage.tsx.
//
// IDENTITY: the prototype lets you pick "I am..." from a dropdown of every
// driver, because it's a demo with no real auth. In the real app the
// logged-in AD user already tells us who they are, so instead we match
// the current user to their fleet_drivers row by display name — the same
// way approvedByName / deliveredByName / cancelledByName are matched
// elsewhere in this codebase. If no driver row matches, we show a plain
// "you're not registered as a driver" state instead of the trip list.
//
// DATA: reuses the exact same service calls FleetControlTowerPage.tsx
// already uses (getAllFleetTrips, getAllFleetVehicles, getAllFleetDrivers)
// plus the driver-facing mutations (startFleetTrip, markTripArrived,
// startTripReturn, completeFleetTrip, setVehicleStatus).
//   - startFleetTrip is brand new: approved -> ongoing has no backend route
//     yet. Add POST /fleet/trips/:id/start to server.js (same shape as the
//     existing /arrive, /start-return, /complete routes) and the matching
//     startFleetTrip() export to fleetOps.ts before this button will work.
//   - markTripArrived / startTripReturn / completeFleetTrip currently call
//     PATCH .../status, which 404s against the current server.js routes
//     (POST /arrive, /start-return, /complete) — see the fix already
//     applied to fleetOps.ts for approveFleetTrip; the same
//     POST-instead-of-PATCH fix needs to land for these three too.
//   - setVehicleStatus calls PATCH /fleet/vehicles/:id/status, which
//     doesn't exist on the backend at all yet — the duty-status selector
//     below is wired up and ready, but needs that route added
//     server-side first.
//   - "off_duty" is a NEW vehicle/driver status value that didn't exist
//     before this change (previously only "idle" / "personal" /
//     "maintenance" were used). Make sure FleetVehicle["status"] in
//     types.ts and the backend's allowed-status validation both get
//     "off_duty" added, or the PATCH will reject it.
//
// ADMIN SIDE: FleetControlTowerPage.tsx currently shows the same "Mark as
// Arrived" button for both approved and ongoing trips, since until now
// those two statuses were treated as one step. Once approved trips only
// advance via a driver tapping "Start Trip" here, the admin panel's
// approved-row button should probably just say "Awaiting driver" (or be
// hidden) instead of offering Mark Arrived on a trip nobody's started yet.
// Not changed in this file — flagging it so the two screens don't drift.
//
// DUTY STATUS: replaced the old binary "Personal / Authorized Use" toggle
// with a 3-way selector — Off Duty / On Duty / Personal Use — so a driver
// can set their availability any time, even with no active trip assigned.
// It's driven by the same vehicle.status field the old toggle used
// ("active" == On Duty, "personal" == Personal Use, new "off_duty" value ==
// Off Duty; "idle" is deliberately not used here since the admin side
// already treats "idle" as "Inactive"). The selector locks (shown dimmed,
// non-interactive) while the
// driver has a trip actually in progress (ongoing / arrived / returning) —
// a driver mid-trip shouldn't be able to take their own vehicle off duty
// out from under themselves. It unlocks again once that trip completes.
//
// NOTE: swap the two relative import paths below (ThemeContext, fleetOps)
// to match wherever this file actually lands in your tree — they assume
// app/Driver/DriverPortalPage.tsx, i.e. one level shallower than
// app/Admin/FleetOps/FleetControlTowerPage.tsx.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Linking,
} from "react-native";
import { useTheme } from "../../../theme/ThemeContext";
import {
  getAllFleetTrips,
  getAllFleetVehicles,
  getAllFleetDrivers,
  getAllFleetLocations,
  startFleetTrip,
  markTripArrived,
  startTripReturn,
  completeFleetTrip,
  setDriverDutyStatus,
} from "../../../services/fleetOps";
import {
  ADUser,
  FleetTrip,
  FleetVehicle,
  FleetDriver,
  FleetLocation,
  TripStatus,
  DriverDutyStatus,
} from "../../../../types";

type Props = {
  user: ADUser;
};

const POLL_INTERVAL_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function formatSchedule(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// A trip is "late" once its scheduled time has passed but the driver
// hasn't advanced past that step yet — scheduled departure for a trip
// still sitting in "approved" (Start Trip not tapped), or scheduled
// return time for a round trip sitting in "arrived" (Start Return not
// tapped). Ongoing/returning/completed trips are already moving, so
// they're never flagged late no matter how long they've been running.
function isTripLate(trip: FleetTrip): boolean {
  const now = Date.now();
  if (trip.status === "approved") {
    const departure = new Date(trip.departureDatetime).getTime();
    return !isNaN(departure) && now > departure;
  }
  if (
    trip.status === "arrived" &&
    trip.tripType === "roundtrip" &&
    trip.returnDatetime
  ) {
    const ret = new Date(trip.returnDatetime).getTime();
    return !isNaN(ret) && now > ret;
  }
  return false;
}

const STATUS_DISPLAY: Record<TripStatus, string> = {
  pending: "Pending",
  approved: "Approved — Ready",
  ongoing: "Ongoing",
  arrived: "Arrived",
  returning: "Returning",
  completed: "Completed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

const STATUS_COLORS: Record<TripStatus, { bg: string; text: string }> = {
  pending: { bg: "#fef3c7", text: "#92400e" },
  approved: { bg: "#dbeafe", text: "#1d4ed8" },
  ongoing: { bg: "#dcfce7", text: "#166534" },
  arrived: { bg: "#dbeafe", text: "#1d4ed8" },
  returning: { bg: "#fef3c7", text: "#92400e" },
  completed: { bg: "#e2e8f0", text: "#334155" },
  cancelled: { bg: "#fee2e2", text: "#991b1b" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
};

// ─── Driver duty status ────────────────────────────────────────────────────
// Three states a driver can set for themselves (backed by vehicle.status
// today — see the file-header note about the new "off_duty" value).

const DUTY_STATUS_OPTIONS: {
  key: DriverDutyStatus;
  label: string;
  color: string;
}[] = [
  { key: "off_duty", label: "Off Duty", color: "#64748b" },
  { key: "active", label: "On Duty", color: "#0E9E8F" },
  { key: "personal", label: "Personal Use", color: "#E6952B" },
];

// Mirrors nextDriverAction() in the HTML prototype, plus one explicit step
// the prototype didn't have: a driver must tap "Start Trip" to move an
// approved booking into ongoing before they can mark it arrived — approved
// and ongoing are no longer treated as the same step. One-way trips still
// skip the "return leg" step and go straight from Arrived to Complete.
type NextAction = { label: string; next: TripStatus; color: string };

function nextDriverAction(trip: FleetTrip): NextAction | null {
  if (trip.status === "approved") {
    return { label: "Start Trip", next: "ongoing", color: "#12181F" };
  }
  if (trip.status === "ongoing") {
    return trip.tripType === "oneway"
      ? { label: "Arrived", next: "completed", color: "#0E9E8F" }
      : { label: "Arrived", next: "arrived", color: "#3D6FE0" };
  }
  if (trip.status === "arrived") {
    // Only reachable on a round trip — one-way trips complete straight
    // from "ongoing" above and never pass through this status.
    return { label: "Start Return", next: "returning", color: "#E6952B" };
  }
  if (trip.status === "returning") {
    return { label: "Arrived", next: "completed", color: "#0E9E8F" };
  }
  return null;
}

// A driver is considered "on trip" — and therefore locked out of changing
// their duty status — once they've actually started moving, not just while
// a trip is sitting in approved/pending waiting for them to tap Start Trip.
function isTripInProgress(trip: FleetTrip): boolean {
  return (
    trip.status === "ongoing" ||
    trip.status === "arrived" ||
    trip.status === "returning"
  );
}

// ─── Trip details: address / map helpers ───────────────────────────────────
// Coordinates aren't stored on the trip itself — they live on the matching
// FleetLocation row (via pickupLocationId / dropoffLocationId). A trip whose
// pickup/dropoff was typed in freehand (no preset picked) will have no
// matching location and therefore no coordinates — the UI below falls back
// to address-text-only in that case.

type LatLng = { latitude: number; longitude: number };

function findLocationCoords(
  locationId: string | null | undefined,
  locations: FleetLocation[],
): LatLng | null {
  if (!locationId) return null;
  const loc = locations.find((l) => l.id === locationId);
  if (!loc || loc.latitude == null || loc.longitude == null) return null;
  return { latitude: loc.latitude, longitude: loc.longitude };
}

// Opens the device's Google Maps app (or maps.google.com in a browser) with
// turn-by-turn directions from pickup to drop-off — not from the driver's
// current location — so this shows the actual route of the booked trip.
// Prefers lat/lng when available (exact pin); falls back to the address
// text for either end that has no matching FleetLocation coordinates.
function openTripDirections(
  pickup: LatLng | null,
  pickupText: string,
  dropoff: LatLng | null,
  dropoffText: string,
) {
  const originParam = pickup
    ? `${pickup.latitude},${pickup.longitude}`
    : encodeURIComponent(pickupText);
  const destParam = dropoff
    ? `${dropoff.latitude},${dropoff.longitude}`
    : encodeURIComponent(dropoffText);
  const url = `https://www.google.com/maps/dir/?api=1&origin=${originParam}&destination=${destParam}&travelmode=driving`;
  Linking.openURL(url).catch((err) =>
    console.error("Failed to open Google Maps:", err),
  );
}

async function runDriverAction(
  trip: FleetTrip,
  next: TripStatus,
  activeTrips: FleetTrip[],
): Promise<void> {
  // Block starting a new trip if already mid-trip on another one.
  if (next === "ongoing") {
    const alreadyOnTrip = activeTrips.some(
      (t) =>
        t.id !== trip.id &&
        (t.status === "ongoing" ||
          t.status === "arrived" ||
          t.status === "returning"),
    );
    if (alreadyOnTrip) {
      throw new Error(
        "You already have a trip in progress. Complete it before starting another.",
      );
    }
    return startFleetTrip(trip.id);
  }
  if (next === "arrived") return markTripArrived(trip.id);
  if (next === "returning") return startTripReturn(trip.id);
  if (next === "completed") return completeFleetTrip(trip.id);
}

// ─── Small building blocks ─────────────────────────────────────────────────

function StatusBadge({ status, theme }: { status: TripStatus; theme: any }) {
  const c = STATUS_COLORS[status];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 10.5,
          color: c.text,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {STATUS_DISPLAY[status]}
      </Text>
    </View>
  );
}

function LateBadge() {
  return (
    <View
      style={{
        backgroundColor: "#fee2e2",
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
      }}
    >
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 10.5,
          color: "#dc2626",
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        Late
      </Text>
    </View>
  );
}

function StatCard({
  value,
  label,
  mono,
  theme,
}: {
  value: string | number;
  label: string;
  mono?: boolean;
  theme: any;
}) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 10,
        paddingVertical: 10,
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontFamily: mono ? "Outfit-medium" : "Outfit-medium",
          fontSize: mono ? 13 : 17,
          color: theme.textActive ?? theme.text,
        }}
      >
        {value}
      </Text>
      <Text
        style={{
          fontFamily: "Outfit",
          fontSize: 9.5,
          color: theme.subtext,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginTop: 3,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// Segmented Off Duty / On Duty / Personal Use control. Locks (dimmed,
// untappable) while `locked` is true — i.e. the driver has a trip actually
// in progress — with a short explanatory line underneath.
function DutyStatusSelector({
  current,
  locked,
  busy,
  theme,
  onSelect,
}: {
  current: DriverDutyStatus;
  locked: boolean;
  busy: boolean;
  theme: any;
  onSelect: (status: DriverDutyStatus) => void;
}) {
  const disabled = locked || busy;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 11,
          color: theme.subtext,
          textTransform: "uppercase",
          letterSpacing: 0.4,
          marginBottom: 6,
        }}
      >
        Duty status
      </Text>
      <View
        style={{ flexDirection: "row", gap: 8, opacity: disabled ? 0.5 : 1 }}
      >
        {DUTY_STATUS_OPTIONS.map((opt) => {
          const active = opt.key === current;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => !disabled && onSelect(opt.key)}
              disabled={disabled}
              activeOpacity={0.85}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: active ? opt.color : theme.surface,
                borderWidth: 1,
                borderColor: active ? opt.color : theme.border,
              }}
            >
              {busy && active ? (
                <ActivityIndicator
                  size="small"
                  color={active ? "#fff" : opt.color}
                />
              ) : (
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 11.5,
                    color: active ? "#fff" : theme.subtext,
                    textAlign: "center",
                  }}
                >
                  {opt.label}
                </Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
      {locked && (
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 11,
            color: theme.subtext,
            marginTop: 6,
          }}
        >
          You're on a trip right now — duty status is locked until it's
          completed.
        </Text>
      )}
    </View>
  );
}

function TripCard({
  trip,
  theme,
  busy,
  onAdvance,
  onViewDetails,
}: {
  trip: FleetTrip;
  theme: any;
  busy: boolean;
  onAdvance: (trip: FleetTrip) => void;
  onViewDetails: (trip: FleetTrip) => void;
}) {
  const action = nextDriverAction(trip);
  const late = isTripLate(trip);
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onViewDetails(trip)}
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 14,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
        }}
      >
        <View style={{ flex: 1 }}>
         {/* Pickup */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: "#0E9E8F", flexShrink: 0 }} />
            <Text
              style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }}
              numberOfLines={1}
            >
              {trip.pickupLabel}
            </Text>
          </View>
          {/* Connector line */}
          <View style={{ marginLeft: 3, width: 1, height: 10, backgroundColor: theme.border, marginBottom: 3 }} />
          {/* Dropoff */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: "#3D6FE0", flexShrink: 0 }} />
            <Text
              style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }}
              numberOfLines={1}
            >
              {trip.dropoffLabel}
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 11.5,
              color: theme.subtext,
              marginTop: 3,
            }}
          >
            {formatSchedule(trip.departureDatetime)} · {trip.passengerCount}{" "}
            passenger
            {trip.passengerCount === 1 ? "" : "s"} ·{" "}
            {trip.tripType === "oneway" ? "One way" : "Round trip"}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <StatusBadge status={trip.status} theme={theme} />
          {late && <LateBadge />}
        </View>
      </View>

      {trip.requestorName ? (
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 11.5,
            color: theme.subtext,
            marginTop: 8,
          }}
        >
          For {trip.requestorName}
        </Text>
      ) : null}

      {trip.vehiclePlate ? (
        <View
          style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}
        >
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 11.5,
              color: theme.subtext,
            }}
          >
            Vehicle
          </Text>
          <View
            style={{
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 6,
              paddingHorizontal: 6,
              paddingVertical: 1,
              marginLeft: 6,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 10.5,
                color: theme.textActive ?? theme.text,
              }}
            >
              {trip.vehiclePlate}
            </Text>
          </View>
        </View>
      ) : null}

      {trip.purpose ? (
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 11.5,
            color: theme.subtext,
            marginTop: 6,
          }}
        >
          {trip.purpose}
        </Text>
      ) : null}

      <View style={{ marginTop: 8 }}>
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 11.5,
            color: "#3D6FE0",
          }}
        >
          View route &amp; directions →
        </Text>
      </View>

      {action && (
        <TouchableOpacity
          onPress={() => onAdvance(trip)}
          disabled={busy}
          activeOpacity={0.85}
          style={{
            backgroundColor: action.color,
            borderRadius: 8,
            paddingVertical: 11,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 12,
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13,
                color: "#fff",
              }}
            >
              {action.label}
            </Text>
          )}
        </TouchableOpacity>
      )}

      {trip.status === "completed" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginTop: 10,
            paddingTop: 10,
            borderTopWidth: 1,
            borderTopColor: theme.border,
          }}
        >
          <Text
            style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}
          >
            Trip {trip.tripRef}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DriverPortalPage({ user }: Props) {
  const { theme } = useTheme();
  const ink = "#12181F";

  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [locations, setLocations] = useState<FleetLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<"active" | "history">("active");
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [togglingDutyStatus, setTogglingDutyStatus] = useState(false);
  const [confirmingTrip, setConfirmingTrip] = useState<FleetTrip | null>(null);
  const [viewingTrip, setViewingTrip] = useState<FleetTrip | null>(null);
  const [tripError, setTripError] = useState<string | null>(null);

  const isFirstLoad = React.useRef(true);

  const loadAll = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [t, v, d, l] = await Promise.all([
        getAllFleetTrips(),
        getAllFleetVehicles(),
        getAllFleetDrivers(),
        getAllFleetLocations(),
      ]);
      setTrips(t);
      setVehicles(v);
      setDrivers(d);
      setLocations(l);
    } catch (err) {
      console.error("Driver portal load error:", err);
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const intervalId = setInterval(loadAll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loadAll]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadAll();
  }

  // Match the logged-in AD user to their fleet_drivers row by display name —
  // see the note at the top of this file about why (no real driver-login
  // dropdown needed here, unlike the HTML prototype).
  const myDriver = useMemo(
    () =>
      drivers.find(
        (d) => d.name?.toLowerCase() === user.displayName?.toLowerCase(),
      ),
    [drivers, user.displayName],
  );
  const myVehicle = useMemo(
    () =>
      myDriver?.vehicleId
        ? vehicles.find((v) => v.id === myDriver.vehicleId)
        : undefined,
    [vehicles, myDriver],
  );

  const myTrips = useMemo(
    () =>
      trips.filter(
        (t) => t.driverName?.toLowerCase() === user.displayName?.toLowerCase(),
      ),
    [trips, user.displayName],
  );
  const activeTrips = useMemo(
    () =>
      myTrips
        .filter(
          (t) =>
            t.status !== "completed" &&
            t.status !== "cancelled" &&
            t.status !== "rejected",
        )
        .sort(
          (a, b) =>
            new Date(a.departureDatetime).getTime() -
            new Date(b.departureDatetime).getTime(),
        ),
    [myTrips],
  );
  const historyTrips = useMemo(
    () =>
      myTrips
        .filter((t) => t.status === "completed")
        .sort(
          (a, b) =>
            new Date(b.departureDatetime).getTime() -
            new Date(a.departureDatetime).getTime(),
        ),
    [myTrips],
  );

  // Duty status now lives on the driver, not the vehicle — always settable
  // as long as the driver row exists, with zero dependency on having a
  // vehicle or any trips assigned. Locks only while genuinely mid-trip.
  const isOnTrip = useMemo(
    () => activeTrips.some(isTripInProgress),
    [activeTrips],
  );
  const currentDutyStatus: DriverDutyStatus =
    myDriver?.dutyStatus ?? "off_duty";
  const canSetDutyStatus = !!myDriver;

  async function handleAdvance(trip: FleetTrip) {
    const action = nextDriverAction(trip);
    if (!action) return;
    setBusyTripId(trip.id);
    try {
      await runDriverAction(trip, action.next, activeTrips);
      await loadAll();
    } catch (err: any) {
      if (err?.message) {
        // Expected business-logic block (e.g. already on a trip) —
        // show the error modal instead of logging to console.
        setTripError(err.message);
      } else {
        console.error("Advance trip failed:", err);
      }
    } finally {
      setBusyTripId(null);
      setConfirmingTrip(null);
    }
  }

  // Called from the confirm modal's "Confirm" button — the modal stays open
  // (showing a spinner via busyTripId) until handleAdvance finishes, then closes.
  async function handleConfirmAdvance() {
    if (!confirmingTrip) return;
    await handleAdvance(confirmingTrip);
    // setConfirmingTrip(null) is already called inside handleAdvance's
    // finally block — no need to call it again here.
  }

  async function handleSetDutyStatus(status: DriverDutyStatus) {
    if (!myDriver || status === currentDutyStatus || isOnTrip) return;
    setTogglingDutyStatus(true);
    try {
      await setDriverDutyStatus(myDriver.id, status);
      await loadAll();
    } catch (err) {
      console.error("Set duty status failed:", err);
    } finally {
      setTogglingDutyStatus(false);
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: theme.background,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Header — avatar, greeting, quick stats */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              backgroundColor: ink,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 16,
                color: "#fff",
              }}
            >
              {getInitials(user.displayName)}
            </Text>
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 17,
                color: theme.textActive ?? theme.text,
              }}
            >
              {user.displayName}
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 12,
                color: theme.subtext,
                marginTop: 1,
              }}
            >
              {myVehicle
                ? `Assigned to ${myVehicle.plateNumber}`
                : "No vehicle assigned"}
            </Text>
          </View>
        </View>

        {!myDriver ? (
          <View
            style={{
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 12,
              padding: 18,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13.5,
                color: theme.textActive ?? theme.text,
              }}
            >
              You're not registered as a driver yet
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 12,
                color: theme.subtext,
                marginTop: 4,
                lineHeight: 17,
              }}
            >
              Ask your fleet dispatcher to add you under Fleet Control Tower →
              Drivers before trips can be assigned to you.
            </Text>
          </View>
        ) : (
          <>
            {/* Quick stats */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              <StatCard
                value={activeTrips.length}
                label="Active"
                theme={theme}
              />
              <StatCard
                value={historyTrips.length}
                label="Completed"
                theme={theme}
              />
              <StatCard
                value={myVehicle?.plateNumber ?? "—"}
                label="Vehicle"
                mono
                theme={theme}
              />
            </View>

            {/* Duty status selector — Off Duty / On Duty / Personal Use.
                Settable any time there's no trip in progress, even with
                zero active trips assigned. Locks automatically once a
                trip goes ongoing / arrived / returning. */}
            {canSetDutyStatus && (
              <DutyStatusSelector
                current={currentDutyStatus}
                locked={isOnTrip}
                busy={togglingDutyStatus}
                theme={theme}
                onSelect={handleSetDutyStatus}
              />
            )}

            {/* Segmented tabs */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: theme.surface,
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 999,
                padding: 3,
                marginBottom: 14,
              }}
            >
              {(["active", "history"] as const).map((key) => {
                const active = tab === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => setTab(key)}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      paddingVertical: 8,
                      borderRadius: 999,
                      alignItems: "center",
                      backgroundColor: active ? ink : "transparent",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 12.5,
                        color: active ? "#fff" : theme.subtext,
                      }}
                    >
                      {key === "active" ? "Active trips" : "Previous trips"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Trip list */}
            {tab === "active" ? (
              activeTrips.length === 0 ? (
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 13,
                    color: theme.subtext,
                    textAlign: "center",
                    paddingVertical: 32,
                  }}
                >
                  No active trips assigned to you right now.
                </Text>
              ) : (
                activeTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    theme={theme}
                    busy={busyTripId === trip.id}
                    onAdvance={setConfirmingTrip}
                    onViewDetails={setViewingTrip}
                  />
                ))
              )
            ) : historyTrips.length === 0 ? (
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 13,
                  color: theme.subtext,
                  textAlign: "center",
                  paddingVertical: 32,
                }}
              >
                No completed trips yet.
              </Text>
            ) : (
              historyTrips.map((trip) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  theme={theme}
                  busy={false}
                  onAdvance={setConfirmingTrip}
                  onViewDetails={setViewingTrip}
                />
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Confirm action — intercepts Start Trip / Arrived / Start Return /
          Complete before the mutation actually fires. */}
      <Modal
        visible={!!confirmingTrip}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmingTrip(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setConfirmingTrip(null)}
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
            {confirmingTrip && (
              <>
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 16,
                    color: theme.textActive ?? theme.text,
                    marginBottom: 6,
                  }}
                >
                  {nextDriverAction(confirmingTrip)?.label}?
                </Text>
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 12.5,
                    color: theme.subtext,
                    lineHeight: 18,
                    marginBottom: 18,
                  }}
                >
                  {confirmingTrip.pickupLabel} → {confirmingTrip.dropoffLabel}
                  {"\n"}This updates the trip status right away — make sure
                  you're ready before confirming.
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => setConfirmingTrip(null)}
                    disabled={busyTripId === confirmingTrip.id}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      paddingVertical: 11,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: theme.border,
                      alignItems: "center",
                      opacity: busyTripId === confirmingTrip.id ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 13,
                        color: theme.subtext,
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleConfirmAdvance}
                    disabled={busyTripId === confirmingTrip.id}
                    activeOpacity={0.85}
                    style={{
                      flex: 1,
                      paddingVertical: 11,
                      borderRadius: 8,
                      backgroundColor:
                        nextDriverAction(confirmingTrip)?.color ?? ink,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: busyTripId === confirmingTrip.id ? 0.7 : 1,
                    }}
                  >
                    {busyTripId === confirmingTrip.id ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 13,
                          color: "#fff",
                        }}
                      >
                        Confirm
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Trip Details — full booking info (same fields as the admin's View
          Trip Details modal) plus a single Get Directions button that
          routes pickup → drop-off in Google Maps. */}
      <Modal
        visible={!!viewingTrip}
        transparent
        animationType="fade"
        onRequestClose={() => setViewingTrip(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setViewingTrip(null)}
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
              maxWidth: 380,
              maxHeight: "85%",
              backgroundColor: theme.surface,
              borderRadius: 16,
              padding: 20,
            }}
          >
            {viewingTrip &&
              (() => {
                const pickupCoords = findLocationCoords(
                  viewingTrip.pickupLocationId,
                  locations,
                );
                const dropoffCoords = findLocationCoords(
                  viewingTrip.dropoffLocationId,
                  locations,
                );

                const detailRows: [string, string][] = [
                  ["Requestor", viewingTrip.requestorName],
                  ["Departure", formatSchedule(viewingTrip.departureDatetime)],
                  [
                    "Return",
                    viewingTrip.returnDatetime
                      ? formatSchedule(viewingTrip.returnDatetime)
                      : "—",
                  ],
                  [
                    "Trip type",
                    viewingTrip.tripType === "oneway"
                      ? "One way"
                      : "Round trip",
                  ],
                  ["Passengers", String(viewingTrip.passengerCount)],
                  ["Purpose", viewingTrip.purpose || "—"],
                  ...(viewingTrip.status === "pending"
                    ? []
                    : ([
                        ["Vehicle", viewingTrip.vehiclePlate ?? "Not assigned"],
                        ["Driver", viewingTrip.driverName ?? "Not assigned"],
                        ["Approved by", viewingTrip.approvedByName ?? "—"],
                        [
                          "Approved at",
                          viewingTrip.approvedAt
                            ? formatSchedule(viewingTrip.approvedAt)
                            : "—",
                        ],
                      ] as [string, string][])),
                ];

                return (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        marginBottom: 4,
                      }}
                    >
                     <View style={{ flex: 1, marginRight: 8 }}>
                    {/* Pickup */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 3 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: "#0E9E8F", flexShrink: 0 }} />
                      <Text
                        style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }}
                        numberOfLines={1}
                      >
                        {viewingTrip.pickupLabel}
                      </Text>
                    </View>
                    {/* Connector line */}
                    <View style={{ marginLeft: 3, width: 1, height: 10, backgroundColor: theme.border, marginBottom: 3 }} />
                    {/* Dropoff */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: "#3D6FE0", flexShrink: 0 }} />
                      <Text
                        style={{ fontFamily: "Outfit-medium", fontSize: 13, color: theme.textActive ?? theme.text, flex: 1 }}
                        numberOfLines={1}
                      >
                        {viewingTrip.dropoffLabel}
                      </Text>
                    </View>
                  </View>
                      <StatusBadge status={viewingTrip.status} theme={theme} />
                    </View>
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 12,
                        color: theme.subtext,
                        marginBottom: 16,
                      }}
                    >
                      {viewingTrip.tripRef}
                    </Text>

                    <View
                      style={{
                        borderTopWidth: 1,
                        borderTopColor: theme.border,
                        paddingTop: 14,
                        marginBottom: 16,
                      }}
                    >
                      {detailRows.map(([label, value]) => (
                        <View
                          key={label}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            marginBottom: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit",
                              fontSize: 11.5,
                              color: theme.subtext,
                            }}
                          >
                            {label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Outfit-medium",
                              fontSize: 12.5,
                              color: theme.textActive ?? theme.text,
                              textAlign: "right",
                              flexShrink: 1,
                              marginLeft: 12,
                            }}
                          >
                            {value}
                          </Text>
                        </View>
                      ))}
                      {viewingTrip.status === "rejected" &&
                      viewingTrip.rejectedReason ? (
                        <View style={{ marginTop: 4 }}>
                          <Text
                            style={{
                              fontFamily: "Outfit",
                              fontSize: 11.5,
                              color: theme.subtext,
                              marginBottom: 4,
                            }}
                          >
                            Rejection reason
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Outfit",
                              fontSize: 12.5,
                              color: theme.textActive ?? theme.text,
                            }}
                          >
                            {viewingTrip.rejectedReason}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {viewingTrip.statusHistory &&
                      viewingTrip.statusHistory.length > 0 && (
                        <View
                          style={{
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                            paddingTop: 14,
                            marginBottom: 16,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit-medium",
                              fontSize: 12.5,
                              color: theme.textActive ?? theme.text,
                              marginBottom: 8,
                            }}
                          >
                            Status history
                          </Text>
                          {[...viewingTrip.statusHistory]
                            .sort(
                              (a, b) =>
                                new Date(b.timestamp).getTime() -
                                new Date(a.timestamp).getTime(),
                            )
                            .map((entry, idx) => (
                              <View
                                key={`${entry.status}-${entry.timestamp}-${idx}`}
                                style={{
                                  flexDirection: "row",
                                  justifyContent: "space-between",
                                  marginBottom: 6,
                                }}
                              >
                                <Text
                                  style={{
                                    fontFamily: "Outfit-medium",
                                    fontSize: 12,
                                    color: theme.textActive ?? theme.text,
                                  }}
                                >
                                  {STATUS_DISPLAY[entry.status]}
                                </Text>
                                <Text
                                  style={{
                                    fontFamily: "Outfit",
                                    fontSize: 11,
                                    color: theme.subtext,
                                  }}
                                >
                                  {formatSchedule(entry.timestamp)}
                                </Text>
                              </View>
                            ))}
                        </View>
                      )}

                    <TouchableOpacity
                      onPress={() =>
                        openTripDirections(
                          pickupCoords,
                          viewingTrip.pickupLabel,
                          dropoffCoords,
                          viewingTrip.dropoffLabel,
                        )
                      }
                      activeOpacity={0.85}
                      style={{
                        backgroundColor: "#3D6FE0",
                        borderRadius: 8,
                        paddingVertical: 11,
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 13,
                          color: "#fff",
                        }}
                      >
                        Get Directions (Pickup → Drop-off)
                      </Text>
                    </TouchableOpacity>

                    {/* Same next-action button the trip card shows (Start Trip /
                      Arrived / Start Return / Complete) — tapping it here just
                      hands off to the existing confirm modal, so the actual
                      mutation call still only lives in handleConfirmAdvance. */}
                    {nextDriverAction(viewingTrip) && (
                      <TouchableOpacity
                        onPress={() => {
                          setConfirmingTrip(viewingTrip);
                          setViewingTrip(null);
                        }}
                        activeOpacity={0.85}
                        style={{
                          backgroundColor: nextDriverAction(viewingTrip)!.color,
                          borderRadius: 8,
                          paddingVertical: 11,
                          alignItems: "center",
                          marginBottom: 10,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Outfit-medium",
                            fontSize: 13,
                            color: "#fff",
                          }}
                        >
                          {nextDriverAction(viewingTrip)!.label}
                        </Text>
                      </TouchableOpacity>
                    )}

                    <TouchableOpacity
                      onPress={() => setViewingTrip(null)}
                      activeOpacity={0.8}
                      style={{
                        paddingVertical: 11,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: theme.border,
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
                  </ScrollView>
                );
              })()}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Error modal — used instead of Alert.alert since that doesn't
          work on web. Shows blocking errors like "already on a trip". */}
      <Modal
        visible={!!tripError}
        transparent
        animationType="fade"
        onRequestClose={() => setTripError(null)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setTripError(null)}
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
              maxWidth: 320,
              backgroundColor: theme.surface,
              borderRadius: 16,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 15,
                color: theme.textActive ?? theme.text,
                marginBottom: 8,
              }}
            >
              Cannot start trip
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 13,
                color: theme.subtext,
                lineHeight: 19,
                marginBottom: 18,
              }}
            >
              {tripError}
            </Text>
            <TouchableOpacity
              onPress={() => setTripError(null)}
              activeOpacity={0.85}
              style={{
                backgroundColor: "#ef4444",
                borderRadius: 8,
                paddingVertical: 10,
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13,
                  color: "#fff",
                }}
              >
                OK
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}
