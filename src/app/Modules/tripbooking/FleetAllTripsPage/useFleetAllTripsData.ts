// app/Modules/tripbooking/FleetAllTrips/useFleetAllTripsData.ts
//
// All state, derived data, and handlers for the Fleet All Trips page,
// shared between FleetAllTripsPage.web.tsx and
// FleetAllTripsPage.native.tsx — same split as
// FleetControlTower/useFleetControlTowerData.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import type { CalendarEvent } from "../../../../components/common/Calendar";
import {
  getAllFleetTrips,
  getAllFleetVehicles,
  getAllFleetDrivers,
  approveFleetTrip,
  rejectFleetTrip,
  markTripArrived,
  startTripReturn,
  completeFleetTrip,
  archiveFleetTrip,
  unarchiveFleetTrip,
} from "../../../../services/fleetOps";
import { ADUser, FleetTrip, FleetVehicle, FleetDriver, TripStatus } from "../../../../../types";

const POLL_INTERVAL_MS = 5_000;

// ─── Formatting / parsing helpers ───────────────────────────────────────────

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

// Completed trips sort by when they actually finished, not when they were
// originally scheduled to depart — fleet_trips.updated_at gets stamped with
// NOW() at the moment a trip is marked completed (see POST
// /fleet/trips/:id/complete in server.js).
export function getTripSortDate(trip: FleetTrip): string {
  return trip.status === "completed" ? trip.updatedAt || trip.departureDatetime : trip.departureDatetime;
}

// Same "YYYY-MM-DD HH:MM:SS" -> local Date parsing used everywhere else
// (mysql2 dateStrings). Returns NaN for missing/invalid input.
export function parseLocalMs(s?: string | null): number {
  if (!s) return NaN;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return d.getTime();
}

// ─── Status config ───────────────────────────────────────────────────────

export const TRIP_STATUS_CONFIG: Record<
  TripStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: "Pending", bg: "#FAEEDA", text: "#633806", dot: "#EF9F27" },
  approved: { label: "Approved", bg: "#E6F1FB", text: "#0C447C", dot: "#378ADD" },
  ongoing: { label: "Ongoing", bg: "#EAF3DE", text: "#27500A", dot: "#639922" },
  arrived: { label: "Arrived", bg: "#E1F5EE", text: "#085041", dot: "#1D9E75" },
  returning: { label: "Returning", bg: "#FAECE7", text: "#712B13", dot: "#D85A30" },
  completed: { label: "Completed", bg: "#DCFCE7", text: "#15803D", dot: "#22C55E" },
  cancelled: { label: "Cancelled", bg: "#F1EFE8", text: "#444441", dot: "#888780" },
  rejected: { label: "Rejected", bg: "#FCEBEB", text: "#791F1F", dot: "#E24B4A" },
};

export const FILTER_TABS: { key: "all" | TripStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "ongoing", label: "Ongoing" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rejected", label: "Rejected" },
];

export const ACTIVE_STATUSES: TripStatus[] = [
  "pending",
  "approved",
  "ongoing",
  "arrived",
  "returning",
];

// ─── Hook ───────────────────────────────────────────────────────────────────

export type FleetAllTripsProps = { user?: ADUser };

export function useFleetAllTripsData({ user }: FleetAllTripsProps) {
  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TripStatus>("all");

  const [viewingTrip, setViewingTrip] = useState<FleetTrip | null>(null);
  const [rejectingTrip, setRejectingTrip] = useState<FleetTrip | null>(null);
  const [dayTripsView, setDayTripsView] = useState<{ date: Date; trips: FleetTrip[] } | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "calendar">("table");
  const [rejectReason, setRejectReason] = useState("");
  const [assignDrafts, setAssignDrafts] = useState<
    Record<string, { vehicleId: string; driverId: string }>
  >({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState<Record<string, boolean>>({});
  const [showArchived, setShowArchived] = useState(false);

  const isFirstLoad = useRef(true);

  const loadAll = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [t, v, d] = await Promise.all([
        getAllFleetTrips(true), // always fetch archived too; filtered client-side by showArchived
        getAllFleetVehicles(),
        getAllFleetDrivers(),
      ]);
      setTrips(t);
      setVehicles(v);
      setDrivers(d);
    } catch (err) {
      console.error("All Trips load error:", err);
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

  // Search-filtered set, independent of the status tab — tab counts are
  // derived from this so every badge reflects the current search term
  // without being narrowed by whichever tab happens to be selected.
  const searchFilteredTrips = useMemo(() => {
    const scoped = trips.filter((t) => !!(t as any).isArchived === showArchived);
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((t) =>
      [t.pickupLabel, t.dropoffLabel, t.requestorName, t.vehiclePlate, t.driverName, t.tripRef, t.purpose]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [trips, search, showArchived]);

  const tabCounts = useMemo(() => {
    const counts: Record<"all" | TripStatus, number> = {
      all: searchFilteredTrips.length,
      pending: 0,
      approved: 0,
      ongoing: 0,
      arrived: 0,
      returning: 0,
      completed: 0,
      cancelled: 0,
      rejected: 0,
    };
    searchFilteredTrips.forEach((t) => {
      counts[t.status]++;
    });
    return counts;
  }, [searchFilteredTrips]);

  const filteredTrips = useMemo(() => {
    let result = searchFilteredTrips;
    if (statusFilter !== "all") result = result.filter((t) => t.status === statusFilter);
    return [...result].sort((a, b) => {
      const parseDate = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T"));
      const aTime = parseDate(getTripSortDate(a)).getTime();
      const bTime = parseDate(getTripSortDate(b)).getTime();
      const aValid = !isNaN(aTime);
      const bValid = !isNaN(bTime);
      if (!aValid && !bValid) return 0;
      if (!aValid) return 1;
      if (!bValid) return -1;
      return bTime - aTime;
    });
  }, [searchFilteredTrips, statusFilter]);

  // Maps trips into the shared calendar's neutral event shape (web only,
  // cheap to compute and harmless on native).
  const calendarEvents = useMemo<CalendarEvent<FleetTrip>[]>(
    () =>
      filteredTrips.map((t) => ({
        id: t.id,
        start: t.departureDatetime,
        end: t.returnDatetime,
        title: t.dropoffLabel,
        subtitle: `from ${t.pickupLabel}`,
        color: TRIP_STATUS_CONFIG[t.status],
        data: t,
      })),
    [filteredTrips],
  );

  // Every vehicle (except maintenance/personal-use) and every driver
  // (except personal-use) is always assignable — a vehicle or driver
  // already on another trip is NOT filtered out or hidden. Same rule as
  // FleetControlTowerPage's Trip Requests dropdown.
  const getAvailableVehicles = useCallback(
    (_forTrip: FleetTrip, _excludeTripId?: string) => {
      return vehicles.filter((v) => v.status !== "maintenance" && v.status !== "personal");
    },
    [vehicles],
  );

  const getAvailableDrivers = useCallback(
    (_forTrip: FleetTrip, _excludeTripId?: string) => {
      return drivers.filter((d) => d.dutyStatus !== "personal");
    },
    [drivers],
  );

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
      setRowError((prev) => ({ ...prev, [trip.id]: "Select both a vehicle and a driver before approving." }));
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

  async function handleArchive(trip: FleetTrip) {
    setBusyTripId(trip.id);
    try {
      await archiveFleetTrip(trip.id);
      await loadAll();
    } catch (err) {
      console.error("Archive trip failed:", err);
      setRowError((prev) => ({ ...prev, [trip.id]: "Failed to archive — try again." }));
    } finally {
      setBusyTripId(null);
    }
  }

  async function handleUnarchive(trip: FleetTrip) {
    setBusyTripId(trip.id);
    try {
      await unarchiveFleetTrip(trip.id);
      await loadAll();
    } catch (err) {
      console.error("Restore trip failed:", err);
      setRowError((prev) => ({ ...prev, [trip.id]: "Failed to restore — try again." }));
    } finally {
      setBusyTripId(null);
    }
  }

  return {
    user,
    trips, vehicles, drivers, loading,
    search, setSearch,
    statusFilter, setStatusFilter,
    viewingTrip, setViewingTrip,
    rejectingTrip, setRejectingTrip,
    dayTripsView, setDayTripsView,
    viewMode, setViewMode,
    rejectReason, setRejectReason,
    assignDrafts, setDraft, rowError, busyTripId,
    reassignOpen, setReassignOpen,
    searchFilteredTrips, tabCounts, filteredTrips, calendarEvents,
    getAvailableVehicles, getAvailableDrivers,
    handleApprove, handleReassign, handleReject,
    handleMarkArrived, handleStartReturn, handleComplete,
    handleArchive, handleUnarchive,
    showArchived, setShowArchived,
    loadAll,
  };
}

export type FleetAllTripsData = ReturnType<typeof useFleetAllTripsData>;
