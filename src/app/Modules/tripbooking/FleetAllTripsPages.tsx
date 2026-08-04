// app/Modules/tripbooking/FleetAllTripsPage.tsx
//
// Fleet Ops — All Trips (full trip log)
// Split out of FleetControlTowerPage's "All trips" subtab into its own
// page/nav item. Reuses the exact same trip-detail modal (view/approve/
// reject/mark arrived/start return/complete/reassign) as
// FleetControlTowerPage, so a trip that's still pending or in progress can
// be acted on right from this list too — not just completed/cancelled/
// rejected ones.

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import {
  getAllFleetTrips,
  getAllFleetVehicles,
  getAllFleetDrivers,
  approveFleetTrip,
  rejectFleetTrip,
  markTripArrived,
  startTripReturn,
  completeFleetTrip,
} from "../../../services/fleetOps";
import {
  ADUser,
  FleetTrip,
  FleetVehicle,
  FleetDriver,
  TripStatus,
} from "../../../../types";

type Props = { user?: ADUser };

const POLL_INTERVAL_MS = 5_000;

// ─── Helpers (mirrors FleetControlTowerPage.tsx) ───────────────────────────

function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  // mysql2's dateStrings option returns "YYYY-MM-DD HH:MM:SS" (space-
  // separated, no timezone). Swapping the space for "T" makes the Date
  // constructor parse it as local wall-clock time per spec, instead of
  // browser-dependent guessing — this must stay in sync with dateStrings:
  // true on the MySQL pool in server.js.
  const d = new Date(iso.includes("T") ? iso : iso.replace(" ", "T"));
  if (isNaN(d.getTime())) return "—";  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// Completed trips sort by when they actually finished, not when they were
// originally scheduled to depart — fleet_trips.updated_at gets stamped with
// NOW() at the moment a trip is marked completed (see POST
// /fleet/trips/:id/complete in server.js).
function getTripSortDate(trip: FleetTrip): string {
  return trip.status === "completed"
    ? trip.updatedAt || trip.departureDatetime
    : trip.departureDatetime;
}

const TRIP_STATUS_CONFIG: Record<
  TripStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: "Pending", bg: "#FAEEDA", text: "#633806", dot: "#EF9F27" },
  approved: {
    label: "Approved",
    bg: "#E6F1FB",
    text: "#0C447C",
    dot: "#378ADD",
  },
  ongoing: {
    label: "Ongoing",
    bg: "#EAF3DE",
    text: "#27500A",
    dot: "#639922",
  },
  arrived: {
    label: "Arrived",
    bg: "#E1F5EE",
    text: "#085041",
    dot: "#1D9E75",
  },
  returning: {
    label: "Returning",
    bg: "#FAECE7",
    text: "#712B13",
    dot: "#D85A30",
  },
  completed: {
    label: "Completed",
    bg: "#DCFCE7",
    text: "#15803D",
    dot: "#22C55E",
  },
  cancelled: {
    label: "Cancelled",
    bg: "#F1EFE8",
    text: "#444441",
    dot: "#888780",
  },
  rejected: {
    label: "Rejected",
    bg: "#FCEBEB",
    text: "#791F1F",
    dot: "#E24B4A",
  },
};

const FILTER_TABS: { key: "all" | TripStatus; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "ongoing", label: "Ongoing" },
  { key: "arrived", label: "Arrived" },
  { key: "returning", label: "Returning" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "rejected", label: "Rejected" },
];

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

const ACTIVE_STATUSES: TripStatus[] = [
  "pending",
  "approved",
  "ongoing",
  "arrived",
  "returning",
];

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FleetAllTripsPage({ user }: Props) {
  const { theme } = useTheme();

  const [trips, setTrips] = useState<FleetTrip[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [drivers, setDrivers] = useState<FleetDriver[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | TripStatus>("all");

  const [viewingTrip, setViewingTrip] = useState<FleetTrip | null>(null);
  const [rejectingTrip, setRejectingTrip] = useState<FleetTrip | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [assignDrafts, setAssignDrafts] = useState<
    Record<string, { vehicleId: string; driverId: string }>
  >({});
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [busyTripId, setBusyTripId] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState<Record<string, boolean>>({});

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
    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAll]);

  // Search-filtered set, independent of the status tab — tab counts below
  // are derived from this so every badge reflects the current search term
  // without being narrowed by whichever tab happens to be selected.
  const searchFilteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trips;
    return trips.filter((t) =>
      [
        t.pickupLabel,
        t.dropoffLabel,
        t.requestorName,
        t.vehiclePlate,
        t.driverName,
        t.tripRef,
        t.purpose,
      ]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [trips, search]);

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
    if (statusFilter !== "all")
      result = result.filter((t) => t.status === statusFilter);
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

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      <style>{`
        .fatp-scroll::-webkit-scrollbar { width: 6px; }
        .fatp-scroll::-webkit-scrollbar-track { background: transparent; }
        .fatp-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .fatp-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
        
      `}</style>

      <div className="px-5 pt-5 pb-4 flex-shrink-0">
        <h1
          style={{ color: theme.text }}
          className="text-xl font-bold leading-tight"
        >
          All Trips
        </h1>
        <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
          Full trip log — search and filter across every booking.
        </p>
        <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
          {filteredTrips.length} of {trips.length} trips
        </p>
      </div>

      <div className="px-5 flex-shrink-0 mb-3">
        {/* Search row */}
        <div className="relative w-full sm:w-80 mb-3">
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={theme.subtext}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              position: "absolute",
              left: 11,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search route, employee, vehicle, driver…"
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              color: theme.text,
            }}
            className="w-full text-[12.5px] pl-9 pr-3 py-2 border rounded-lg focus:outline-none"
          />
        </div>

        {/* Underline status tabs — same pattern as the category tabs on
            Office Inventory: active tab gets a colored bottom border, each
            tab carries its own live count badge. */}
        <div
          style={{ borderBottom: `1px solid ${theme.border}` }}
          className="flex items-end gap-0 overflow-x-auto fatp-scroll -mb-px"
        >
          {FILTER_TABS.map((tab) => {
            const active = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                style={{
                  color: active ? theme.primary : theme.subtext,
                  borderBottom: active
                    ? `2px solid ${theme.primary}`
                    : "2px solid transparent",
                  backgroundColor: "transparent",
                }}
                className="px-3.5 py-2 text-[12.5px] font-medium whitespace-nowrap transition-colors focus:outline-none flex-shrink-0"
                onMouseEnter={(e) => {
                  if (!active) e.currentTarget.style.color = theme.text;
                }}
                onMouseLeave={(e) => {
                  if (!active) e.currentTarget.style.color = theme.subtext;
                }}
              >
                {tab.label}
                <span
                  style={{
                    backgroundColor: active ? theme.primary : theme.background,
                    color: active ? theme.primaryText : theme.subtext,
                  }}
                  className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                >
                  {tabCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-5 pb-5 flex-1 min-h-0">
        <div className="fatp-scroll h-full overflow-auto">
          <table
            className="min-w-full text-sm border rounded-lg"
            style={{
              borderCollapse: "separate",
              borderSpacing: 0,
              borderColor: theme.border,
            }}
          >
            <thead>
              <tr>
                   {[
                  "Pickup",
                  "Drop-off",
                  "Purpose",
                  "Employee",
                  "Vehicle",
                  "Driver",
                  "Date Booked",
                  "Schedule",
                  "Status",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      color: theme.subtext,
                      borderBottom: `1px solid ${theme.border}`,
                      backgroundColor: theme.surfaceRaised ?? theme.surface,
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      boxShadow: `0 1px 0 ${theme.border}`,
                    }}
                    className="text-left text-[10.5px] font-semibold uppercase tracking-wide px-4 py-2 whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredTrips.length === 0 ? (
                <tr>
                 <td
                    colSpan={9}
                    style={{ color: theme.subtext }}
                    className="text-xs text-center px-4 py-6"
                  >
                    No trips match this filter.
                  </td>
                </tr>
              ) : (
                filteredTrips.map((trip, index) => {
                  const cfg = TRIP_STATUS_CONFIG[trip.status];
                  return (
                    <tr
                      key={trip.id}
                      onClick={() => setViewingTrip(trip)}
                      style={{
                        backgroundColor:
                          index % 2 === 0 ? theme.surface : theme.background,
                        borderBottom: `1px solid ${theme.border}`,
                        cursor: "pointer",
                      }}
                    >
                      <td className="px-4 py-2.5">
                        <p
                          style={{ color: theme.text }}
                          className="text-[12.5px] font-semibold"
                        >
                          {trip.pickupLabel}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p
                          style={{ color: theme.text }}
                          className="text-[12.5px] font-semibold"
                        >
                          {trip.dropoffLabel}
                        </p>
                      </td>
                      <td className="px-4 py-2.5">
                        <p
                          style={{ color: theme.subtext }}
                          className="text-[12px]"
                        >
                          {trip.purpose || "—"}
                        </p>
                      </td>
                      <td
                        style={{ color: theme.text }}
                        className="px-4 py-2.5 text-[12.5px] whitespace-nowrap"
                      >
                        {trip.requestorName}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {trip.vehiclePlate ? (
                          <span
                            style={{
                              backgroundColor: theme.background,
                              color: theme.subtext,
                              borderColor: theme.border,
                            }}
                            className="px-1.5 py-px rounded border font-mono text-[10px]"
                          >
                            {trip.vehiclePlate}
                          </span>
                        ) : (
                          <span
                            style={{ color: theme.subtext }}
                            className="text-[12.5px]"
                          >
                            —
                          </span>
                        )}
                      </td>
                    <td
                        style={{ color: theme.text }}
                        className="px-4 py-2.5 text-[12.5px] whitespace-nowrap"
                      >
                        {trip.driverName ?? "—"}
                      </td>
                      <td
                        style={{ color: theme.subtext }}
                        className="px-4 py-2.5 text-[12.5px] whitespace-nowrap"
                      >
                        {formatDateTime(trip.createdAt)}
                      </td>
                      <td
                        style={{ color: theme.subtext }}
                        className="px-4 py-2.5 text-[12.5px] whitespace-nowrap"
                      >
                        {formatDateTime(trip.departureDatetime)}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <StatusBadge config={cfg} size="sm" />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reject-reason modal */}
      {rejectingTrip && (
        <div
          className="absolute inset-0 items-center justify-center p-6 flex"
          style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000 }}
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
          style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000 }}
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
                [
                  "Passengers",
                  viewingTrip.passengerNames && viewingTrip.passengerNames.length > 0
                    ? `${viewingTrip.passengerCount} (${viewingTrip.passengerNames.join(", ")})`
                    : String(viewingTrip.passengerCount),
                ],
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
                      .sort((a, b) => {
                        const parseTs = (s: string) => new Date(s.includes("T") ? s : s.replace(" ", "T"));
                        return parseTs(b.timestamp).getTime() - parseTs(a.timestamp).getTime();
                      })
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

              if (
                viewingTrip.status === "approved" ||
                viewingTrip.status === "ongoing"
              ) {
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
    </div>
  );
}
