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
import Svg, { Path, Circle } from "react-native-svg";
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
import { findShiftOption, computeAutoDutyStatus } from "@/utils/shiftUtils";
import { setupExpoPushNotifications } from "../../../services/pushNotifications";
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
  completed: { bg: "#dcfce7", text: "#166534" },
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
      ? { label: "Complete", next: "completed", color: "#0E9E8F" }
      : { label: "Arrived", next: "arrived", color: "#3D6FE0" };
  }
  if (trip.status === "arrived") {
    // Only reachable on a round trip — one-way trips complete straight
    // from "ongoing" above and never pass through this status.
    return { label: "Start Return", next: "returning", color: "#E6952B" };
  }
  if (trip.status === "returning") {
    return { label: "Complete", next: "completed", color: "#0E9E8F" };
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

function AssignedVehicleRow({
  plateNumber,
  theme,
}: {
  plateNumber?: string;
  theme: any;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom: 16,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
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
          <Path d="M10 17h4V5H2v12h3" />
          <Path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5" />
          <Circle cx={7.5} cy={17.5} r={2.5} />
          <Circle cx={17.5} cy={17.5} r={2.5} />
        </Svg>
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 13,
            color: theme.textActive ?? theme.text,
          }}
        >
          Assigned Vehicle
        </Text>
      </View>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 13,
          color: theme.subtext,
        }}
      >
        {plateNumber ?? "—"}
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

// Big hero status card matching the design: full-bleed colored card (green
// = On Duty, slate/blue = Off Duty, orange = Personal Use), a van icon,
// title + subtitle, and two stacked action buttons — a primary "switch to
// the other inactive state" pill and a secondary "toggle on/off duty" pill.
// Locks (dimmed, untappable) while `locked` is true — i.e. the driver has
// a trip actually in progress.

const DUTY_STATUS_CARD_STYLE: Record<
  DriverDutyStatus,
  { bg: string; title: string; subtitle: string }
> = {
  active: {
    bg: "#22B573",
    title: "You're On Duty",
    subtitle: "Available for trip assignment",
  },
  off_duty: {
    bg: "#5B8BA6",
    title: "You're Off Duty",
    subtitle: "Not available for trip assignment",
  },
  personal: {
    bg: "#E6952B",
    title: "Personal Use",
    subtitle: "Not available for trip assignment",
  },
  leave: {
    bg: "#8B5CF6",
    title: "On Leave",
    subtitle: "Not available — resumes on your next shift",
  },
};

function VanIcon({ color, slashed }: { color: string; slashed?: boolean }) {
  return (
    <Svg
      width={30}
      height={30}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
      <Circle cx={7} cy={17} r={2} />
      <Path d="M9 17h6" />
      <Circle cx={17} cy={17} r={2} />
      {slashed && <Path d="M3 20 21 3" />}
    </Svg>
  );
}

function DutyStatusCard({
  current,
  locked,
  busy,
  theme,
  shiftLabel,
  onSelect,
}: {
  current: DriverDutyStatus;
  locked: boolean;
  busy: boolean;
  theme: any;
  shiftLabel: string;
  onSelect: (status: DriverDutyStatus) => void;
}) {
  const disabled = locked || busy;
  const cardStyle = DUTY_STATUS_CARD_STYLE[current];

  // On Duty / Off Duty is now driven automatically by the driver's
  // assigned shift (computeAutoDutyStatus) — no manual toggle for it.
  // The only thing still settable by hand is Personal Use, layered on top
  // of the shift; tapping it again clears the override and hands control
  // back to the shift.
  const primaryLabel = current === "personal" ? "End Personal Use" : "Switch to Personal Use";
  const primaryTarget: DriverDutyStatus = current === "personal" ? "off_duty" : "personal";

  return (
    <View
      style={{
        backgroundColor: cardStyle.bg,
        borderRadius: 20,
        padding: 24,
        alignItems: "center",
        marginBottom: 16,
        opacity: disabled ? 0.75 : 1,
      }}
    >
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          backgroundColor: "rgba(255,255,255,0.22)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 14,
        }}
      >
        <VanIcon color="#fff" slashed={current === "off_duty"} />
      </View>
      <Text
        style={{
          fontFamily: "Outfit-Bold",
          fontSize: 18,
          color: "#fff",
          marginBottom: 4,
        }}
      >
        {cardStyle.title}
      </Text>
      <Text
        style={{
          fontFamily: "Outfit",
          fontSize: 12.5,
          color: "rgba(255,255,255,0.85)",
          marginBottom: 14,
        }}
      >
        {cardStyle.subtitle}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          backgroundColor: "rgba(0,0,0,0.18)",
          borderRadius: 999,
          paddingVertical: 8,
          paddingHorizontal: 16,
          marginBottom: 18,
        }}
      >
        <MetaIcon name="clock" color="#fff" />
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 12.5,
            color: "#fff",
          }}
        >
          Shift: {shiftLabel}
        </Text>
      </View>

      <TouchableOpacity
        onPress={() => !disabled && onSelect(primaryTarget)}
        disabled={disabled}
        activeOpacity={0.85}
        style={{
          width: "100%",
          borderWidth: 1.5,
          borderColor: "rgba(255,255,255,0.6)",
          borderRadius: 10,
          paddingVertical: 12,
          alignItems: "center",
        }}
      >
        {busy ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <Text
            style={{ fontFamily: "Outfit-medium", fontSize: 13.5, color: "#fff" }}
          >
            {primaryLabel}
          </Text>
        )}
      </TouchableOpacity>

      {locked && (
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 11,
            color: "rgba(255,255,255,0.85)",
            marginTop: 12,
            textAlign: "center",
          }}
        >
          You're on a trip right now — duty status is locked until it's
          completed.
        </Text>
      )}
    </View>
  );
}

function MetaIcon({ name, color }: { name: "clock" | "person" | "car" | "nav"; color: string }) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "clock") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" {...common}>
        <Circle cx={12} cy={12} r={10} />
        <Path d="M12 6v6l4 2" />
      </Svg>
    );
  }
  if (name === "person") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" {...common}>
        <Circle cx={12} cy={8} r={4} />
        <Path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </Svg>
    );
  }
  if (name === "nav") {
    return (
      <Svg width={16} height={16} viewBox="0 0 24 24" {...common}>
        <Path d="m3 11 18-8-8 18-2-8-8-2Z" />
      </Svg>
    );
  }
  // car
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" {...common}>
      <Path d="M10 17h4V5H2v12h3" />
      <Path d="M20 17h2v-3.34a4 4 0 0 0-1.17-2.83L19 9h-5" />
      <Circle cx={7.5} cy={17.5} r={2.5} />
      <Circle cx={17.5} cy={17.5} r={2.5} />
    </Svg>
  );
}

function TripCard({
  trip,
  theme,
  busy,
  isNext,
  locations,
  onAdvance,
  onViewDetails,
}: {
  trip: FleetTrip;
  theme: any;
  busy: boolean;
  isNext?: boolean;
  locations: FleetLocation[];
  onAdvance: (trip: FleetTrip) => void;
  onViewDetails: (trip: FleetTrip) => void;
}) {
  const action = nextDriverAction(trip);
  const late = isTripLate(trip);
  const pickupCoords = findLocationCoords(trip.pickupLocationId, locations);
  const dropoffCoords = findLocationCoords(trip.dropoffLocationId, locations);
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onViewDetails(trip)}
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 14,
        padding: 18,
        marginBottom: 12,
      }}
    >
      {/* Header row — title + status badge */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 19,
            color: theme.textActive ?? theme.text,
          }}
        >
          {isNext
            ? trip.status === "approved"
              ? "Next Trip"
              : "New Trip"
            : `Trip ${trip.tripRef}`}
        </Text>
        <View style={{ alignItems: "flex-end", gap: 5 }}>
          <StatusBadge status={trip.status} theme={theme} />
          {late && <LateBadge />}
        </View>
      </View>

      {/* Route block — big circle/pin markers, address, small label */}
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
        <View style={{ alignItems: "center", width: 20 }}>
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              borderWidth: 5,
              borderColor: "#3D6FE0",
              backgroundColor: theme.surface,
            }}
          />
          <View
            style={{
              width: 2,
              flex: 1,
              minHeight: 28,
              marginTop: 2,
              marginBottom: 2,
              borderLeftWidth: 2,
              borderStyle: "dotted",
              borderColor: theme.border,
            }}
          />
        </View>
        <View style={{ flex: 1, paddingTop: 1 }}>
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 15,
              color: theme.textActive ?? theme.text,
              lineHeight: 21,
            }}
          >
            {trip.pickupLabel}
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 12.5,
              color: theme.subtext,
              marginTop: 2,
            }}
          >
            Pickup
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
        <View style={{ width: 20, alignItems: "center" }}>
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="#DC2626">
            <Path d="M12 2C7.6 2 4 5.6 4 10c0 5.6 8 12 8 12s8-6.4 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
          </Svg>
        </View>
        <View style={{ flex: 1, paddingTop: 1 }}>
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 15,
              color: theme.textActive ?? theme.text,
              lineHeight: 21,
            }}
          >
            {trip.dropoffLabel}
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 12.5,
              color: theme.subtext,
              marginTop: 2,
            }}
          >
            Drop-off
          </Text>
        </View>
      </View>

      {/* Meta row — time, requestor, vehicle */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 18,
          marginBottom: 18,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <MetaIcon name="clock" color="#3D6FE0" />
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 13,
              color: theme.textActive ?? theme.text,
            }}
          >
            {formatSchedule(trip.departureDatetime)}
          </Text>
        </View>
        {trip.requestorName ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MetaIcon name="person" color="#3D6FE0" />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13,
                color: theme.textActive ?? theme.text,
              }}
            >
              {trip.requestorName}
            </Text>
          </View>
        ) : null}
        {trip.vehiclePlate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <MetaIcon name="car" color="#3D6FE0" />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13,
                color: theme.textActive ?? theme.text,
              }}
            >
              {trip.vehiclePlate}
            </Text>
          </View>
        ) : null}
      </View>

      {/* View route & directions — outlined pill button, goes straight to
          Google Maps rather than opening the trip details modal. */}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation?.();
          openTripDirections(pickupCoords, trip.pickupLabel, dropoffCoords, trip.dropoffLabel);
        }}
        activeOpacity={0.8}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderWidth: 1.5,
          borderColor: "#3D6FE0",
          borderRadius: 999,
          paddingVertical: 13,
          marginBottom: 10,
        }}
      >
        <MetaIcon name="nav" color="#3D6FE0" />
        <Text
          style={{ fontFamily: "Outfit-medium", fontSize: 14, color: "#3D6FE0" }}
        >
          View route &amp; directions
        </Text>
      </TouchableOpacity>

      {/* Primary action — full-width filled button */}
      {action && (
        <TouchableOpacity
          onPress={() => onAdvance(trip)}
          disabled={busy}
          activeOpacity={0.85}
          style={{
            backgroundColor: action.color,
            borderRadius: 999,
            paddingVertical: 14,
            alignItems: "center",
            justifyContent: "center",
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 14,
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
            marginTop: 6,
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

  const myShiftOption = useMemo(
    () => findShiftOption(myDriver?.shiftStart, myDriver?.shiftEnd),
    [myDriver],
  );

  // Auto-sync duty status from the driver's assigned shift — no button
  // press required. A manual "personal" override always wins; otherwise
  // "active" only while now falls inside the shift window, "off_duty"
  // outside it. Runs on every poll cycle (loadAll re-runs every
  // POLL_INTERVAL_MS) so it self-corrects as the clock crosses a boundary.
  useEffect(() => {
    if (!myDriver) return;

    // "leave" is a manual override that must survive the auto-sync poll,
    // same as "personal" — but unlike "personal" it should only clear
    // itself automatically the NEXT time today's shift start passes,
    // on a day after it was set. Until then, leave it alone.
    if (myDriver.dutyStatus === "leave") {
      const setAt = myDriver.dutyStatusUpdatedAt
        ? new Date(myDriver.dutyStatusUpdatedAt)
        : null;
      const now = new Date();
      const setOnAnEarlierDay =
        !setAt || setAt.toDateString() !== now.toDateString();

      if (setOnAnEarlierDay && myDriver.shiftStart) {
        const [h, m] = myDriver.shiftStart.split(":").map(Number);
        const shiftStartToday = new Date();
        shiftStartToday.setHours(h, m, 0, 0);

        if (now >= shiftStartToday) {
          const auto = computeAutoDutyStatus(
            myDriver.shiftStart,
            myDriver.shiftEnd,
            null,
          );
          setDriverDutyStatus(myDriver.id, auto).catch((err) =>
            console.error("Auto duty-status sync failed:", err),
          );
        }
      }
      return;
    }

    const auto = computeAutoDutyStatus(
      myDriver.shiftStart,
      myDriver.shiftEnd,
      myDriver.dutyStatus === "personal" ? "personal" : null,
    );
    if (auto !== myDriver.dutyStatus) {
      setDriverDutyStatus(myDriver.id, auto).catch((err) =>
        console.error("Auto duty-status sync failed:", err),
      );
    }
  }, [myDriver]);

  // Register this device for Expo push once we've confirmed the logged-in
  // user actually has a fleet_drivers row — mirrors how sendExpoPushToUser
  // on the backend is only ever fired at drivers, not every employee.
  useEffect(() => {
    if (myDriver) {
      setupExpoPushNotifications();
    }
  }, [myDriver]);

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
    // Manual selection is only ever "personal" or "clear personal" now —
    // clearing falls back to whatever the shift says right now, not a
    // hardcoded off_duty.
    const target =
      status === "personal"
        ? "personal"
        : computeAutoDutyStatus(myDriver.shiftStart, myDriver.shiftEnd, null);
    setTogglingDutyStatus(true);
    try {
      await setDriverDutyStatus(myDriver.id, target);
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
            {/* Duty status hero card — Off Duty / On Duty / Personal Use.
                Settable any time there's no trip in progress, even with
                zero active trips assigned. Locks automatically once a
                trip goes ongoing / arrived / returning. */}
            {canSetDutyStatus && (
              <DutyStatusCard
                current={currentDutyStatus}
                locked={isOnTrip}
                busy={togglingDutyStatus}
                theme={theme}
                shiftLabel={myShiftOption?.label ?? "No shift set"}
                onSelect={handleSetDutyStatus}
              />
            )}

            <AssignedVehicleRow
              plateNumber={myVehicle?.plateNumber}
              theme={theme}
            />

            {/* Segmented tabs — count badge next to each label, matching
                the design ("Active [1]" / "Completed [5]"), underline
                indicator on the selected tab instead of a filled pill. */}
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-evenly",
                gap: 32,
                marginBottom: 14,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              {(
                [
                  { key: "active" as const, label: "Active", count: activeTrips.length },
                  { key: "history" as const, label: "Completed", count: historyTrips.length },
                ]
              ).map((t) => {
                const active = tab === t.key;
                return (
                  <TouchableOpacity
                    key={t.key}
                    onPress={() => setTab(t.key)}
                    activeOpacity={0.8}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingBottom: 10,
                      borderBottomWidth: active ? 2 : 0,
                      borderBottomColor: "#3D6FE0",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 13.5,
                        color: active ? (theme.textActive ?? theme.text) : theme.subtext,
                      }}
                    >
                      {t.label}
                    </Text>
                    <View
                      style={{
                        minWidth: 20,
                        height: 20,
                        borderRadius: 10,
                        paddingHorizontal: 5,
                        backgroundColor: active ? "#3D6FE0" : theme.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 10.5,
                          color: active ? "#fff" : theme.subtext,
                        }}
                      >
                        {t.count}
                      </Text>
                    </View>
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
                activeTrips.map((trip, idx) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    theme={theme}
                    busy={busyTripId === trip.id}
                    isNext={idx === 0}
                    locations={locations}
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
                  locations={locations}
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
                    marginBottom: 12,
                  }}
                >
                  {nextDriverAction(confirmingTrip)?.label}?
                </Text>

                {/* Route block — same dot/connector style as TripCard */}
                <View style={{ marginBottom: 12 }}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 6,
                      marginBottom: 3,
                    }}
                  >
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 999,
                        backgroundColor: "#0E9E8F",
                        flexShrink: 0,
                        marginTop: 4,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 13,
                        color: theme.textActive ?? theme.text,
                        flex: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      {confirmingTrip.pickupLabel}
                    </Text>
                  </View>
                  <View
                    style={{
                      marginLeft: 3,
                      width: 1,
                      height: 10,
                      backgroundColor: theme.border,
                      marginBottom: 3,
                    }}
                  />
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 6,
                    }}
                  >
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 2,
                        backgroundColor: "#3D6FE0",
                        flexShrink: 0,
                        marginTop: 4,
                      }}
                    />
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 13,
                        color: theme.textActive ?? theme.text,
                        flex: 1,
                        flexWrap: "wrap",
                      }}
                    >
                      {confirmingTrip.dropoffLabel}
                    </Text>
                  </View>
                </View>

                {/* Divider */}
                <View
                  style={{
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    marginBottom: 12,
                  }}
                />

                {/* Warning — secondary weight, separated from the route */}
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 11,
                    fontStyle: "italic",
                    color: theme.subtext,
                    lineHeight: 16,
                    marginBottom: 18,
                  }}
                >
                  This updates the trip status right away — make sure you're
                  ready before confirming.
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
                  ["Departure", formatSchedule(viewingTrip.departureDatetime)],
                  [
                    "Trip Type",
                    viewingTrip.tripType === "oneway" ? "One way" : "Round trip",
                  ],
                  ["Purpose", viewingTrip.purpose || "—"],
                  ...(viewingTrip.status === "pending"
                    ? []
                    : ([
                        ["Vehicle", viewingTrip.vehiclePlate ?? "Not assigned"],
                      ] as [string, string][])),
                  ["Requestor", viewingTrip.requestorName],
                ];

                const action = nextDriverAction(viewingTrip);

                return (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {/* Title + status badge */}
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 18,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 19,
                          color: theme.textActive ?? theme.text,
                        }}
                      >
                        {viewingTrip.status === "approved" ? "Next Trip" : "Trip Details"}
                      </Text>
                      <StatusBadge status={viewingTrip.status} theme={theme} />
                    </View>

                    {/* Route block — same style as TripCard */}
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                      <View style={{ alignItems: "center", width: 20 }}>
                        <View
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 8,
                            borderWidth: 5,
                            borderColor: "#3D6FE0",
                            backgroundColor: theme.surface,
                          }}
                        />
                        <View
                          style={{
                            width: 2,
                            flex: 1,
                            minHeight: 28,
                            marginTop: 2,
                            marginBottom: 2,
                            borderLeftWidth: 2,
                            borderStyle: "dotted",
                            borderColor: theme.border,
                          }}
                        />
                      </View>
                      <View style={{ flex: 1, paddingTop: 1 }}>
                        <Text
                          style={{
                            fontFamily: "Outfit-medium",
                            fontSize: 15,
                            color: theme.textActive ?? theme.text,
                            lineHeight: 21,
                          }}
                        >
                          {viewingTrip.pickupLabel}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Outfit",
                            fontSize: 12.5,
                            color: theme.subtext,
                            marginTop: 2,
                          }}
                        >
                          Pickup
                        </Text>
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 }}>
                      <View style={{ width: 20, alignItems: "center" }}>
                        <Svg width={20} height={20} viewBox="0 0 24 24" fill="#DC2626">
                          <Path d="M12 2C7.6 2 4 5.6 4 10c0 5.6 8 12 8 12s8-6.4 8-12c0-4.4-3.6-8-8-8Zm0 11a3 3 0 1 1 0-6 3 3 0 0 1 0 6Z" />
                        </Svg>
                      </View>
                      <View style={{ flex: 1, paddingTop: 1 }}>
                        <Text
                          style={{
                            fontFamily: "Outfit-medium",
                            fontSize: 15,
                            color: theme.textActive ?? theme.text,
                            lineHeight: 21,
                          }}
                        >
                          {viewingTrip.dropoffLabel}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Outfit",
                            fontSize: 12.5,
                            color: theme.subtext,
                            marginTop: 2,
                          }}
                        >
                          Drop-off
                        </Text>
                      </View>
                    </View>

                    {/* View route & directions — outlined pill button */}
                    <TouchableOpacity
                      onPress={() =>
                        openTripDirections(
                          pickupCoords,
                          viewingTrip.pickupLabel,
                          dropoffCoords,
                          viewingTrip.dropoffLabel,
                        )
                      }
                      activeOpacity={0.8}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        borderWidth: 1.5,
                        borderColor: "#3D6FE0",
                        borderRadius: 999,
                        paddingVertical: 13,
                        marginBottom: 18,
                      }}
                    >
                      <MetaIcon name="nav" color="#3D6FE0" />
                      <Text
                        style={{ fontFamily: "Outfit-medium", fontSize: 14, color: "#3D6FE0" }}
                      >
                        View route &amp; directions
                      </Text>
                    </TouchableOpacity>

                    {/* Detail card — label left, value right in accent blue */}
                    <View
                      style={{
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 12,
                        paddingVertical: 6,
                        paddingHorizontal: 16,
                        marginBottom: 18,
                      }}
                    >
                      {detailRows.map(([label, value], idx) => (
                        <View
                          key={label}
                          style={{
                            flexDirection: "row",
                            justifyContent: "space-between",
                            alignItems: "center",
                            paddingVertical: 12,
                            borderTopWidth: idx === 0 ? 0 : 1,
                            borderTopColor: theme.border,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit-medium",
                              fontSize: 13.5,
                              color: theme.textActive ?? theme.text,
                            }}
                          >
                            {label}
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Outfit-medium",
                              fontSize: 13.5,
                              color: "#3D6FE0",
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
                        <View
                          style={{
                            paddingVertical: 12,
                            borderTopWidth: 1,
                            borderTopColor: theme.border,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit-medium",
                              fontSize: 13.5,
                              color: theme.textActive ?? theme.text,
                              marginBottom: 4,
                            }}
                          >
                            Rejection reason
                          </Text>
                          <Text
                            style={{
                              fontFamily: "Outfit",
                              fontSize: 12.5,
                              color: theme.subtext,
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

                    {/* Back + primary action, side by side */}
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <TouchableOpacity
                        onPress={() => setViewingTrip(null)}
                        activeOpacity={0.8}
                        style={{
                          paddingVertical: 14,
                          paddingHorizontal: 22,
                          borderRadius: 999,
                          backgroundColor: theme.background,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Outfit-medium",
                            fontSize: 14,
                            color: theme.subtext,
                          }}
                        >
                          Back
                        </Text>
                      </TouchableOpacity>

                      {action && (
                        <TouchableOpacity
                          onPress={() => {
                            setConfirmingTrip(viewingTrip);
                            setViewingTrip(null);
                          }}
                          activeOpacity={0.85}
                          style={{
                            flex: 1,
                            backgroundColor: action.color,
                            borderRadius: 999,
                            paddingVertical: 14,
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit-medium",
                              fontSize: 14,
                              color: "#fff",
                            }}
                          >
                            {action.label}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
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
