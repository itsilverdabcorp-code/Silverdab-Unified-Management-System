// app/Admin/FleetOps/FleetControlTower/useFleetControlTowerData.ts
//
// All state, derived data, and handlers for the Fleet Control Tower page,
// shared between FleetControlTowerPage.web.tsx and
// FleetControlTowerPage.native.tsx — mirrors the
// SupplyRequestsPage/useSupplyRequestsData.ts split.
//
// Anything purely visual (JSX, per-platform components) stays in the
// .web.tsx / .native.tsx files. Anything about *what the data is* and
// *what happens when you tap a button* lives here.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import { useEmployees } from "../../../../hooks/useEmployees";
import { DriverDutyStatus } from "../../../../../types";
import type { CalendarEvent } from "../../../../components/common/Calendar";
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
  setDriverDutyStatus,
  TramigoDevice,
} from "../../../../services/fleetOps";
import {
  ADUser,
  FleetTrip,
  FleetVehicle,
  FleetDriver,
  TripStatus,
  VehicleStatus,
  VehicleType,
} from "../../../../../types";

const POLL_INTERVAL_MS = 5_000;
const DELAY_GRACE_MS = 15 * 60 * 1000;

// ─── Formatting helpers ─────────────────────────────────────────────────────

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  // mysql2's dateStrings option returns "YYYY-MM-DD HH:MM:SS" (space-
  // separated, no timezone). Swapping the space for "T" makes the Date
  // constructor parse it as local wall-clock time per spec — must stay in
  // sync with dateStrings: true on the MySQL pool in server.js.
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export function isToday(iso?: string | null): boolean {
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
// 15-minute grace period.
export function getDelayInfo(trip: FleetTrip): { label: string } | null {
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

export function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

export const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
];

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

// Tramigo device names come formatted as "Model - Plate" (e.g. "BYD -
// NOY1168"). Splitting on " - " lets us auto-fill plate/model from
// whichever device is picked.
export function parseTramigoDeviceName(name: string): { model: string; plate: string } {
  const parts = name.split(" - ");
  if (parts.length >= 2) {
    return { model: parts[0].trim(), plate: parts.slice(1).join(" - ").trim() };
  }
  return { model: name.trim(), plate: "" };
}

// ─── Status config (shared visual data — colors are used as style values,
// not classNames, so both RN and web can consume them directly) ───────────

export const TRIP_STATUS_CONFIG: Record<
  TripStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: "Pending", bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  approved: { label: "Approved", bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  ongoing: { label: "Ongoing", bg: "#cffafe", text: "#155e75", dot: "#06b6d4" },
  arrived: { label: "Arrived", bg: "#dbeafe", text: "#1d4ed8", dot: "#3b82f6" },
  returning: { label: "Returning", bg: "#fef3c7", text: "#92400e", dot: "#f59e0b" },
  completed: { label: "Completed", bg: "#dcfce7", text: "#166534", dot: "#15803d" },
  cancelled: { label: "Cancelled", bg: "#fef2f2", text: "#7f1d1d", dot: "#f87171" },
  rejected: { label: "Rejected", bg: "#fee2e2", text: "#991b1b", dot: "#ef4444" },
};

export const VEHICLE_STATUS_CONFIG: Record<
  VehicleStatus,
  { label: string; bg: string; text: string }
> = {
  idle: { label: "Available", bg: "#dcfce7", text: "#166534" },
  active: { label: "On Trip", bg: "#dbeafe", text: "#1d4ed8" },
  maintenance: { label: "Maintenance", bg: "#fee2e2", text: "#991b1b" },
  personal: { label: "Personal use", bg: "#fef3c7", text: "#92400e" },
};

// Vehicle status badge is driven by the booked trip's own status, not
// vehicle.status (Tramigo/GPS state) — a vehicle can be physically moving
// without a genuinely ongoing booked trip attached to it.
export function getVehicleDisplayStatus(
  v: FleetVehicle,
  onTripVehicleIds: Set<string>,
): { label: string; bg: string; text: string } {
  if (onTripVehicleIds.has(v.id)) return VEHICLE_STATUS_CONFIG.active;
  return VEHICLE_STATUS_CONFIG[v.status] ?? VEHICLE_STATUS_CONFIG.idle;
}

export const DUTY_STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  off_duty: { label: "Off Duty", bg: "#f1f5f9", text: "#64748b" },
  active: { label: "Available", bg: "#dcfce7", text: "#166534" },
  personal: { label: "Personal Use", bg: "#fef3c7", text: "#92400e" },
  leave: { label: "On Leave", bg: "#fee2e2", text: "#991b1b" },
};

export const FILTER_TABS: { key: "all" | TripStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "ongoing", label: "Ongoing" },
];

export const ACTIVE_STATUSES: TripStatus[] = [
  "pending",
  "approved",
  "ongoing",
  "arrived",
  "returning",
];

const ON_TRIP_STATUSES: TripStatus[] = ["ongoing", "arrived", "returning"];

// ─── Hook ───────────────────────────────────────────────────────────────────

export type FleetControlTowerProps = {
  user?: ADUser;
  onNavigate?: (
    tab: "fleet_vehicles" | "fleet_drivers" | "fleet_locations",
  ) => void;
};

export function useFleetControlTowerData({ user, onNavigate }: FleetControlTowerProps) {
  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<"all" | TripStatus>("all");

  // Pending-row assignment drafts, keyed by trip id.
  const [assignDrafts, setAssignDrafts] = useState<
    Record<string, { vehicleId: string; driverId: string }>
  >({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState<Record<string, boolean>>({});

  // Reject-reason
  const [rejectingTrip, setRejectingTrip] = useState<FleetTrip | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Map focus (web-only concept, harmless to keep on native — just unused)
  const [focusVehicle, setFocusVehicle] = useState<{ id: string; token: number } | null>(null);

  // View trip details
  const [viewingTrip, setViewingTrip] = useState<FleetTrip | null>(null);

  // Day-trips list (calendar click — web only, kept here for parity)
  const [dayTripsView, setDayTripsView] = useState<{ date: Date; trips: FleetTrip[] } | null>(null);

  // Add vehicle / driver
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

  // AD employee directory for the Add Driver picker.
  const { employees } = useEmployees();
  const employeeOptions = useMemo(
    () => employees.map((e: any) => ({ label: e.name, value: e.id })),
    [employees],
  );

  const existingDriverNames = useMemo(
    () => new Set(drivers.map((d) => d.name?.trim().toLowerCase()).filter(Boolean)),
    [drivers],
  );

  const existingVehiclePlates = useMemo(
    () => new Set(vehicles.map((v) => v.plateNumber?.trim().toLowerCase()).filter(Boolean)),
    [vehicles],
  );

  // Tramigo devices — loaded on demand when Add/Edit Vehicle opens.
  const [tramigoDevices, setTramigoDevices] = useState<TramigoDevice[]>([]);
  const loadTramigoDevices = useCallback(async () => {
    const devices = await getTramigoDevices();
    setTramigoDevices(devices);
  }, []);

  const unlinkedTramigoDevices = useCallback(
    (currentVehicleId?: string) => {
      const linked = new Set(
        vehicles
          .filter((v) => v.id !== currentVehicleId)
          .map((v) => v.tramigoDeviceId)
          .filter(Boolean),
      );
      return tramigoDevices.filter((d) => !linked.has(d.id));
    },
    [vehicles, tramigoDevices],
  );

  const [editingVehicle, setEditingVehicle] = useState<FleetVehicle | null>(null);
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
    contactNumber: "",
    dutyStatus: "off_duty" as DriverDutyStatus,
  });
  const [editDriverError, setEditDriverError] = useState("");
  const [editDriverSubmitting, setEditDriverSubmitting] = useState(false);
  const [confirmDeleteDriver, setConfirmDeleteDriver] = useState(false);

  const isFirstLoad = useRef(true);

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

    // Web-only: refresh when the tab regains focus. Guarded so it's a
    // no-op on native, where `window` isn't the right focus signal.
    let removeFocusListener: (() => void) | undefined;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onFocus = () => loadAll();
      window.addEventListener("focus", onFocus);
      removeFocusListener = () => window.removeEventListener("focus", onFocus);
    }

    return () => {
      clearInterval(intervalId);
      removeFocusListener?.();
    };
  }, [loadAll]);

  // ── KPIs ───────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const tripsToday = trips.filter((t) => isToday(t.departureDatetime)).length;
    const vehiclesOnTrip = trips.filter((t) => t.status === "ongoing" && t.vehicleId).length;
    const pendingApproval = trips.filter((t) => t.status === "pending").length;
    const underMaintenance = vehicles.filter((v) => v.status === "maintenance").length;
    return { tripsToday, vehiclesOnTrip, pendingApproval, underMaintenance };
  }, [trips, vehicles]);

  // ── Trip list (filtered, live trips first) ──────────────────────────────

  const filteredTrips = useMemo(() => {
    let result = trips.filter(
      (t) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "rejected",
    );
    if (statusFilter !== "all") result = result.filter((t) => t.status === statusFilter);
    return [...result].sort((a, b) => {
      const aToday = isToday(a.departureDatetime) ? 0 : 1;
      const bToday = isToday(b.departureDatetime) ? 0 : 1;
      if (aToday !== bToday) return aToday - bToday;
      const aActive = ACTIVE_STATUSES.includes(a.status) ? 0 : 1;
      const bActive = ACTIVE_STATUSES.includes(b.status) ? 0 : 1;
      if (aActive !== bActive) return aActive - bActive;
      return (
        new Date(a.departureDatetime).getTime() - new Date(b.departureDatetime).getTime()
      );
    });
  }, [trips, statusFilter]);

  const getAvailableVehicles = useCallback(
    (excludeTripId?: string) => {
      const inProgress = trips.filter(
        (t) =>
          (t.status === "ongoing" || t.status === "arrived" || t.status === "returning") &&
          t.id !== excludeTripId,
      );
      const busy = new Set(inProgress.map((t) => (t as any).vehicleId).filter(Boolean));
      return vehicles.filter(
        (v) => v.status !== "maintenance" && v.status !== "personal" && !busy.has(v.id),
      );
    },
    [vehicles, trips],
  );

  const getAvailableDrivers = useCallback(
    (excludeTripId?: string) => {
      const inProgress = trips.filter(
        (t) =>
          (t.status === "ongoing" || t.status === "arrived" || t.status === "returning") &&
          t.id !== excludeTripId,
      );
      const busy = new Set(inProgress.map((t) => t.driverId).filter(Boolean));
      return drivers.filter((d) => !busy.has(d.userId));
    },
    [drivers, trips],
  );

  // Maps every trip into the shared Calendar's neutral event shape (web only,
  // but cheap to compute and harmless on native).
  const calendarEvents = useMemo<CalendarEvent<FleetTrip>[]>(
    () =>
      trips.map((t) => {
        const cfg = TRIP_STATUS_CONFIG[t.status];
        return {
          id: t.id,
          start: t.departureDatetime,
          end: t.returnDatetime ?? null,
          title: t.dropoffLabel,
          subtitle: `from ${t.pickupLabel}`,
          color: { bg: cfg.bg, text: cfg.text, dot: cfg.dot },
          data: t,
        };
      }),
    [trips],
  );

  const availableVehicles = useMemo(() => getAvailableVehicles(), [getAvailableVehicles]);
  const availableDrivers = useMemo(() => getAvailableDrivers(), [getAvailableDrivers]);

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

  const ongoingTripByVehicleId = useMemo(() => {
    const map: Record<string, FleetTrip> = {};
    trips.forEach((t) => {
      if (t.status === "ongoing" && t.vehicleId) map[t.vehicleId] = t;
    });
    return map;
  }, [trips]);

  function vehicleRank(v: FleetVehicle): number {
    if (onTripVehicleIds.has(v.id)) return 1;
    if (v.status === "personal") return 2;
    if (v.status === "maintenance") return 3;
    return 0;
  }
  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => vehicleRank(a) - vehicleRank(b)),
    [vehicles, onTripVehicleIds],
  );

  function driverRank(d: FleetDriver): number {
    const onTrip = onTripDriverUserIds.has(d.userId) && !!d.vehiclePlate;
    if (onTrip) return 2;
    if (d.dutyStatus === "active") return 0;
    if (d.dutyStatus === "personal") return 1;
    return 3;
  }
  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => driverRank(a) - driverRank(b)),
    [drivers, onTripDriverUserIds],
  );

  // ── Actions ───────────────────────────────────────────────────────────

  function setDraft(tripId: string, patch: Partial<{ vehicleId: string; driverId: string }>) {
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
      await approveFleetTrip(trip.id, { vehicleId: draft.vehicleId, driverId: draft.driverId });
      await loadAll();
      return true;
    } catch (err) {
      console.error("Approve trip failed:", err);
      setRowError((prev) => ({ ...prev, [trip.id]: "Approval failed — try again." }));
      return false;
    } finally {
      setBusyTripId(null);
    }
  }

  async function handleReassign(trip: FleetTrip) {
    const draft = assignDrafts[trip.id];
    if (!draft?.vehicleId || !draft?.driverId) {
      setRowError((prev) => ({ ...prev, [trip.id]: "Select both a vehicle and a driver." }));
      return;
    }
    setBusyTripId(trip.id);
    try {
      await approveFleetTrip(trip.id, { vehicleId: draft.vehicleId, driverId: draft.driverId });
      setReassignOpen((prev) => ({ ...prev, [trip.id]: false }));
      await loadAll();
    } catch (err) {
      console.error("Reassign trip failed:", err);
      setRowError((prev) => ({ ...prev, [trip.id]: "Update failed — try again." }));
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
      // Status lives on its own endpoint — same one the driver-facing duty
      // toggle uses — rather than being folded into the generic update.
      if (editVehicleForm.status !== editingVehicle.status) {
        await setVehicleStatus(editingVehicle.id, editVehicleForm.status);
      }
      setEditingVehicle(null);
      await loadAll();
    } catch (err) {
      console.error("Update vehicle failed:", err);
      setEditVehicleError(err instanceof Error ? err.message : "Failed to update vehicle.");
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
      setEditVehicleError(err instanceof Error ? err.message : "Failed to delete vehicle.");
    } finally {
      setEditVehicleSubmitting(false);
    }
  }

  function openEditDriver(d: FleetDriver) {
    setEditingDriver(d);
    setEditDriverForm({
      contactNumber: d.contactNumber ?? "",
      dutyStatus: (d.dutyStatus as DriverDutyStatus) ?? "off_duty",
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
        contactNumber: editDriverForm.contactNumber.trim(),
      });
      // Duty status lives on its own endpoint — same pattern as the
      // vehicle-status toggle — so admins can correct it even if the
      // driver forgot to update it themselves.
      if (editDriverForm.dutyStatus !== editingDriver.dutyStatus) {
        await setDriverDutyStatus(editingDriver.id, editDriverForm.dutyStatus);
      }
      setEditingDriver(null);
      await loadAll();
    } catch (err) {
      console.error("Update driver failed:", err);
      setEditDriverError(err instanceof Error ? err.message : "Failed to update driver.");
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
      setEditDriverError(err instanceof Error ? err.message : "Failed to delete driver.");
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
      setAddVehicleWarning("");
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
      setAddDriverError(err instanceof Error ? err.message : "Failed to add driver — try again.");
    } finally {
      setAddDriverSubmitting(false);
    }
  }

  return {
    // data
    trips, vehicles, drivers, loading, onNavigate, user,
    // filters
    statusFilter, setStatusFilter,
    // assignment drafts
    assignDrafts, setDraft, rowError, busyTripId, reassignOpen, setReassignOpen,
    // reject
    rejectingTrip, setRejectingTrip, rejectReason, setRejectReason, handleReject,
    // map focus
    focusVehicle, setFocusVehicle,
    // view / calendar
    viewingTrip, setViewingTrip, dayTripsView, setDayTripsView, calendarEvents,
    // add vehicle
    addVehicleOpen, setAddVehicleOpen,
    addVehicleForm, setAddVehicleForm,
    addVehicleError, addVehicleWarning, setAddVehicleWarning, addVehicleSubmitting,
    handleAddVehicle,
    // add driver
    addDriverOpen, setAddDriverOpen,
    addDriverForm, setAddDriverForm,
    addDriverError, addDriverWarning, setAddDriverWarning, addDriverSubmitting,
    handleAddDriver,
    employeeOptions, existingDriverNames, existingVehiclePlates,
    // tramigo
    tramigoDevices, loadTramigoDevices, unlinkedTramigoDevices,
    // edit vehicle
    editingVehicle, setEditingVehicle, editVehicleForm, setEditVehicleForm,
    editVehicleError, editVehicleSubmitting, confirmDeleteVehicle, setConfirmDeleteVehicle,
    openEditVehicle, handleUpdateVehicle, handleDeleteVehicle,
    // edit driver
    editingDriver, setEditingDriver, editDriverForm, setEditDriverForm,
    editDriverError, editDriverSubmitting, confirmDeleteDriver, setConfirmDeleteDriver,
    openEditDriver, handleUpdateDriver, handleDeleteDriver,
    // derived
    kpi, filteredTrips, availableVehicles, availableDrivers,
    getAvailableVehicles, getAvailableDrivers,
    onTripDriverUserIds, onTripVehicleIds, ongoingTripByVehicleId,
    sortedVehicles, sortedDrivers,
    // trip actions
    handleApprove, handleReassign, handleMarkArrived, handleStartReturn, handleComplete,
    // refresh
    loadAll,
  };
}

export type FleetControlTowerData = ReturnType<typeof useFleetControlTowerData>;
