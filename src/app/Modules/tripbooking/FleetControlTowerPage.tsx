// app/Admin/FleetOps/FleetControlTowerPage.tsx
//
// Fleet Ops — Admin Control Tower
// Mirrors the visual language of OfficeDashboardPage.tsx (theme.* tokens,
// div/table markup, KPI card + panel pattern) so it drops into the same
// admin shell without looking like a different app.
//
// LAYOUT: per request, this page uses a 2-column grid — KPI cards stacked
// in column 1 (narrow, fixed width), Trip Requests panel in column 2 (the
// main working area). This differs from OfficeDashboardPage, which runs
// KPIs as a horizontal row above a 2-column body. Swap the grid-cols value
// below if you'd rather go back to a horizontal KPI row.
//
// DATA: wire the four service calls in loadAll() to your actual fleet
// endpoints (table names from your fleet_* schema: fleet_trips,
// fleet_vehicles, fleet_drivers). Field names below already match those
// tables' columns (camelCased). Swap the import path for ThemeContext to
// match wherever this file actually lives in your tree.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "../../../theme/ThemeContext";
// Adjust this path if it doesn't match — ITInventoryPage.tsx imports the
// same hook to power its assignee SearchableSelect.
import { useEmployees } from "../../../hooks/useEmployees";
import FleetLiveMap from "./FleetLiveMap";
import {
  getAllFleetTrips,
  getAllFleetVehicles,
  getAllFleetDrivers,
  getTramigoDevices,
  approveFleetTrip,
  rejectFleetTrip,
  markTripArrived,
  startTripReturn,
  completeFleetTrip,
  createFleetVehicle,
  createFleetDriver,
  updateFleetVehicle,
  deleteFleetVehicle,
  updateFleetDriver,
  deleteFleetDriver,
  setVehicleStatus,
  TramigoDevice,
} from "../../../services/fleetOps";
import {
  ADUser,
  FleetTrip,
  FleetVehicle,
  FleetDriver,
  TripStatus,
  VehicleStatus,
  VehicleType,
  DriverDutyStatus,
} from "../../../../types";

type Props = {
  user?: ADUser;
  onNavigate?: (
    tab: "fleet_vehicles" | "fleet_drivers" | "fleet_locations",
  ) => void;
};

const POLL_INTERVAL_MS = 5_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  // mysql2's dateStrings option returns "YYYY-MM-DD HH:MM:SS" (space-
  // separated, no timezone). Swapping the space for "T" makes the Date
  // constructor parse it as local wall-clock time per spec, instead of
  // browser-dependent guessing — this must stay in sync with dateStrings:
  // true on the MySQL pool in server.js.
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

// Flags a trip as delayed once it's past its expected departure (still
// pending/approved) or expected return (still out on a round trip), past a
// 15-minute grace period to avoid flagging trips that just barely slipped.
// Recomputed on every render — the page already re-fetches trips every 5s
// (POLL_INTERVAL_MS), so this naturally stays current without its own timer.
const DELAY_GRACE_MS = 15 * 60 * 1000;

function getDelayInfo(trip: FleetTrip): { label: string } | null {
  function lateBy(iso?: string | null): string | null {
    if (!iso) return null;
    const target = new Date(iso).getTime();
    if (isNaN(target)) return null;
    const diffMs = Date.now() - target;
    if (diffMs <= DELAY_GRACE_MS) return null;
    const hrs = diffMs / (60 * 60 * 1000);
    return hrs < 1 ? `${Math.round(diffMs / 60000)}m` : `${hrs.toFixed(hrs < 10 ? 1 : 0)}h`;
  }

  if (trip.status === "pending" || trip.status === "approved") {
    const late = lateBy(trip.departureDatetime);
    if (late) return { label: `Departure ${late} late` };
  }

  if (
    (trip.status === "ongoing" || trip.status === "arrived" || trip.status === "returning") &&
    trip.returnDatetime
  ) {
    const late = lateBy(trip.returnDatetime);
    if (late) return { label: `Return ${late} late` };
  }

  return null;
}


function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Tramigo device names come formatted as "Model - Plate" (e.g. "BYD -
// NOY1168"). Splitting on " - " lets us auto-fill plate/model from
// whichever device the admin picks, instead of asking them to retype
// info Tramigo already has.
function parseTramigoDeviceName(name: string): { model: string; plate: string } {
  const parts = name.split(" - ");
  if (parts.length >= 2) {
    return { model: parts[0].trim(), plate: parts.slice(1).join(" - ").trim() };
  }
  return { model: name.trim(), plate: "" };
}

// ─── Status config (same visual family as StockBadge in OfficeDashboardPage) ─

const TRIP_STATUS_CONFIG: Record<
  TripStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: "Pending", bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  approved: {
    label: "Approved",
    bg: "#dbeafe",
    text: "#1d4ed8",
    dot: "#3b82f6",
  },
  ongoing: { label: "Ongoing", bg: "#dcfce7", text: "#166534", dot: "#22c55e" },
  arrived: { label: "Arrived", bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  returning: {
    label: "Returning",
    bg: "#fef3c7",
    text: "#92400e",
    dot: "#f59e0b",
  },
  completed: {
    label: "Completed",
    bg: "#e2e8f0",
    text: "#334155",
    dot: "#64748b",
  },
  cancelled: {
    label: "Cancelled",
    bg: "#fee2e2",
    text: "#991b1b",
    dot: "#ef4444",
  },
  rejected: {
    label: "Rejected",
    bg: "#fee2e2",
    text: "#991b1b",
    dot: "#ef4444",
  },
};

const VEHICLE_STATUS_CONFIG: Record<
  VehicleStatus,
  { label: string; bg: string; text: string }
> = {
  idle: { label: "Available", bg: "#dcfce7", text: "#166534" },
  active: { label: "On Trip", bg: "#dbeafe", text: "#1d4ed8" },
  maintenance: { label: "Maintenance", bg: "#fee2e2", text: "#991b1b" },
  personal: { label: "Personal use", bg: "#fef3c7", text: "#92400e" },
};

// Vehicle status badge is driven entirely by the booked trip's own status,
// not by vehicle.status (which reflects Tramigo/GPS state) — a vehicle can
// be physically moving without an ongoing booked trip attached to it, and
// that shouldn't show as "Active" here. 'maintenance' still takes priority
// since that's an explicit admin state unrelated to trips or GPS.
function getVehicleDisplayStatus(
  v: FleetVehicle,
  onTripVehicleIds: Set<string>,
): { label: string; bg: string; text: string } {
  // "On Trip" always wins — it reflects a genuinely ongoing booked trip,
  // which should outrank any manually-set status (maintenance, personal,
  // off duty) shown elsewhere.
  if (onTripVehicleIds.has(v.id)) return VEHICLE_STATUS_CONFIG.active;
  // Otherwise defer to whatever status is actually stored on the vehicle
  // (idle/maintenance/personal/off_duty) instead of collapsing everything
  // that isn't "maintenance" down to "Available".
  return VEHICLE_STATUS_CONFIG[v.status] ?? VEHICLE_STATUS_CONFIG.idle;
}

const DUTY_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  off_duty: { label: "Off Duty", bg: "#f1f5f9", text: "#64748b" },
  active: { label: "Available", bg: "#dcfce7", text: "#166534" },
  personal: { label: "Personal Use", bg: "#fef3c7", text: "#92400e" },
};

const FILTER_TABS: { key: "all" | TripStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "ongoing", label: "Ongoing" },
  { key: "arrived", label: "Arrived" },
  { key: "returning", label: "Returning" },
];



// ─── KPI card (stacked variant — full width within its column) ───────────────

function StackedKpiCard({
  icon,
  label,
  value,
  sub,
  valueColor,
  onClick,
  theme,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
  onClick?: () => void;
  theme: any;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        cursor: onClick ? "pointer" : "default",
        height: "100%",
        width: "100%",
      }}
      className="rounded-xl border p-4 flex flex-col justify-between transition-shadow"
      onMouseEnter={(e) => {
        if (onClick)
          e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.primary}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="flex items-center justify-between">
        <span
          style={{ color: theme.subtext }}
          className="text-[11px] font-semibold uppercase tracking-wide"
        >
          {label}
        </span>
        <span style={{ color: theme.subtext }}>{icon}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p
          style={{ color: valueColor ?? theme.text }}
          className="text-4xl font-bold leading-none"
        >
          {value}
        </p>
        {sub && (
          <p style={{ color: theme.subtext }} className="text-xs">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  config,
  size = "md",
}: {
  config: { label: string; bg: string; text: string; dot?: string };
  size?: "sm" | "md";
}) {
  return (
    <span
      style={{ backgroundColor: config.bg, color: config.text }}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap ${
        size === "sm" ? "text-[9.5px]" : "text-[10.5px]"
      }`}
    >
      {config.dot && (
        <span
          style={{
            backgroundColor: config.dot,
            width: 5,
            height: 5,
            borderRadius: "50%",
          }}
          className="inline-block flex-shrink-0"
        />
      )}
      {config.label}
    </span>
  );
}

// ─── Employee searchable select (Add Driver) ───────────────────────────────
// Single-input pattern — same as LocationSelect in TripBookingModal.tsx.
// The visible field IS the search box (type to filter directly); no
// separate trigger + nested search input.
type EmployeeOption = { label: string; value: string };

function EmployeeSearchableSelect({
  value,
  displayName,
  options,
  placeholder = "Type or select an employee",
  theme,
  onChange,
  onTextChange,
}: {
  value: string;
  displayName: string;
  options: EmployeeOption[];
  placeholder?: string;
  theme: any;
  onChange: (value: string, label: string) => void;
  onTextChange: (text: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = displayName.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(displayName.trim().toLowerCase()))
    : options;

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
    <div ref={wrapRef} className="relative w-full">
      <input
        type="text"
        value={displayName}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onTextChange(e.target.value);
          setOpen(true);
        }}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          color: theme.text,
        }}
        className="w-full text-sm px-3 py-2 border rounded-lg"
      />

      {open && filtered.length > 0 && (
        <div
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          className="absolute left-0 right-0 mt-1 rounded-lg shadow-lg border z-50 overflow-hidden"
        >
          <ul className="max-h-44 overflow-y-auto">
            {filtered.map((o) => (
              <li
                key={o.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(o.value, o.label);
                  setOpen(false);
                }}
                style={{ color: o.value === value ? theme.primary : theme.text }}
                className={
                  "px-3 py-1.5 text-xs cursor-pointer " +
                  (o.value === value ? "font-medium" : "")
                }
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover ?? theme.background)}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {o.label}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FleetControlTowerPage({ user, onNavigate }: Props) {
  const { theme } = useTheme();

  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"all" | TripStatus>("all");

  

  // Pending-row assignment drafts, keyed by trip id — lets dispatch pick a
  // vehicle/driver before hitting Approve without touching global state.
  const [assignDrafts, setAssignDrafts] = useState<
    Record<string, { vehicleId: string; driverId: string }>
  >({});
   const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState<Record<string, boolean>>({});

  

  async function handleReassign(trip: FleetTrip) {
    const draft = assignDrafts[trip.id];
    if (!draft?.vehicleId || !draft?.driverId) {
      setRowError((prev) => ({
        ...prev,
        [trip.id]: "Select both a vehicle and a driver.",
      }));
      return;
    }
    setBusyTripId(trip.id);
    try {
      await approveFleetTrip(trip.id, {
        vehicleId: draft.vehicleId,
        driverId: draft.driverId,
      });
      setReassignOpen((prev) => ({ ...prev, [trip.id]: false }));
      await loadAll();
    } catch (err) {
      console.error("Reassign trip failed:", err);
      setRowError((prev) => ({
        ...prev,
        [trip.id]: "Update failed — try again.",
      }));
    } finally {
      setBusyTripId(null);
    }
  }

  // Reject-reason modal
  const [rejectingTrip, setRejectingTrip] = useState<FleetTrip | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Set when a vehicle card is clicked — tells the Live Fleet Map to pan
  // to that vehicle's current position. Bundled with a token that changes
  // on every click (even re-clicking the same vehicle) so the map's effect
  // fires again even if the vehicleId itself didn't change.
  const [focusVehicle, setFocusVehicle] = useState<{ id: string; token: number } | null>(null);

  // View trip details modal
  const [viewingTrip, setViewingTrip] = useState<FleetTrip | null>(null);

  // Add vehicle / driver / location modals
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [addVehicleForm, setAddVehicleForm] = useState({
    plateNumber: "",
    type: "sedan" as VehicleType,
    model: "",
    seatingCapacity: "4",
    tramigoDeviceId: "",
  });
  const [addVehicleError, setAddVehicleError] = useState("");
  const [addVehicleWarning, setAddVehicleWarning] = useState("");
  const [addVehicleSubmitting, setAddVehicleSubmitting] = useState(false);

  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [addDriverForm, setAddDriverForm] = useState({
    username: "",
    displayName: "",
    contactNumber: "",
  });
  const [addDriverError, setAddDriverError] = useState("");
  const [addDriverWarning, setAddDriverWarning] = useState("");
  const [addDriverSubmitting, setAddDriverSubmitting] = useState(false);

  // AD employee directory for the Add Driver picker — same source
  // ITInventoryPage.tsx uses for its assignee SearchableSelect.
  const { employees } = useEmployees();
  const employeeOptions = useMemo(
    () => employees.map((e) => ({ label: e.name, value: e.id })),
    [employees],
  );

  // Names already registered as drivers, for the client-side "already
  // added" warning shown as soon as a matching name is picked. Matched by
  // name (case-insensitive) since FleetDriver.userId is the numeric
  // fleet_drivers user id, not the AD username the employee picker uses —
  // the backend's own 409 check is still the source of truth on submit.
  const existingDriverNames = useMemo(
    () => new Set(drivers.map((d) => d.name?.trim().toLowerCase()).filter(Boolean)),
    [drivers],
  );

  // Plate numbers already registered, for the client-side "already added"
  // warning shown as soon as a matching plate is picked/typed — mirrors
  // existingDriverNames above. The backend's own 409 check on plateNumber
  // is still the source of truth on submit.
  const existingVehiclePlates = useMemo(
    () => new Set(vehicles.map((v) => v.plateNumber?.trim().toLowerCase()).filter(Boolean)),
    [vehicles],
  );

  // Devices from the Tramigo account, loaded on demand when Add/Edit
  // Vehicle opens (not on every poll — the device list rarely changes and
  // requires its own Tramigo login round trip on the backend).
  const [tramigoDevices, setTramigoDevices] = useState<TramigoDevice[]>([]);
  async function loadTramigoDevices() {
    const devices = await getTramigoDevices();
    setTramigoDevices(devices);
  }
  // Devices not already linked to a *different* vehicle. currentVehicleId
  // lets the Edit Vehicle picker still show the device that vehicle is
  // already linked to (otherwise it'd disappear from its own dropdown).
  function unlinkedTramigoDevices(currentVehicleId?: string) {
    const linked = new Set(
      vehicles
        .filter((v) => v.id !== currentVehicleId)
        .map((v) => v.tramigoDeviceId)
        .filter(Boolean),
    );
    return tramigoDevices.filter((d) => !linked.has(d.id));
  }

   const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(    null,
  );
  const [editVehicleForm, setEditVehicleForm] = useState({
    plateNumber: "",
    type: "sedan" as VehicleType,
    model: "",
    seatingCapacity: "4",
    tramigoDeviceId: "",
    status: "idle" as VehicleStatus,
  });
  const [editVehicleError, setEditVehicleError] = useState("");
  const [editVehicleSubmitting, setEditVehicleSubmitting] = useState(false);
  const [confirmDeleteVehicle, setConfirmDeleteVehicle] = useState(false);

  const [editingDriver, setEditingDriver] = useState<FleetDriver | null>(null);
  const [editDriverForm, setEditDriverForm] = useState({
    licenseNumber: "",
    contactNumber: "",
  });
  const [editDriverError, setEditDriverError] = useState("");
  const [editDriverSubmitting, setEditDriverSubmitting] = useState(false);
  const [confirmDeleteDriver, setConfirmDeleteDriver] = useState(false);

  const isFirstLoad = React.useRef(true);

   const loadAll = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [t, v, d] = await Promise.all([
        getAllFleetTrips(),
        getAllFleetVehicles(),
        getAllFleetDrivers(),
      ]);
      setTrips(t);
      setVehicles(v);
      setDrivers(d);
    } catch (err) {      console.error("Control Tower load error:", err);
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const intervalId = setInterval(loadAll, POLL_INTERVAL_MS);
    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAll]);

  // ── KPIs ───────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const tripsToday = trips.filter((t) => isToday(t.departureDatetime)).length;
    // Driven by the booked trip's own status, not vehicle.status (which
    // reflects Tramigo/GPS state) — a vehicle can be physically moving
    // without an ongoing booked trip attached to it, and that shouldn't
    // count here.
    const vehiclesOnTrip = trips.filter((t) => t.status === "ongoing" && t.vehicleId).length;
    const pendingApproval = trips.filter((t) => t.status === "pending").length;
    const underMaintenance = vehicles.filter(
      (v) => v.status === "maintenance",
    ).length;
    return { tripsToday, vehiclesOnTrip, pendingApproval, underMaintenance };
  }, [trips, vehicles]);

  // ── Trip list (filtered, live trips first) ──────────────────────────────────

  const ACTIVE_STATUSES: TripStatus[] = [
    "pending",
    "approved",
    "ongoing",
    "arrived",
    "returning",
  ];

 const filteredTrips = useMemo(() => {
    let result = trips.filter(
      (t) =>
        t.status !== "completed" &&
        t.status !== "cancelled" &&
        t.status !== "rejected",
    );
    if (statusFilter !== "all")
      result = result.filter((t) => t.status === statusFilter);
    return [...result].sort((a, b) => {
      // Today's trips always float to the top, ahead of the active/not-
      // active grouping below — a today trip that's merely "approved"
      // still outranks a tomorrow trip that's "ongoing".
      const aToday = isToday(a.departureDatetime) ? 0 : 1;
      const bToday = isToday(b.departureDatetime) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      const aActive = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (
        new Date(a.departureDatetime).getTime() -
        new Date(b.departureDatetime).getTime()
      );
    });
  }, [trips, statusFilter]);

  const getAvailableVehicles = useCallback(
    (excludeTripId?: string) => {
      // Only lock out vehicles that are genuinely mid-trip — approved trips
      // waiting to start don't count, so the same vehicle can be
      // pre-assigned to multiple future-dated trips.
      const inProgress = trips.filter(
        (t) =>
          (t.status === "ongoing" ||
            t.status === "arrived" ||
            t.status === "returning") &&
          t.id !== excludeTripId,
      );
      const busy = new Set(
        inProgress.map((t) => (t as any).vehicleId).filter(Boolean),
      );
      return vehicles.filter(
        (v) =>
          v.status !== "maintenance" &&
          v.status !== "personal" &&
          !busy.has(v.id),
      );
    },
    [vehicles, trips],
  );

 const getAvailableDrivers = useCallback(
    (excludeTripId?: string) => {
      // Only lock out drivers that are genuinely mid-trip — approved trips
      // waiting to start don't count, so the same driver can be
      // pre-assigned to multiple future-dated trips.
      const inProgress = trips.filter(
        (t) =>
          (t.status === "ongoing" ||
            t.status === "arrived" ||
            t.status === "returning") &&
          t.id !== excludeTripId,
      );
      const busy = new Set(
        inProgress.map((t) => t.driverId).filter(Boolean),
      );
      return drivers.filter((d) => !busy.has(d.userId));
    },
    [drivers, trips],
  );

  const availableVehicles = useMemo(
    () => getAvailableVehicles(),
    [getAvailableVehicles],
  );

  const availableDrivers = useMemo(
    () => getAvailableDrivers(),
    [getAvailableDrivers],
  );

  // Drivers get linked to a vehicle (fleet_drivers.vehicle_id) as soon as a
  // trip is *approved*, but the admin badge should only flip to "on trip"
  // once the driver actually taps Start Trip (status -> ongoing) — an
  // approved-but-not-started trip still shows the driver's own duty status.
  // This is driven entirely by the booked trip's own status, not by
  // vehicle.status (which reflects Tramigo/GPS state), and stays "on trip"
  // through arrived/returning until the trip is completed (or
  // cancelled/rejected, which also frees the driver up).
  const ON_TRIP_STATUSES: TripStatus[] = ["ongoing", "arrived", "returning"];
  const onTripDriverUserIds = useMemo(
    () =>
      new Set(
        trips
          .filter((t) => ON_TRIP_STATUSES.includes(t.status))
          .map((t) => t.driverId)
          .filter(Boolean),
      ),
    [trips],
  );

  // A vehicle shows "Active" only while its booked trip is genuinely
  // ongoing (not just approved/arrived/returning) — matches "Vehicles on
  // trip" KPI above, independent of Tramigo/GPS-derived vehicle.status.
  const onTripVehicleIds = useMemo(
    () =>
      new Set(
        trips
          .filter((t) => t.status === "ongoing")
          .map((t) => t.vehicleId)
          .filter(Boolean) as string[],
      ),
    [trips],
  );

  // Vehicle id -> its currently-ongoing trip, so the vehicle card can show
  // the trip's purpose alongside the assigned driver. Only ongoing trips
  // matter here — same status set onTripVehicleIds itself is built from.
  const ongoingTripByVehicleId = useMemo(() => {
    const map: Record<string, FleetTrip> = {};
    trips.forEach((t) => {
      if (t.status === "ongoing" && t.vehicleId) map[t.vehicleId] = t;
    });
    return map;
  }, [trips]);

  // Vehicle list order: Available first, then On Trip, then Personal Use /
  // Off Duty, then Maintenance last — surfaces genuinely dispatchable
  // vehicles at the top without lumping personal/off-duty vehicles in
  // with them.
  function vehicleRank(v: FleetVehicle): number {
    if (onTripVehicleIds.has(v.id)) return 1; // On Trip
    if (v.status === "personal") return 2; // Personal / Off Duty
    if (v.status === "maintenance") return 3; // Maintenance
    return 0; // Available
  }
  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => vehicleRank(a) - vehicleRank(b)),
    [vehicles, onTripVehicleIds],
  );

  // Driver list order: Available, then Personal Use, then currently on a
  // trip (shown with their vehicle plate), then Off Duty.
  function driverRank(d: FleetDriver): number {
    const onTrip = onTripDriverUserIds.has(d.userId) && !!d.vehiclePlate;
    if (onTrip) return 2; // Plate (Ongoing)
    if (d.dutyStatus === "active") return 0; // Available
    if (d.dutyStatus === "personal") return 1; // Personal Use
    return 3; // Off Duty
  }
  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => driverRank(a) - driverRank(b)),
    [drivers, onTripDriverUserIds],
  );

  // ── Actions ───────────────────────────────────────────────────────────────

  function setDraft(
    tripId: string,
    patch: Partial<{ vehicleId: string; driverId: string }>,
  ) {
    setAssignDrafts((prev) => {
      const existing = prev[tripId] ?? { vehicleId: "", driverId: "" };
      return { ...prev, [tripId]: { ...existing, ...patch } };
    });
    setRowError((prev) => ({ ...prev, [tripId]: "" }));
  }

  async function handleApprove(trip: FleetTrip): Promise<boolean> {
    const draft = assignDrafts[trip.id];
    if (!draft?.vehicleId || !draft?.driverId) {
      setRowError((prev) => ({
        ...prev,
        [trip.id]: "Select both a vehicle and a driver before approving.",
      }));
      return false;
    }
    setBusyTripId(trip.id);
    try {
      await approveFleetTrip(trip.id, {
        vehicleId: draft.vehicleId,
        driverId: draft.driverId,
      });
      await loadAll();
      return true;
    } catch (err) {
      console.error("Approve trip failed:", err);
      setRowError((prev) => ({
        ...prev,
        [trip.id]: "Approval failed — try again.",
      }));
      return false;
    } finally {
      setBusyTripId(null);
    }
  }

  async function handleReject() {
    if (!rejectingTrip) return;
    setBusyTripId(rejectingTrip.id);
    try {
      await rejectFleetTrip(rejectingTrip.id, rejectReason.trim());
      setRejectingTrip(null);
      setRejectReason("");
      await loadAll();
    } catch (err) {
      console.error("Reject trip failed:", err);
    } finally {
      setBusyTripId(null);
    }
  }

  async function handleMarkArrived(trip: FleetTrip) {
    setBusyTripId(trip.id);
    try {
      await markTripArrived(trip.id);
      await loadAll();
    } catch (err) {
      console.error("Mark arrived failed:", err);
    } finally {
      setBusyTripId(null);
    }
  }

  async function handleStartReturn(trip: FleetTrip) {
    setBusyTripId(trip.id);
    try {
      await startTripReturn(trip.id);
      await loadAll();
    } catch (err) {
      console.error("Start return failed:", err);
    } finally {
      setBusyTripId(null);
    }
  }

  async function handleComplete(trip: FleetTrip) {
    setBusyTripId(trip.id);
    try {
      await completeFleetTrip(trip.id);
      await loadAll();
    } catch (err) {
      console.error("Complete trip failed:", err);
    } finally {
      setBusyTripId(null);
    }
  }
  function openEditVehicle(v: FleetVehicle) {
    setEditingVehicle(v);
    setEditVehicleForm({
      plateNumber: v.plateNumber,
      type: v.type,
      model: v.model,
      seatingCapacity: String(v.seatingCapacity),
      tramigoDeviceId: v.tramigoDeviceId ?? "",
      status: v.status,
    });
    setEditVehicleError("");
    setConfirmDeleteVehicle(false);
    loadTramigoDevices();
  }

  async function handleUpdateVehicle() {
    if (!editingVehicle) return;
    if (!editVehicleForm.plateNumber.trim() || !editVehicleForm.model.trim()) {
      setEditVehicleError("Plate number and model are required.");
      return;
    }
    setEditVehicleSubmitting(true);
    setEditVehicleError("");
    try {
      await updateFleetVehicle(editingVehicle.id, {
        plateNumber: editVehicleForm.plateNumber.trim(),
        type: editVehicleForm.type,
        model: editVehicleForm.model.trim(),
        seatingCapacity: parseInt(editVehicleForm.seatingCapacity, 10) || 1,
        tramigoDeviceId: editVehicleForm.tramigoDeviceId || null,
      });
      // Status lives on its own endpoint (PATCH /fleet/vehicles/:id/status)
      // — same one the driver-facing duty toggle already uses — rather than
      // being folded into the generic vehicle-fields update above.
      if (editVehicleForm.status !== editingVehicle.status) {
        await setVehicleStatus(editingVehicle.id, editVehicleForm.status);
      }
      setEditingVehicle(null);
      await loadAll();
    } catch (err) {
      console.error("Update vehicle failed:", err);
      setEditVehicleError(
        err instanceof Error ? err.message : "Failed to update vehicle.",
      );
    } finally {
      setEditVehicleSubmitting(false);
    }
  }

  async function handleDeleteVehicle() {
    if (!editingVehicle) return;
    setEditVehicleSubmitting(true);
    setEditVehicleError("");
    try {
      await deleteFleetVehicle(editingVehicle.id);
      setEditingVehicle(null);
      await loadAll();
    } catch (err) {
      console.error("Delete vehicle failed:", err);
      setEditVehicleError(
        err instanceof Error ? err.message : "Failed to delete vehicle.",
      );
    } finally {
      setEditVehicleSubmitting(false);
    }
  }

  function openEditDriver(d: FleetDriver) {
    setEditingDriver(d);
    setEditDriverForm({
      licenseNumber: d.licenseNumber ?? "",
      contactNumber: d.contactNumber ?? "",
    });
    setEditDriverError("");
    setConfirmDeleteDriver(false);
  }

  async function handleUpdateDriver() {
    if (!editingDriver) return;
    setEditDriverSubmitting(true);
    setEditDriverError("");
    try {
      await updateFleetDriver(editingDriver.id, {
        licenseNumber: editDriverForm.licenseNumber.trim(),
        contactNumber: editDriverForm.contactNumber.trim(),
      });
      setEditingDriver(null);
      await loadAll();
    } catch (err) {
      console.error("Update driver failed:", err);
      setEditDriverError(
        err instanceof Error ? err.message : "Failed to update driver.",
      );
    } finally {
      setEditDriverSubmitting(false);
    }
  }

  async function handleDeleteDriver() {
    if (!editingDriver) return;
    setEditDriverSubmitting(true);
    setEditDriverError("");
    try {
      await deleteFleetDriver(editingDriver.id);
      setEditingDriver(null);
      await loadAll();
    } catch (err) {
      console.error("Delete driver failed:", err);
      setEditDriverError(
        err instanceof Error ? err.message : "Failed to delete driver.",
      );
    } finally {
      setEditDriverSubmitting(false);
    }
  }
  async function handleAddVehicle() {
    if (!addVehicleForm.plateNumber.trim() || !addVehicleForm.model.trim()) {
      setAddVehicleError("Plate number and model are required.");
      return;
    }
    setAddVehicleSubmitting(true);
    setAddVehicleError("");
    try {
      await createFleetVehicle({
        plateNumber: addVehicleForm.plateNumber.trim(),
        type: addVehicleForm.type,
        model: addVehicleForm.model.trim(),
        seatingCapacity: parseInt(addVehicleForm.seatingCapacity, 10) || 1,
        tramigoDeviceId: addVehicleForm.tramigoDeviceId || undefined,
      });
      setAddVehicleOpen(false);
      setAddVehicleForm({
        plateNumber: "",
        type: "sedan",
        model: "",
        seatingCapacity: "4",
        tramigoDeviceId: "",
      });
      await loadAll();
    } catch (err) {
      console.error("Add vehicle failed:", err);
      setAddVehicleError("Failed to add vehicle — try again.");
    } finally {
      setAddVehicleSubmitting(false);
    }
  }

  async function handleAddDriver() {
    if (!addDriverForm.username.trim()) {
      setAddDriverError("Select an employee.");
      return;
    }
    setAddDriverSubmitting(true);
    setAddDriverError("");
    try {
      await createFleetDriver({
        username: addDriverForm.username.trim(),
        contactNumber: addDriverForm.contactNumber.trim(),
      });
      setAddDriverOpen(false);
      setAddDriverForm({ username: "", displayName: "", contactNumber: "" });
      setAddDriverWarning("");
      await loadAll();
    } catch (err) {
      console.error("Add driver failed:", err);
      // Surface the backend's actual message (e.g. its own 409 "already
      // registered as a driver" check) instead of a generic string.
      setAddDriverError(
        err instanceof Error ? err.message : "Failed to add driver — try again.",
      );
    } finally {
      setAddDriverSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{ backgroundColor: theme.background }}
        className="flex flex-1 items-center justify-center h-full"
      >
        <div
          style={{ borderColor: theme.primary }}
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
       <style>{`
        .fct-scroll::-webkit-scrollbar { width: 6px; }
        .fct-scroll::-webkit-scrollbar-track { background: transparent; }
        .fct-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .fct-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
        /* All modal backdrops share this background — force them above the
           Live Fleet Map's zoom/compass/attribution controls, which come
           with their own z-index baked into maplibre-gl.css and would
           otherwise float on top of an open modal. */
        div.absolute.inset-0[style*="rgba(0,0,0,0.6)"] {
          z-index: 1000;
        }
      `}</style>

      <div
        className="fct-scroll flex-1 overflow-y-auto px-5 pb-5"
        style={{ paddingBottom: 40 }}
      >
        <div className="pt-5 pb-4 flex items-start justify-between gap-3">
          <div>
            <h1
              style={{ color: theme.text }}
              className="text-xl font-bold leading-tight"
            >
              Fleet Control Tower
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Overview for {today}
            </p>
          </div>
              </div>

      <div className="flex flex-col gap-6">
              {/* ── Section 1: 4-column grid — Map (col 1-2) · Vehicles (col 3) · Drivers (col 4) ── */}
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                {/* Columns 1–2 — Live Fleet Map */}
                <div className="lg:col-span-2">
                  <div className="mb-2">
                    <h3
                      style={{ color: theme.text }}
                      className="text-sm font-semibold mb-0.5"
                    >
                      Live Fleet Map
                    </h3>
                    <p style={{ color: theme.subtext }} className="text-[11px]">
                      Real-time vehicle positions.
                    </p>
                  </div>
                  <div
                    style={{ height: 450 }}
                    className="w-full overflow-hidden rounded-xl"
                  >
                    <FleetLiveMap
                      focusVehicle={focusVehicle}
                      vehicles={vehicles}
                      theme={theme}
                    />
                  </div>
                </div>

                {/* Column 3 — Vehicles */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3
                        style={{ color: theme.text }}
                        className="text-sm font-semibold mb-0.5"
                      >
                        Vehicles
                      </h3>
                      <p
                        style={{ color: theme.subtext }}
                        className="text-[11px]"
                      >
                        Fleet roster with live monitoring.
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setAddVehicleOpen(true);
                        setAddVehicleWarning("");
                        loadTramigoDevices();
                      }}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border whitespace-nowrap flex-shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                  {vehicles.length === 0 ? (
                    <p style={{ color: theme.subtext }} className="text-xs">
                      No vehicles yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 max-h-[450px] overflow-y-auto fct-scroll pr-1">
                      {sortedVehicles.map((v) => {
                        const vCfg = getVehicleDisplayStatus(v, onTripVehicleIds);
                        const isAvailable = v.status === "idle" && !onTripVehicleIds.has(v.id);
                        return (
                          <div
                            key={v.id}
                            onClick={() => setFocusVehicle({ id: v.id, token: Date.now() })}
                            style={{
                              backgroundColor: theme.surface,
                              borderColor: theme.border,
                              cursor: "pointer",
                              opacity: isAvailable ? 1 : 0.55,
                            }}
                            className="rounded-xl border p-3.5 transition-opacity"
                          >
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div>
                                <p
                                  style={{ color: theme.text }}
                                  className="text-[13.5px] font-semibold"
                                >
                                  {v.model || "—"}
                                </p>
                                <span
                                  style={{
                                    backgroundColor: theme.surface,
                                    color: theme.text,
                                    borderColor: theme.border,
                                  }}
                                  className="inline-block mt-1 px-1.5 py-0.5 rounded border font-mono text-[11px] font-semibold"
                                >
                                  {v.plateNumber || "No plate"}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-shrink-0">
                                <StatusBadge config={vCfg} size="sm" />
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditVehicle(v);
                                  }}
                                  style={{
                                    color: theme.subtext,
                                    borderColor: theme.border,
                                  }}
                                  className="p-1 rounded-md border"
                                  aria-label="Edit vehicle"
                                >
                                  <svg
                                    width="12"
                                    height="12"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                            <div
                              style={{ color: theme.subtext }}
                              className="text-[11.5px] flex justify-between mt-1.5"
                            >
                              <span>Seating capacity</span>
                              <span
                                style={{ color: theme.text }}
                                className="font-semibold"
                              >
                                {v.seatingCapacity} pax
                              </span>
                            </div>
                            {v.currentTripLabel && (
                              <div
                                style={{ color: theme.subtext }}
                                className="text-[11.5px] flex justify-between mt-1"
                              >
                                <span>Current trip</span>
                                <span
                                  style={{ color: theme.text }}
                                  className="font-semibold truncate ml-2"
                                >
                                  {v.currentTripLabel}
                                </span>
                              </div>
                            )}
                            {onTripVehicleIds.has(v.id) && (
                              <div
                                style={{
                                  color: theme.subtext,
                                  borderColor: theme.border,
                                }}
                                className="text-[11.5px] mt-2 pt-2 border-t"
                              >
                                Driver:{" "}
                                <span
                                  style={{ color: theme.text }}
                                  className="font-semibold"
                                >
                                  {v.assignedDriverName ?? "Unassigned"}
                                </span>
                                {ongoingTripByVehicleId[v.id]?.purpose && (
                                  <div className="mt-1">
                                    Purpose:{" "}
                                    <span
                                      style={{ color: theme.text }}
                                      className="font-semibold"
                                    >
                                      {ongoingTripByVehicleId[v.id].purpose}
                                    </span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Column 4 — Drivers */}
                <div>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <h3
                        style={{ color: theme.text }}
                        className="text-sm font-semibold mb-0.5"
                      >
                        Drivers
                      </h3>
                      <p
                        style={{ color: theme.subtext }}
                        className="text-[11px]"
                      >
                        Roster of registered drivers.
                      </p>
                    </div>
                    <button
                      onClick={() => setAddDriverOpen(true)}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border whitespace-nowrap flex-shrink-0"
                    >
                      + Add
                    </button>
                  </div>
                  {drivers.length === 0 ? (
                    <p style={{ color: theme.subtext }} className="text-xs">
                      No drivers yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-3 max-h-[450px] overflow-y-auto fct-scroll pr-1">
                      {sortedDrivers.map((d) => {
                        const onTrip = onTripDriverUserIds.has(d.userId);
                        const showPlate = onTrip && !!d.vehiclePlate;
                        const dutyCfg =
                          DUTY_STATUS_CONFIG[d.dutyStatus] ??
                          DUTY_STATUS_CONFIG.off_duty;
                        const isAvailable = d.dutyStatus === "active" && !onTrip;
                        return (
                        <div
                          key={d.id}
                          style={{
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            opacity: isAvailable ? 1 : 0.55,
                          }}
                          className="rounded-xl border p-3.5 transition-opacity"
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <p
                              style={{ color: theme.text }}
                              className="text-[13.5px] font-semibold"
                            >
                              {d.name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {showPlate ? (
                                <>
                                  <StatusBadge
                                    config={{ label: "On Trip", bg: "#dbeafe", text: "#1d4ed8" }}
                                    size="sm"
                                  />
                                  <span
                                    style={{
                                      backgroundColor: theme.background,
                                      color: theme.subtext,
                                      borderColor: theme.border,
                                    }}
                                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full border font-mono whitespace-nowrap"
                                  >
                                    {d.vehiclePlate}
                                  </span>
                                </>
                              ) : (
                                <StatusBadge config={dutyCfg} size="sm" />
                              )}
                              <button
                                onClick={() => openEditDriver(d)}
                                style={{
                                  color: theme.subtext,
                                  borderColor: theme.border,
                                }}
                                className="p-1 rounded-md border"
                                aria-label="Edit driver"
                              >
                                <svg
                                  width="12"
                                  height="12"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth={2}
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div
                            style={{ color: theme.subtext }}
                            className="text-[11.5px] flex justify-between"
                          >
                            <span>Contact</span>
                            <span
                              style={{ color: theme.text }}
                              className="font-semibold"
                            >
                              {d.contactNumber ?? "—"}
                            </span>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* ── KPI column (left) + Trip Requests panel (right) — 1
                   column × 4 rows, matched to the panel's 450px height ── */}
              <div className="flex flex-col lg:flex-row gap-5">
                <div style={{ height: 450 }} className="flex flex-col gap-2.5 w-full lg:w-64 flex-shrink-0">
                  <div className="flex-1 min-h-0">
                    <StackedKpiCard
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="3" y="4" width="18" height="16" rx="2" />
                          <path d="M16 2v4M8 2v4M3 10h18" />
                        </svg>
                      }
                      label="Trips today"
                      value={kpi.tripsToday}
                      sub="Departing or returning today"
                      theme={theme}
                    />
                  </div>
                  <div className="flex-1 min-h-0">
                    <StackedKpiCard
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 17h14M5 17a2 2 0 1 0 4 0M5 17a2 2 0 1 1 4 0m6 0a2 2 0 1 0 4 0m-4 0a2 2 0 1 1 4 0M3 17V9l2-5h10l4 5v8" />
                        </svg>
                      }
                      label="Vehicles on trip"
                      value={kpi.vehiclesOnTrip}
                      sub={`Of ${vehicles.length} in fleet`}
                      valueColor="#16a34a"
                      onClick={() => onNavigate?.("fleet_vehicles")}
                      theme={theme}
                    />
                  </div>
                  <div className="flex-1 min-h-0">
                    <StackedKpiCard
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <path d="M12 8v4l3 2" />
                        </svg>
                      }
                      label="Pending approval"
                      value={kpi.pendingApproval}
                      sub="Needs vehicle & driver"
                      valueColor="#d97706"
                      onClick={() => setStatusFilter("pending")}
                      theme={theme}
                    />
                  </div>
                  <div className="flex-1 min-h-0">
                    <StackedKpiCard
                      icon={
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
                        </svg>
                      }
                      label="Under maintenance"
                      value={kpi.underMaintenance}
                      sub="Unavailable for dispatch"
                      valueColor="#dc2626"
                      onClick={() => onNavigate?.("fleet_vehicles")}
                      theme={theme}
                    />
                  </div>
                </div>

                {/* Trip Requests panel */}
                <div
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    height: 450,
                    minHeight: 450,
                  }}
                  className="rounded-xl border flex flex-col flex-1 min-w-0"
                >
                <div className="px-4 pt-4 pb-3">
                  <h2
                    style={{ color: theme.text }}
                    className="text-sm font-semibold"
                  >
                    Trip Requests
                  </h2>
                  <p
                    style={{ color: theme.subtext }}
                    className="text-[11px] mt-0.5"
                  >
                    Assign a vehicle &amp; driver to approve. Requests stay
                    listed here through the full trip until completed.
                  </p>
                </div>
                <div className="flex gap-1.5 px-4 pb-3 flex-wrap">
                  {FILTER_TABS.map((tab) => {
                    const active = statusFilter === tab.key;
                    return (
                      <button
                        key={tab.key}
                        onClick={() => setStatusFilter(tab.key)}
                        style={{
                          backgroundColor: active ? theme.primary : "transparent",
                          color: active ? theme.primaryText : theme.subtext,
                          borderColor: active ? theme.primary : theme.border,
                        }}
                        className="text-[11px] font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap"
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
                {filteredTrips.length === 0 ? (
                  <div className="px-4 pb-6 pt-2 text-center">
                    <p style={{ color: theme.subtext }} className="text-xs">
                      No trips match this filter.
                    </p>
                  </div>
                ) : (
                  <div className="fct-scroll flex flex-col gap-2 px-4 pb-4 overflow-y-auto flex-1 min-h-0">
                    {filteredTrips.map((trip) => {
                      const colors = avatarColor(trip.requestorName);
                      const draft = assignDrafts[trip.id] ?? {
                        vehicleId: "",
                        driverId: "",
                      };
                      const isBusy = busyTripId === trip.id;
                      const isTripToday = isToday(trip.departureDatetime);
                      const delayInfo = getDelayInfo(trip);

                      return (
                        <div
                          key={trip.id}
                          style={{
                            borderColor: isTripToday ? "#f59e0b" : theme.border,
                            backgroundColor: isTripToday
                              ? "#fffbeb"
                              : theme.surfaceRaised ?? theme.background,
                          }}
                          className="rounded-lg border p-3"
                        >
                           <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div
                                style={{
                                  backgroundColor: colors.bg,
                                  color: colors.text,
                                  width: 28,
                                  height: 28,
                                  flexShrink: 0,
                                }}
                                className="rounded-full flex items-center justify-center text-[10px] font-bold"
                              >
                                {getInitials(trip.requestorName)}
                              </div>
                              <div className="min-w-0 flex-1">
                                {/* Stacked pickup/drop-off — same visual pattern as the
                                    trip details modal (dot + pin icon), so long addresses
                                    truncate independently instead of both being squeezed
                                    into one "A → B" line that either overflows or cuts off
                                    the drop-off entirely. */}
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    style={{ backgroundColor: "#22c55e", width: 6, height: 6, borderRadius: 3 }}
                                    className="flex-shrink-0"
                                  />
                                  <p
                                    style={{ color: isTripToday ? "#78350f" : theme.text }}
                                    className="text-[12.5px] font-semibold leading-tight truncate"
                                    title={trip.pickupLabel}
                                  >
                                    {trip.pickupLabel}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1.5 min-w-0 mt-0.5">
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  <p
                                    style={{ color: isTripToday ? "#78350f" : theme.text }}
                                    className="text-[12.5px] font-semibold leading-tight truncate"
                                    title={trip.dropoffLabel}
                                  >
                                    {trip.dropoffLabel}
                                  </p>
                                </div>
                                <p
                                  style={{ color: isTripToday ? "#92400e" : theme.subtext }}
                                  className="text-[11px] mt-1 truncate"
                                >
                                  {trip.requestorName} ·{" "}
                                  {formatDateTime(trip.departureDatetime)} ·{" "}
                                  {trip.passengerCount} pax
                                  {(trip.vehiclePlate || trip.driverName) && (
                                    <>
                                      {" · "}
                                      {trip.vehiclePlate ?? ""}
                                      {trip.vehiclePlate && trip.driverName
                                        ? " – "
                                        : ""}
                                      {trip.driverName ?? ""}
                                    </>
                                  )}
                                </p>
                              </div>
                            </div>
                           <div className="flex items-center gap-1.5 flex-shrink-0">
                              {delayInfo && (
                                <span
                                  style={{ backgroundColor: "#ef4444", color: "#fff" }}
                                  className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap flex items-center gap-1"
                                >
                                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <path d="M12 7v5l3 2" />
                                  </svg>
                                  {delayInfo.label}
                                </span>
                              )}
                              {isTripToday && (
                                <span
                                  style={{ backgroundColor: "#f59e0b", color: "#fff" }}
                                  className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                                >
                                  Today
                                </span>
                              )}
                              <StatusBadge
                                config={TRIP_STATUS_CONFIG[trip.status]}
                                size="sm"
                              />
                              <button
                                onClick={() => setViewingTrip(trip)}
                                style={
                                  ACTIVE_STATUSES.includes(trip.status)
                                    ? { backgroundColor: theme.primary, color: theme.primaryText }
                                    : {
                                        backgroundColor: theme.surface,
                                        borderColor: theme.border,
                                        color: theme.subtext,
                                      }
                                }
                                className={
                                  ACTIVE_STATUSES.includes(trip.status)
                                    ? "text-[10.5px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap"
                                    : "text-[10px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap"
                                }
                              >
                                {ACTIVE_STATUSES.includes(trip.status)
                                  ? "Review"
                                  : "View"}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              </div>
            </div>
          </div>

      {/* Reject-reason modal */}
      {rejectingTrip && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
            }}
            className="rounded-2xl p-6 w-full max-w-[400px] border"
          >
            <p
              style={{ color: theme.text }}
              className="text-base font-bold mb-1"
            >
              Reject Trip Request
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mb-4">
              {rejectingTrip.pickupLabel} → {rejectingTrip.dropoffLabel} ·{" "}
              {rejectingTrip.requestorName}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional, shown to requestor)…"
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              }}
              className="w-full text-sm px-3 py-2.5 border rounded-lg mb-4 min-h-[80px]"
            />
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setRejectingTrip(null);
                  setRejectReason("");
                }}
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={busyTripId === rejectingTrip.id}
                style={{
                  backgroundColor: "#ef4444",
                  color: "#fff",
                  opacity: busyTripId === rejectingTrip.id ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {busyTripId === rejectingTrip.id ? "Rejecting…" : "Reject Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Trip Details modal */}
      {viewingTrip && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
            }}
            className="rounded-2xl p-6 w-full max-w-[420px] border"
          >
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    style={{ backgroundColor: "#22c55e", width: 7, height: 7, borderRadius: 4, flexShrink: 0 }}
                  />
                  <p
                    style={{ color: theme.text }}
                    className="text-[13.5px] font-bold leading-snug truncate"
                    title={viewingTrip.pickupLabel}
                  >
                    {viewingTrip.pickupLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2 min-w-0 mt-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <p
                    style={{ color: theme.text }}
                    className="text-[13.5px] font-bold leading-snug truncate"
                    title={viewingTrip.dropoffLabel}
                  >
                    {viewingTrip.dropoffLabel}
                  </p>
                </div>
                <p
                  style={{ color: theme.subtext }}
                  className="text-[11px] mt-1.5"
                >
                  {viewingTrip.tripRef}
                </p>
              </div>
              <StatusBadge
                config={TRIP_STATUS_CONFIG[viewingTrip.status]}
                size="sm"
              />
            </div>

            <div className="flex flex-col gap-2.5 mb-4">
              {[
                ["Requestor", viewingTrip.requestorName],
                ["Departure", formatDateTime(viewingTrip.departureDatetime)],
                [
                  "Return",
                  viewingTrip.returnDatetime
                    ? formatDateTime(viewingTrip.returnDatetime)
                    : "—",
                ],
                [
                  "Trip type",
                  viewingTrip.tripType === "oneway" ? "One way" : "Round trip",
                ],
                ["Passengers", String(viewingTrip.passengerCount)],
                ["Purpose", viewingTrip.purpose || "—"],
                ...(viewingTrip.status === "pending"
                  ? []
                  : [
                      ["Vehicle", viewingTrip.vehiclePlate ?? "Not assigned"],
                      ["Driver", viewingTrip.driverName ?? "Not assigned"],
                      ["Approved by", viewingTrip.approvedByName ?? "—"],
                      [
                        "Approved at",
                        viewingTrip.approvedAt
                          ? formatDateTime(viewingTrip.approvedAt)
                          : "—",
                      ],
                    ]),
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3"
                >
                  <span
                    style={{ color: theme.subtext }}
                    className="text-[11px]"
                  >
                    {label}
                  </span>
                  <span
                    style={{ color: theme.text }}
                    className="text-[12.5px] font-semibold text-right"
                  >
                    {value}
                  </span>
                </div>
              ))}
              {viewingTrip.status === "rejected" &&
                viewingTrip.rejectedReason && (
                  <div>
                    <span
                      style={{ color: theme.subtext }}
                      className="text-[11px] block mb-1"
                    >
                      Rejection reason
                    </span>
                    <p style={{ color: theme.text }} className="text-[12.5px]">
                      {viewingTrip.rejectedReason}
                    </p>
                  </div>
                )}
            </div>

            {viewingTrip.status !== "pending" && (
              <div
                style={{ borderColor: theme.border }}
                className="border-t pt-3 mb-4"
              >
                <p
                  style={{ color: theme.text }}
                  className="text-[12.5px] font-semibold mb-2"
                >
                  Status history
                </p>
                {!viewingTrip.statusHistory ||
                viewingTrip.statusHistory.length === 0 ? (
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    No history recorded for this trip yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[...viewingTrip.statusHistory]
                      .sort(
                        (a, b) =>
                          new Date(b.timestamp).getTime() -
                          new Date(a.timestamp).getTime(),
                      )
                      .map((entry, idx) => {
                        const cfg = TRIP_STATUS_CONFIG[entry.status];
                        return (
                          <div
                            key={`${entry.status}-${entry.timestamp}-${idx}`}
                            className="flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span
                                style={{
                                  backgroundColor: cfg?.dot ?? theme.subtext,
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                }}
                                className="inline-block flex-shrink-0"
                              />
                              <span
                                style={{ color: theme.text }}
                                className="text-[12px] font-medium truncate"
                              >
                                {cfg?.label ?? entry.status}
                              </span>
                            </div>
                            <span
                              style={{ color: theme.subtext }}
                              className="text-[11px] whitespace-nowrap flex-shrink-0"
                            >
                              {formatDateTime(entry.timestamp)}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {viewingTrip.status === "pending" && (
              <div
                style={{ borderColor: theme.border }}
                className="border-t pt-4 mb-4"
              >
                <p
                  style={{ color: theme.text }}
                  className="text-[12.5px] font-semibold mb-2"
                >
                  Assign vehicle &amp; driver
                </p>
                <div className="flex flex-col gap-2">
                  <select
                    value={assignDrafts[viewingTrip.id]?.vehicleId ?? ""}
                    onChange={(e) =>
                      setDraft(viewingTrip.id, { vehicleId: e.target.value })
                    }
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                    className="w-full text-sm px-3 py-2 border rounded-lg"
                  >
                    <option value="">Assign vehicle…</option>
                    {availableVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} — {v.model}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignDrafts[viewingTrip.id]?.driverId ?? ""}
                    onChange={(e) =>
                      setDraft(viewingTrip.id, { driverId: e.target.value })
                    }
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                    className="w-full text-sm px-3 py-2 border rounded-lg"
                  >
                    <option value="">Assign driver…</option>
                    {availableDrivers.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                {rowError[viewingTrip.id] && (
                  <p style={{ color: "#dc2626" }} className="text-[11px] mt-2">
                    {rowError[viewingTrip.id]}
                  </p>
                )}
              </div>
            )}

            {(viewingTrip.status === "approved" ||
              viewingTrip.status === "arrived") && (
              <div
                style={{ borderColor: theme.border }}
                className="border-t pt-4 mb-4"
              >
                {!reassignOpen[viewingTrip.id] ? (
                  <button
                    onClick={() => {
                      setAssignDrafts((prev) => ({
                        ...prev,
                        [viewingTrip.id]: {
                          vehicleId: (viewingTrip as any).vehicleId ?? "",
                          driverId: (viewingTrip as any).driverId ?? "",
                        },
                      }));
                      setReassignOpen((prev) => ({
                        ...prev,
                        [viewingTrip.id]: true,
                      }));
                    }}
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                    className="w-full text-sm font-semibold px-3 py-2 rounded-lg border"
                  >
                    Change vehicle / driver
                  </button>
                ) : (
                  <>
                    <p
                      style={{ color: theme.text }}
                      className="text-[12.5px] font-semibold mb-2"
                    >
                      Reassign vehicle &amp; driver
                    </p>
                    <div className="flex flex-col gap-2">
                      <select
                        value={assignDrafts[viewingTrip.id]?.vehicleId ?? ""}
                        onChange={(e) =>
                          setDraft(viewingTrip.id, {
                            vehicleId: e.target.value,
                          })
                        }
                        style={{
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                          color: theme.text,
                        }}
                        className="w-full text-sm px-3 py-2 border rounded-lg"
                      >
                        <option value="">Assign vehicle…</option>
                        {getAvailableVehicles(viewingTrip.id).map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.plateNumber} — {v.model}
                          </option>
                        ))}
                      </select>
                      <select
                        value={assignDrafts[viewingTrip.id]?.driverId ?? ""}
                        onChange={(e) =>
                          setDraft(viewingTrip.id, {
                            driverId: e.target.value,
                          })
                        }
                        style={{
                          backgroundColor: theme.surface,
                          borderColor: theme.border,
                          color: theme.text,
                        }}
                        className="w-full text-sm px-3 py-2 border rounded-lg"
                      >
                        <option value="">Assign driver…</option>
                        {getAvailableDrivers(viewingTrip.id).map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <div className="flex gap-2.5">
                        <button
                          onClick={() =>
                            setReassignOpen((prev) => ({
                              ...prev,
                              [viewingTrip.id]: false,
                            }))
                          }
                          style={{
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.text,
                          }}
                          className="flex-1 rounded-lg py-2 border text-sm font-semibold"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleReassign(viewingTrip)}
                          disabled={busyTripId === viewingTrip.id}
                          style={{
                            backgroundColor: theme.primary,
                            color: theme.primaryText,
                            opacity: busyTripId === viewingTrip.id ? 0.6 : 1,
                          }}
                          className="flex-1 rounded-lg py-2 text-sm font-semibold"
                        >
                          {busyTripId === viewingTrip.id ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </div>
                    {rowError[viewingTrip.id] && (
                      <p
                        style={{ color: "#dc2626" }}
                        className="text-[11px] mt-2"
                      >
                        {rowError[viewingTrip.id]}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {(() => {
              const isBusy = busyTripId === viewingTrip.id;

              if (viewingTrip.status === "pending") {
                return (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex gap-2.5">
                      <button
                        onClick={() => {
                          setRejectingTrip(viewingTrip);
                          setViewingTrip(null);
                        }}
                        disabled={isBusy}
                        style={{
                          backgroundColor: "#fee2e2",
                          color: "#991b1b",
                          opacity: isBusy ? 0.6 : 1,
                        }}
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                      >
                        Reject
                      </button>
                      <button
                        onClick={async () => {
                          const ok = await handleApprove(viewingTrip);
                          if (ok) setViewingTrip(null);
                        }}
                        disabled={isBusy}
                        style={{
                          backgroundColor: theme.primary,
                          color: theme.primaryText,
                          opacity: isBusy ? 0.6 : 1,
                        }}
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                      >
                        {isBusy ? "Approving…" : "Approve"}
                      </button>
                    </div>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full rounded-xl py-2.5 border text-sm font-semibold"
                    >
                      Close
                    </button>
                  </div>
                );
              }

              if (viewingTrip.status === "approved") {
                return (
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={async () => {
                        await handleMarkArrived(viewingTrip);
                        setViewingTrip(null);
                      }}
                      disabled={isBusy}
                      style={{
                        backgroundColor: "#dbeafe",
                        color: "#1d4ed8",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                    >
                      {isBusy ? "Updating…" : "Mark as Arrived"}
                    </button>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full rounded-xl py-2.5 border text-sm font-semibold"
                    >
                      Close
                    </button>
                  </div>
                );
              }

              if (viewingTrip.status === "ongoing") {
                return (
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={async () => {
                        await handleMarkArrived(viewingTrip);
                        setViewingTrip(null);
                      }}
                      disabled={isBusy}
                      style={{
                        backgroundColor: "#dbeafe",
                        color: "#1d4ed8",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                    >
                      {isBusy ? "Updating…" : "Mark as Arrived"}
                    </button>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full rounded-xl py-2.5 border text-sm font-semibold"
                    >
                      Close
                    </button>
                  </div>
                );
              }

              if (viewingTrip.status === "arrived") {
                const isReassigning = !!reassignOpen[viewingTrip.id];
                return (
                  <div className="flex flex-col gap-2.5">
                    {!isReassigning && (
                      <button
                        onClick={async () => {
                          await handleStartReturn(viewingTrip);
                          setViewingTrip(null);
                        }}
                        disabled={isBusy}
                        style={{
                          backgroundColor: "#fef3c7",
                          color: "#92400e",
                          opacity: isBusy ? 0.6 : 1,
                        }}
                        className="w-full rounded-xl py-2.5 text-sm font-semibold"
                      >
                        {isBusy ? "Updating…" : "Start Return"}
                      </button>
                    )}
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full rounded-xl py-2.5 border text-sm font-semibold"
                    >
                      Close
                    </button>
                  </div>
                );
              }

              if (viewingTrip.status === "returning") {
                return (
                  <div className="flex flex-col gap-2.5">
                    <button
                      onClick={async () => {
                        await handleComplete(viewingTrip);
                        setViewingTrip(null);
                      }}
                      disabled={isBusy}
                      style={{
                        backgroundColor: "#dcfce7",
                        color: "#166534",
                        opacity: isBusy ? 0.6 : 1,
                      }}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                    >
                      {isBusy ? "Updating…" : "Mark Completed"}
                    </button>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full rounded-xl py-2.5 border text-sm font-semibold"
                    >
                      Close
                    </button>
                  </div>
                );
              }

              // completed / cancelled / rejected — read only
              return (
                <button
                  onClick={() => setViewingTrip(null)}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full rounded-xl py-2.5 border text-sm font-semibold"
                >
                  Close
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {/* Add Vehicle modal */}
      {addVehicleOpen && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
            }}
            className="rounded-2xl p-6 w-full max-w-[400px] border"
          >
            <p
              style={{ color: theme.text }}
              className="text-base font-bold mb-4"
            >
              Add Vehicle
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Tramigo device (GPS tracker)
                </label>
                <select
                  value={addVehicleForm.tramigoDeviceId}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    const device = tramigoDevices.find((d) => d.id === deviceId);
                    if (device) {
                      const { model, plate } = parseTramigoDeviceName(device.name);
                      setAddVehicleForm((f) => ({
                        ...f,
                        tramigoDeviceId: deviceId,
                        model: model || f.model,
                        plateNumber: plate || f.plateNumber,
                      }));
                      setAddVehicleWarning(
                        plate && existingVehiclePlates.has(plate.trim().toLowerCase())
                          ? `A vehicle with plate "${plate}" is already registered.`
                          : "",
                      );
                    } else {
                      setAddVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId }));
                      setAddVehicleWarning("");
                    }
                  }}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                >
                  <option value="">Not linked yet</option>
                  {unlinkedTramigoDevices().map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.imei}
                    </option>
                  ))}
                </select>
                {tramigoDevices.length > 0 && unlinkedTramigoDevices().length === 0 && (
                  <p style={{ color: theme.subtext }} className="text-[10.5px] mt-1">
                    Every Tramigo device on the account is already linked to a vehicle.
                  </p>
                )}
                {addVehicleWarning && (
                  <p
                    style={{ color: "#d97706" }}
                    className="text-[11px] mt-1.5 flex items-center gap-1"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {addVehicleWarning}
                  </p>
                )}
              </div>

              {addVehicleForm.tramigoDeviceId ? (
                <div
                  style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                  className="rounded-lg border px-3 py-2.5"
                >
                  <p style={{ color: theme.subtext }} className="text-[10.5px] mb-1">
                    From Tramigo device
                  </p>
                  <div className="flex items-center justify-between">
                    <span style={{ color: theme.text }} className="text-[13px] font-semibold">
                      {addVehicleForm.model || "—"}
                    </span>
                    <span style={{ color: theme.text }} className="text-[13px] font-mono font-semibold">
                      {addVehicleForm.plateNumber || "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label
                      style={{ color: theme.subtext }}
                      className="text-[11px] font-semibold block mb-1"
                    >
                      Plate number
                    </label>
                    <input
                      value={addVehicleForm.plateNumber}
                      onChange={(e) =>
                        setAddVehicleForm((f) => ({
                          ...f,
                          plateNumber: e.target.value,
                        }))
                      }
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                      placeholder="e.g. NGP 4521"
                    />
                  </div>
                  <div>
                    <label
                      style={{ color: theme.subtext }}
                      className="text-[11px] font-semibold block mb-1"
                    >
                      Model
                    </label>
                    <input
                      value={addVehicleForm.model}
                      onChange={(e) =>
                        setAddVehicleForm((f) => ({ ...f, model: e.target.value }))
                      }
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                      placeholder="e.g. Toyota HiAce"
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Type
                </label>
                <select
                  value={addVehicleForm.type}
                  onChange={(e) =>
                    setAddVehicleForm((f) => ({
                      ...f,
                      type: e.target.value as VehicleType,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                >
                  <option value="sedan">Sedan</option>
                  <option value="van">Van</option>
                  <option value="suv">SUV</option>
                  <option value="truck">Truck</option>
                </select>
              </div>
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Seating capacity
                </label>
                <input
                  type="number"
                  min={1}
                  value={addVehicleForm.seatingCapacity}
                  onChange={(e) =>
                    setAddVehicleForm((f) => ({
                      ...f,
                      seatingCapacity: e.target.value,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            {addVehicleError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {addVehicleError}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setAddVehicleOpen(false);
                  setAddVehicleError("");
                  setAddVehicleWarning("");
                }}
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVehicle}
                disabled={addVehicleSubmitting}
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText,
                  opacity: addVehicleSubmitting ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {addVehicleSubmitting ? "Adding…" : "Add Vehicle"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Driver modal */}
      {addDriverOpen && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
            }}
            className="rounded-2xl p-6 w-full max-w-[400px] border"
          >
            <p
              style={{ color: theme.text }}
              className="text-base font-bold mb-1"
            >
              Add Driver
            </p>
            <p style={{ color: theme.subtext }} className="text-[11px] mb-4">
              Links an existing AD user as a driver.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Employee
                </label>
                <EmployeeSearchableSelect
                  value={addDriverForm.username}
                  displayName={addDriverForm.displayName}
                  options={employeeOptions}
                  theme={theme}
                  onTextChange={(text) => {
                    setAddDriverForm((f) => ({
                      ...f,
                      username: "",
                      displayName: text,
                    }));
                    setAddDriverWarning("");
                  }}
                  onChange={(value, label) => {
                    setAddDriverForm((f) => ({
                      ...f,
                      username: value,
                      displayName: label,
                    }));
                    setAddDriverWarning(
                      existingDriverNames.has(label.trim().toLowerCase())
                        ? `${label} is already registered as a driver.`
                        : "",
                    );
                  }}
                />
                {addDriverWarning && (
                  <p
                    style={{ color: "#d97706" }}
                    className="text-[11px] mt-1.5 flex items-center gap-1"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    {addDriverWarning}
                  </p>
                )}
              </div>
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Contact number
                </label>
                <input
                  value={addDriverForm.contactNumber}
                  onChange={(e) =>
                    setAddDriverForm((f) => ({
                      ...f,
                      contactNumber: e.target.value,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            {addDriverError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {addDriverError}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setAddDriverOpen(false);
                  setAddDriverError("");
                  setAddDriverWarning("");
                }}
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDriver}
                disabled={addDriverSubmitting}
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText,
                  opacity: addDriverSubmitting ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {addDriverSubmitting ? "Adding…" : "Add Driver"}
              </button>
            </div>
          </div>
        </div>
      )}

       {/* Edit Vehicle modal */}
      {editingVehicle && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
            }}
            className="rounded-2xl p-6 w-full max-w-[400px] border"
          >
            <p
              style={{ color: theme.text }}
              className="text-base font-bold mb-4"
            >
              Edit Vehicle
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Tramigo device (GPS tracker)
                </label>
                <select
                  value={editVehicleForm.tramigoDeviceId}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    const device = tramigoDevices.find((d) => d.id === deviceId);
                    if (device) {
                      const { model, plate } = parseTramigoDeviceName(device.name);
                      setEditVehicleForm((f) => ({
                        ...f,
                        tramigoDeviceId: deviceId,
                        model: model || f.model,
                        plateNumber: plate || f.plateNumber,
                      }));
                    } else {
                      setEditVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId }));
                    }
                  }}
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                >
                  <option value="">Not linked</option>
                  {unlinkedTramigoDevices(editingVehicle?.id).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} — {d.imei}
                    </option>
                  ))}
                </select>
              </div>

              {editVehicleForm.tramigoDeviceId ? (
                <div
                  style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                  className="rounded-lg border px-3 py-2.5"
                >
                  <p style={{ color: theme.subtext }} className="text-[10.5px] mb-1">
                    From Tramigo device
                  </p>
                  <div className="flex items-center justify-between">
                    <span style={{ color: theme.text }} className="text-[13px] font-semibold">
                      {editVehicleForm.model || "—"}
                    </span>
                    <span style={{ color: theme.text }} className="text-[13px] font-mono font-semibold">
                      {editVehicleForm.plateNumber || "—"}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  <div>
                    <label
                      style={{ color: theme.subtext }}
                      className="text-[11px] font-semibold block mb-1"
                    >
                      Plate number
                    </label>
                    <input
                      value={editVehicleForm.plateNumber}
                      onChange={(e) =>
                        setEditVehicleForm((f) => ({
                          ...f,
                          plateNumber: e.target.value,
                        }))
                      }
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label
                      style={{ color: theme.subtext }}
                      className="text-[11px] font-semibold block mb-1"
                    >
                      Model
                    </label>
                    <input
                      value={editVehicleForm.model}
                      onChange={(e) =>
                        setEditVehicleForm((f) => ({ ...f, model: e.target.value }))
                      }
                      style={{
                        backgroundColor: theme.surface,
                        borderColor: theme.border,
                        color: theme.text,
                      }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                    />
                  </div>
                </>
              )}

              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Type
                </label>
                <select
                  value={editVehicleForm.type}
                  onChange={(e) =>
                    setEditVehicleForm((f) => ({
                      ...f,
                      type: e.target.value as VehicleType,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                >
                  <option value="sedan">Sedan</option>
                  <option value="van">Van</option>
                  <option value="suv">SUV</option>
                  <option value="truck">Truck</option>
                </select>
              </div>
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Seating capacity
                </label>
                <input
                  type="number"
                  min={1}
                  value={editVehicleForm.seatingCapacity}
                  onChange={(e) =>
                    setEditVehicleForm((f) => ({
                      ...f,
                      seatingCapacity: e.target.value,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Status
                </label>
                {editingVehicle && onTripVehicleIds.has(editingVehicle.id) ? (
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    Status is locked while this vehicle is out on a trip.
                  </p>
                ) : (
                  <select
                    value={editVehicleForm.status}
                    onChange={(e) =>
                      setEditVehicleForm((f) => ({
                        ...f,
                        status: e.target.value as VehicleStatus,
                      }))
                    }
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    }}
                    className="w-full text-sm px-3 py-2 border rounded-lg"
                  >
                    <option value="idle">Available</option>
                    <option value="personal">Personal use</option>
                    <option value="maintenance">Maintenance</option>
                  </select>
                )}
              </div>
            </div>
            {editVehicleError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {editVehicleError}
              </p>
            )}
            <div className="flex gap-2.5 mb-2.5">
              <button
                onClick={() => {
                  setEditingVehicle(null);
                  setEditVehicleError("");
                  setConfirmDeleteVehicle(false);
                }}
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateVehicle}
                disabled={editVehicleSubmitting}
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText,
                  opacity: editVehicleSubmitting ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {editVehicleSubmitting ? "Saving…" : "Save Changes"}
              </button>
            </div>
            <button
              onClick={() => {
                if (!confirmDeleteVehicle) {
                  setConfirmDeleteVehicle(true);
                  return;
                }
                handleDeleteVehicle();
              }}
              disabled={editVehicleSubmitting}
              style={{
                backgroundColor: confirmDeleteVehicle ? "#ef4444" : "#fee2e2",
                color: confirmDeleteVehicle ? "#fff" : "#991b1b",
                opacity: editVehicleSubmitting ? 0.6 : 1,
              }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold"
            >
              {editVehicleSubmitting
                ? "Deleting…"
                : confirmDeleteVehicle
                  ? "Click again to confirm delete"
                  : "Delete Vehicle"}
            </button>
          </div>
        </div>
      )}
    {/* Edit Driver modal */}
      {editingDriver && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
            }}
            className="rounded-2xl p-6 w-full max-w-[400px] border"
          >
            <p
              style={{ color: theme.text }}
              className="text-base font-bold mb-1"
            >
              Edit Driver
            </p>
            <p style={{ color: theme.subtext }} className="text-[11px] mb-4">
              {editingDriver.name}
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  License number
                </label>
                <input
                  value={editDriverForm.licenseNumber}
                  onChange={(e) =>
                    setEditDriverForm((f) => ({
                      ...f,
                      licenseNumber: e.target.value,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Contact number
                </label>
                <input
                  value={editDriverForm.contactNumber}
                  onChange={(e) =>
                    setEditDriverForm((f) => ({
                      ...f,
                      contactNumber: e.target.value,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
            </div>
            {editDriverError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {editDriverError}
              </p>
            )}
            <div className="flex gap-2.5 mb-2.5">
              <button
                onClick={() => {
                  setEditingDriver(null);
                  setEditDriverError("");
                  setConfirmDeleteDriver(false);
                }}
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  color: theme.text,
                }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateDriver}
                disabled={editDriverSubmitting}
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText,
                  opacity: editDriverSubmitting ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {editDriverSubmitting ? "Saving…" : "Save Changes"}
              </button>
            </div>
            <button
              onClick={() => {
                if (!confirmDeleteDriver) {
                  setConfirmDeleteDriver(true);
                  return;
                }
                handleDeleteDriver();
              }}
              disabled={editDriverSubmitting}
              style={{
                backgroundColor: confirmDeleteDriver ? "#ef4444" : "#fee2e2",
                color: confirmDeleteDriver ? "#fff" : "#991b1b",
                opacity: editDriverSubmitting ? 0.6 : 1,
              }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold"
            >
              {editDriverSubmitting
                ? "Deleting…"
                : confirmDeleteDriver
                  ? "Click again to confirm delete"
                  : "Delete Driver"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
