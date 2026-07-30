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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import FleetLiveMap from "./FleetLiveMap";
import FleetLocationPickerMap from "./FleetLocationPickerMap";
import {
  getAllFleetTrips,
  getAllFleetVehicles,
  getAllFleetDrivers,
  getAllFleetLocations,
  approveFleetTrip,
  rejectFleetTrip,
  markTripArrived,
  startTripReturn,
  completeFleetTrip,
  createFleetVehicle,
  createFleetDriver,
  createFleetLocation,
  updateFleetVehicle,
  deleteFleetVehicle,
  updateFleetDriver,
  deleteFleetDriver,
  updateFleetLocation,
  deleteFleetLocation,
} from "../../../services/fleetOps";
import {
  ADUser,
  FleetTrip,
  FleetVehicle,
  FleetDriver,
  FleetLocation,
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
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function isToday(iso?: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
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
  idle: { label: "Inactive", bg: "#e2e8f0", text: "#334155" },
  active: { label: "Active", bg: "#dcfce7", text: "#166534" },
  maintenance: { label: "Maintenance", bg: "#fee2e2", text: "#991b1b" },
  personal: { label: "Personal use", bg: "#fef3c7", text: "#92400e" },
  off_duty: { label: "Off duty", bg: "#f1f5f9", text: "#64748b" },
};

// Tramigo's own dashboard has no per-device status field (confirmed via
// GET /fleet/tramigo-devices) — "Parked" vs "Inactive" there is derived
// purely from how recently a device last reported in. Both are the 'idle'
// status in our own DB (server.js's GPS write-back only ever toggles
// idle/active); this splits the *display* of 'idle' the same way, using
// last_ping_at, which server.js already stamps on every live-locations poll.
const PARKED_STALE_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes
const PARKED_CONFIG = { label: "Parked", bg: "#dbeafe", text: "#1d4ed8" };

function getVehicleDisplayStatus(
  v: FleetVehicle,
): { label: string; bg: string; text: string } {
  if (v.status !== "idle") return VEHICLE_STATUS_CONFIG[v.status];
  if (!v.lastPingAt) return VEHICLE_STATUS_CONFIG.idle; // never reported at all
  const age = Date.now() - new Date(v.lastPingAt).getTime();
  if (isNaN(age) || age > PARKED_STALE_THRESHOLD_MS) return VEHICLE_STATUS_CONFIG.idle;
  return PARKED_CONFIG;
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FleetControlTowerPage({ user, onNavigate }: Props) {
  const { theme } = useTheme();

  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [locations, setLocations] = useState<FleetLocation[]>([]);
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
  });
  const [addVehicleError, setAddVehicleError] = useState("");
  const [addVehicleSubmitting, setAddVehicleSubmitting] = useState(false);

  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [addDriverForm, setAddDriverForm] = useState({
    username: "", // TODO: replace with a real user picker
    licenseNumber: "",
    contactNumber: "",
  });
  const [addDriverError, setAddDriverError] = useState("");
  const [addDriverSubmitting, setAddDriverSubmitting] = useState(false);

  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [viewLocationsOpen, setViewLocationsOpen] = useState(false);
  const [deletingLocationId, setDeletingLocationId] = useState<string | null>(
    null,
  );
  const [locationDeleteError, setLocationDeleteError] = useState("");
  const [addLocationForm, setAddLocationForm] = useState<{
    name: string;
    latitude: number | null;
    longitude: number | null;
  }>({
    name: "",
    latitude: null,
    longitude: null,
  });
  const [addLocationError, setAddLocationError] = useState("");
  const [addLocationSubmitting, setAddLocationSubmitting] = useState(false);

  const [editingLocation, setEditingLocation] = useState<FleetLocation | null>(null);
  const [editLocationForm, setEditLocationForm] = useState<{
    name: string;
    latitude: number | null;
    longitude: number | null;
  }>({ name: "", latitude: null, longitude: null });
  const [editLocationError, setEditLocationError] = useState("");
  const [editLocationSubmitting, setEditLocationSubmitting] = useState(false);
  const [confirmDeleteLocation, setConfirmDeleteLocation] = useState(false);

  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(
    null,
  );
  const [editVehicleForm, setEditVehicleForm] = useState({
    plateNumber: "",
    type: "sedan" as VehicleType,
    model: "",
    seatingCapacity: "4",
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
      console.error("Control Tower load error:", err);
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
    const vehiclesOnTrip = trips.filter((t) => t.status === "ongoing").length;
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
    return [...result].sort((a, b) => {      const aActive = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
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
      const active = trips.filter(
        (t) =>
          ACTIVE_STATUSES.includes(t.status) &&
          t.status !== "pending" &&
          t.id !== excludeTripId,
      );
      const busy = new Set(
        active.map((t) => (t as any).vehicleId).filter(Boolean),
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
      const active = trips.filter(
        (t) =>
          ACTIVE_STATUSES.includes(t.status) &&
          t.status !== "pending" &&
          t.id !== excludeTripId,
      );
      const busy = new Set(
        active.map((t) => (t as any).driverId).filter(Boolean),
      );
      // Drivers on "Personal Use" aren't dispatchable — mirrors the
      // v.status !== "personal" check already applied to vehicles above.
      return drivers.filter(
        (d) => !busy.has(d.id) && d.dutyStatus !== "personal",
      );
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
    });
    setEditVehicleError("");
    setConfirmDeleteVehicle(false);
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
      });
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
      });
      setAddVehicleOpen(false);
      setAddVehicleForm({
        plateNumber: "",
        type: "sedan",
        model: "",
        seatingCapacity: "4",
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
      setAddDriverError("A username is required.");
      return;
    }
    setAddDriverSubmitting(true);
    setAddDriverError("");
    try {
      await createFleetDriver({
        username: addDriverForm.username.trim(),
        licenseNumber: addDriverForm.licenseNumber.trim(),
        contactNumber: addDriverForm.contactNumber.trim(),
      });
      setAddDriverOpen(false);
      setAddDriverForm({ username: "", licenseNumber: "", contactNumber: "" });
      await loadAll();
    } catch (err) {
      console.error("Add driver failed:", err);
      setAddDriverError(
        "Failed to add driver — check the username and try again.",
      );
    } finally {
      setAddDriverSubmitting(false);
    }
  }

  async function handleDeleteLocation(locationId: string) {
    setDeletingLocationId(locationId);
    setLocationDeleteError("");
    try {
      await deleteFleetLocation(locationId);
      await loadAll();
    } catch (err) {
      console.error("Delete location failed:", err);
      setLocationDeleteError(
        err instanceof Error ? err.message : "Failed to delete location.",
      );
    } finally {
      setDeletingLocationId(null);
    }
  }

  function openEditLocation(l: FleetLocation) {
    setEditingLocation(l);
    setEditLocationForm({
      name: l.name,
      latitude: l.latitude ?? null,
      longitude: l.longitude ?? null,
    });
    setEditLocationError("");
    setConfirmDeleteLocation(false);
  }

  async function handleUpdateLocation() {
    if (!editingLocation) return;
    if (!editLocationForm.name.trim()) {
      setEditLocationError("Name is required.");
      return;
    }
    setEditLocationSubmitting(true);
    setEditLocationError("");
    try {
      await updateFleetLocation(editingLocation.id, {
        name: editLocationForm.name.trim(),
        latitude: editLocationForm.latitude,
        longitude: editLocationForm.longitude,
      });
      setEditingLocation(null);
      await loadAll();
    } catch (err) {
      console.error("Update location failed:", err);
      setEditLocationError(
        err instanceof Error ? err.message : "Failed to update location.",
      );
    } finally {
      setEditLocationSubmitting(false);
    }
  }

  async function handleDeleteLocationFromEdit() {
    if (!editingLocation) return;
    setEditLocationSubmitting(true);
    setEditLocationError("");
    try {
      await deleteFleetLocation(editingLocation.id);
      setEditingLocation(null);
      await loadAll();
    } catch (err) {
      console.error("Delete location failed:", err);
      setEditLocationError(
        err instanceof Error ? err.message : "Failed to delete location.",
      );
    } finally {
      setEditLocationSubmitting(false);
    }
  }

  async function handleAddLocation() {
    if (!addLocationForm.name.trim()) {
      setAddLocationError("Name is required.");
      return;
    }
    setAddLocationSubmitting(true);
    setAddLocationError("");
    try {
      await createFleetLocation({
        name: addLocationForm.name.trim(),
        latitude: addLocationForm.latitude,
        longitude: addLocationForm.longitude,
      });
      setAddLocationOpen(false);
      setAddLocationForm({ name: "", latitude: null, longitude: null });
      await loadAll();
    } catch (err) {
      console.error("Add location failed:", err);
      setAddLocationError("Failed to add location — try again.");
    } finally {
      setAddLocationSubmitting(false);
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
          <button
            onClick={() => setViewLocationsOpen(true)}
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              color: theme.text,
            }}
            className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border whitespace-nowrap flex-shrink-0 flex items-center gap-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            Locations ({locations.length})
          </button>
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
                      onClick={() => setAddVehicleOpen(true)}
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
                      {vehicles.map((v) => {
                        const vCfg = getVehicleDisplayStatus(v);
                        return (
                          <div
                            key={v.id}
                            onClick={() => setFocusVehicle({ id: v.id, token: Date.now() })}
                            style={{
                              backgroundColor: theme.surface,
                              borderColor: theme.border,
                              cursor: "pointer",
                            }}
                            className="rounded-xl border p-3.5"
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
                            {v.status === "active" && (
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
                      {drivers.map((d) => {
                        const onTrip = onTripDriverUserIds.has(d.userId);
                        const showPlate = onTrip && !!d.vehiclePlate;
                        const dutyCfg =
                          DUTY_STATUS_CONFIG[d.dutyStatus] ??
                          DUTY_STATUS_CONFIG.off_duty;
                        return (
                        <div
                          key={d.id}
                          style={{
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                          }}
                          className="rounded-xl border p-3.5"
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
                          <p
                            style={{ color: theme.subtext }}
                            className="text-[11px] mb-1.5"
                          >
                            {d.licenseNumber ?? "No license on file"}
                          </p>
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
                                <p
                                  style={{ color: isTripToday ? "#78350f" : theme.text }}
                                  className="text-sm font-semibold leading-tight truncate"
                                >
                                  {trip.pickupLabel} → {trip.dropoffLabel}
                                </p>
                                <p
                                  style={{ color: isTripToday ? "#92400e" : theme.subtext }}
                                  className="text-[11px] mt-0.5 truncate"
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
                                style={{
                                  backgroundColor: theme.surface,
                                  borderColor: theme.border,
                                  color: theme.subtext,
                                }}
                                className="text-[10px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap"
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
              <div>
                <p
                  style={{ color: theme.text }}
                  className="text-base font-bold"
                >
                  {viewingTrip.pickupLabel} → {viewingTrip.dropoffLabel}
                </p>
                <p
                  style={{ color: theme.subtext }}
                  className="text-[11px] mt-0.5"
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
                  Username
                </label>
                <input
                  value={addDriverForm.username}
                  onChange={(e) =>
                    setAddDriverForm((f) => ({
                      ...f,
                      username: e.target.value,
                    }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                  placeholder="AD username, e.g. jreyes"
                />
              </div>
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  License number
                </label>
                <input
                  value={addDriverForm.licenseNumber}
                  onChange={(e) =>
                    setAddDriverForm((f) => ({
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

      {/* Add Location modal */}
      {addLocationOpen && (
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
              Add Location Preset
            </p>
            <p style={{ color: theme.subtext }} className="text-[11px] mb-4">
              Tap the map to drop a pin for this location. Grey dots are
              existing presets.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Name
                </label>
                <input
                  value={addLocationForm.name}
                  onChange={(e) =>
                    setAddLocationForm((f) => ({ ...f, name: e.target.value }))
                  }
                  style={{
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                    color: theme.text,
                  }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                  placeholder="e.g. Ortigas Center"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label
                    style={{ color: theme.subtext }}
                    className="text-[11px] font-semibold"
                  >
                    Pin location
                  </label>
                  {addLocationForm.latitude != null && (
                    <button
                      onClick={() =>
                        setAddLocationForm((f) => ({
                          ...f,
                          latitude: null,
                          longitude: null,
                        }))
                      }
                      style={{ color: theme.subtext }}
                      className="text-[10.5px] font-semibold underline"
                    >
                      Clear pin
                    </button>
                  )}
                </div>
                <FleetLocationPickerMap
                  presets={locations}
                  value={
                    addLocationForm.latitude != null &&
                    addLocationForm.longitude != null
                      ? {
                          latitude: addLocationForm.latitude,
                          longitude: addLocationForm.longitude,
                        }
                      : null
                  }
                  onPick={(pt) =>
                    setAddLocationForm((f) => ({
                      ...f,
                      latitude: pt.latitude,
                      longitude: pt.longitude,
                    }))
                  }
                  theme={theme}
                />
                {addLocationForm.latitude != null && (
                  <p
                    style={{ color: theme.subtext }}
                    className="text-[10.5px] mt-1"
                  >
                    {addLocationForm.latitude.toFixed(5)},{" "}
                    {addLocationForm.longitude!.toFixed(5)}
                  </p>
                )}
              </div>
            </div>
            {addLocationError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {addLocationError}
              </p>
            )}
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setAddLocationOpen(false);
                  setAddLocationError("");
                  setAddLocationForm({ name: "", latitude: null, longitude: null });
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
                onClick={handleAddLocation}
                disabled={addLocationSubmitting}
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText,
                  opacity: addLocationSubmitting ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {addLocationSubmitting ? "Adding…" : "Add Location"}
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
      {/* View Locations modal */}
      {viewLocationsOpen && (
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
            <div className="flex items-start justify-between gap-2 mb-4">
              <div>
                <p
                  style={{ color: theme.text }}
                  className="text-base font-bold"
                >
                  Location Presets
                </p>
                <p
                  style={{ color: theme.subtext }}
                  className="text-[11px] mt-0.5"
                >
                  Reusable pickup / drop-off points.
                </p>
              </div>
              <button
                onClick={() => {
                  setViewLocationsOpen(false);
                  setAddLocationOpen(true);
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
            <div
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
              className="rounded-xl border divide-y max-h-[360px] overflow-y-auto"
            >
              {locations.length === 0 ? (
                <p
                  style={{ color: theme.subtext }}
                  className="text-xs px-4 py-4"
                >
                  No location presets yet.
                </p>
              ) : (
                locations.map((l) => (
                  <div
                    key={l.id}
                    style={{ borderColor: theme.border }}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <p
                      style={{ color: theme.text }}
                      className="text-[13px] font-medium truncate"
                    >
                      {l.name}
                    </p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => {
                          setViewLocationsOpen(false);
                          openEditLocation(l);
                        }}
                        style={{
                          color: theme.subtext,
                          borderColor: theme.border,
                        }}
                        className="p-1 rounded-md border"
                        aria-label="Edit location"
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
                      <button
                        onClick={() => handleDeleteLocation(l.id)}
                        disabled={deletingLocationId === l.id}
                        style={{
                          color: "#991b1b",
                          opacity: deletingLocationId === l.id ? 0.5 : 1,
                        }}
                        className="p-1 rounded-md"
                        aria-label="Delete location"
                      >
                        <svg
                          width="13"
                          height="13"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2L4 6h16Z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {locationDeleteError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mt-2">
                {locationDeleteError}
              </p>
            )}
            <button
              onClick={() => setViewLocationsOpen(false)}
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
                color: theme.text,
              }}
              className="w-full rounded-xl py-2.5 border text-sm font-semibold mt-4"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Edit Location modal */}
      {editingLocation && (
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
            <p
              style={{ color: theme.text }}
              className="text-base font-bold mb-1"
            >
              Edit Location
            </p>
            <p style={{ color: theme.subtext }} className="text-[11px] mb-4">
              Tap the map or search to move this location's pin.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label
                  style={{ color: theme.subtext }}
                  className="text-[11px] font-semibold block mb-1"
                >
                  Name
                </label>
                <input
                  value={editLocationForm.name}
                  onChange={(e) =>
                    setEditLocationForm((f) => ({ ...f, name: e.target.value }))
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
                <div className="flex items-center justify-between mb-1">
                  <label
                    style={{ color: theme.subtext }}
                    className="text-[11px] font-semibold"
                  >
                    Pin location
                  </label>
                  {editLocationForm.latitude != null && (
                    <button
                      onClick={() =>
                        setEditLocationForm((f) => ({
                          ...f,
                          latitude: null,
                          longitude: null,
                        }))
                      }
                      style={{ color: theme.subtext }}
                      className="text-[10.5px] font-semibold underline"
                    >
                      Clear pin
                    </button>
                  )}
                </div>
                <FleetLocationPickerMap
                  presets={locations.filter((l) => l.id !== editingLocation.id)}
                  value={
                    editLocationForm.latitude != null &&
                    editLocationForm.longitude != null
                      ? {
                          latitude: editLocationForm.latitude,
                          longitude: editLocationForm.longitude,
                        }
                      : null
                  }
                  onPick={(pt) =>
                    setEditLocationForm((f) => ({
                      ...f,
                      latitude: pt.latitude,
                      longitude: pt.longitude,
                    }))
                  }
                  theme={theme}
                />
                {editLocationForm.latitude != null && (
                  <p
                    style={{ color: theme.subtext }}
                    className="text-[10.5px] mt-1"
                  >
                    {editLocationForm.latitude.toFixed(5)},{" "}
                    {editLocationForm.longitude!.toFixed(5)}
                  </p>
                )}
              </div>
            </div>
            {editLocationError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {editLocationError}
              </p>
            )}
            <div className="flex gap-2.5 mb-2.5">
              <button
                onClick={() => {
                  setEditingLocation(null);
                  setEditLocationError("");
                  setConfirmDeleteLocation(false);
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
                onClick={handleUpdateLocation}
                disabled={editLocationSubmitting}
                style={{
                  backgroundColor: theme.primary,
                  color: theme.primaryText,
                  opacity: editLocationSubmitting ? 0.6 : 1,
                }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {editLocationSubmitting ? "Saving…" : "Save Changes"}
              </button>
            </div>
            <button
              onClick={() => {
                if (!confirmDeleteLocation) {
                  setConfirmDeleteLocation(true);
                  return;
                }
                handleDeleteLocationFromEdit();
              }}
              disabled={editLocationSubmitting}
              style={{
                backgroundColor: confirmDeleteLocation ? "#ef4444" : "#fee2e2",
                color: confirmDeleteLocation ? "#fff" : "#991b1b",
                opacity: editLocationSubmitting ? 0.6 : 1,
              }}
              className="w-full rounded-xl py-2.5 text-sm font-semibold"
            >
              {editLocationSubmitting
                ? "Deleting…"
                : confirmDeleteLocation
                  ? "Click again to confirm delete"
                  : "Delete Location"}
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
