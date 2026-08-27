// app/Modules/facilities/RoomReservation/useRoomReservationData.ts
//
// All state, derived data, and handlers for the Room Reservation page —
// same split as Fleet All Trips (useFleetAllTripsData.ts).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import type { CalendarEvent } from "../../../components/common/Calendar";
import {
  getAllRoomReservations,
  cancelRoomReservation,
} from "../../../services/roomReservation";
import {
  ADUser,
  RoomReservation,
  RoomName,
  RoomReservationStatus,
} from "../../../../types";

const POLL_INTERVAL_MS = 10_000;

// ─── Room config (color legend, matches ocgbim.com Bookings rooms) ─────────

export const ROOM_CONFIG: Record<
  RoomName,
  { label: string; bg: string; text: string; dot: string }
> = {
  "Conference Room": {
    label: "Conference Room",
    bg: "#E6F1FB",
    text: "#0C447C",
    dot: "#378ADD",
  },
  "Meeting Room 1": {
    label: "Meeting Room 1",
    bg: "#EAF3DE",
    text: "#27500A",
    dot: "#639922",
  },
  "Meeting Room 2": {
    label: "Meeting Room 2",
    bg: "#FAECE7",
    text: "#712B13",
    dot: "#D85A30",
  },
};

export const ROOM_FILTER_TABS: { key: "all" | RoomName; label: string }[] = [
  { key: "all", label: "All Rooms" },
  { key: "Conference Room", label: "Conference Room" },
  { key: "Meeting Room 1", label: "Meeting Room 1" },
  { key: "Meeting Room 2", label: "Meeting Room 2" },
];
export const STATUS_FILTER_TABS: {
  key: "all" | DisplayStatus;
  label: string;
}[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "ongoing", label: "Ongoing" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
];

export const STATUS_BADGE_CONFIG: Record<
  DisplayStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  pending: { label: "Pending", bg: "#FEF3C7", text: "#92400E", dot: "#F59E0B" },
  ongoing: { label: "Ongoing", bg: "#DCFCE7", text: "#15803D", dot: "#22C55E" },
  completed: {
    label: "Completed",
    bg: "#E1F5EE",
    text: "#085041",
    dot: "#1D9E75",
  },
  cancelled: {
    label: "Cancelled",
    bg: "#FEE2E2",
    text: "#B91C1C",
    dot: "#EF4444",
  },
};
// ─── Formatting helpers ─────────────────────────────────────────────────────

// mysql2 dateStrings-style "YYYY-MM-DD HH:MM:SS" or "HH:MM:SS" -> readable.
export function formatDate(dateStr?: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatTime(timeStr?: string | null): string {
  if (!timeStr) return "—";
  const [hStr, mStr] = timeStr.split(":");
  let h = Number(hStr);
  const m = mStr ?? "00";
  const period = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${period}`;
}

export function formatDateTimeShort(createdAt?: string | null): string {
  if (!createdAt) return "—";
  const d = new Date(
    createdAt.includes("T") ? createdAt : createdAt.replace(" ", "T"),
  );
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export type DisplayStatus = "pending" | "ongoing" | "completed" | "cancelled";

export function getDisplayStatus(
  r: Pick<RoomReservation, "status" | "bookingDate" | "startTime" | "endTime">,
): DisplayStatus {
  if (r.status === "cancelled") return "cancelled";

  const now = new Date();
  const start = new Date(`${r.bookingDate}T${r.startTime}`);
  const end = new Date(`${r.bookingDate}T${r.endTime}`);

  if (now < start) return "pending";
  if (now >= end) return "completed";
  return "ongoing";
}

function normalizeReservation(r: any): RoomReservation {
  return {
    id: String(r.id),
    bookingId: r.bookingId,
    roomRef: r.roomRef,
    roomName: r.roomName,
    maxAttendees: r.maxAttendees,
    bookingDate: r.bookingDate,
    startTime: r.startTime,
    endTime: r.endTime,
    fullName: r.fullName,
    email: r.email,
    guestEmails: r.guestEmails ?? [],
    specialRequests: r.specialRequests ?? "",
    avRequirement: r.avRequirement ?? "None",
    needsWifi: !!r.needsWifi,
    agenda: r.agenda ?? "",
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export type RoomReservationPageProps = { user?: ADUser };

export function useRoomReservationData({ user }: RoomReservationPageProps) {
  const [reservations, setReservations] = useState<RoomReservation[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [roomFilter, setRoomFilter] = useState<"all" | RoomName>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | DisplayStatus>(
    "all",
  );

  const [viewMode, setViewMode] = useState<"table" | "calendar">("calendar");
  const [viewingReservation, setViewingReservation] =
    useState<RoomReservation | null>(null);
  const [dayView, setDayView] = useState<{
    date: Date;
    reservations: RoomReservation[];
  } | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string>("");

  const isFirstLoad = useRef(true);

  const loadAll = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const raw = await getAllRoomReservations();
      setReservations(raw.map(normalizeReservation));
    } catch (err) {
      console.error("Room reservations load error:", err);
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
    const intervalId = setInterval(loadAll, POLL_INTERVAL_MS);

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

  const searchFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return reservations;
    return reservations.filter((r) =>
      [r.roomName, r.fullName, r.email, r.agenda, r.bookingId]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(q)),
    );
  }, [reservations, search]);

  const roomCounts = useMemo(() => {
    const counts: Record<"all" | RoomName, number> = {
      all: searchFiltered.length,
      "Conference Room": 0,
      "Meeting Room 1": 0,
      "Meeting Room 2": 0,
    };
    searchFiltered.forEach((r) => {
      counts[r.roomName]++;
    });
    return counts;
  }, [searchFiltered]);

  const statusCounts = useMemo(() => {
    const roomScoped =
      roomFilter === "all"
        ? searchFiltered
        : searchFiltered.filter((r) => r.roomName === roomFilter);
    const counts: Record<"all" | DisplayStatus, number> = {
      all: roomScoped.length,
      pending: 0,
      ongoing: 0,
      completed: 0,
      cancelled: 0,
    };
    roomScoped.forEach((r) => {
      counts[getDisplayStatus(r)]++;
    });
    return counts;
  }, [searchFiltered, roomFilter]);

  const filteredReservations = useMemo(() => {
    let result = searchFiltered;
    if (roomFilter !== "all")
      result = result.filter((r) => r.roomName === roomFilter);
    if (statusFilter !== "all")
      result = result.filter((r) => getDisplayStatus(r) === statusFilter);
    return [...result].sort((a, b) => {
      const aKey = `${a.bookingDate} ${a.startTime}`;
      const bKey = `${b.bookingDate} ${b.startTime}`;
      return bKey.localeCompare(aKey);
    });
  }, [searchFiltered, roomFilter, statusFilter]);

  // Maps reservations into the shared Calendar's neutral event shape,
  // colored per-room so the legend and event blocks line up.
  //
  // Month view only ever renders `title` (not `subtitle`) — see
  // MonthGridView in Calendar.tsx — so time + requester need to live in
  // title itself to be visible there. Time-grid views (day/4days/week)
  // render both, so subtitle carries the room name for those.
  const calendarEvents = useMemo<CalendarEvent<RoomReservation>[]>(
    () =>
      filteredReservations
        .filter((r) => r.status !== "cancelled")
        .map((r) => ({
          id: r.id,
          start: `${r.bookingDate} ${r.startTime}`,
          end: `${r.bookingDate} ${r.endTime}`,
          title: `${formatTime(r.startTime)} – ${formatTime(r.endTime)} · ${r.agenda || "No purpose"} · ${r.fullName}`,
          subtitle: `${r.roomName} · ${r.fullName}`,
          color: ROOM_CONFIG[r.roomName],
          data: r,
        })),
    [filteredReservations],
  );

  async function handleCancel(reservation: RoomReservation) {
    setBusyId(reservation.id);
    setActionError("");
    try {
      await cancelRoomReservation(reservation.id);
      await loadAll();
      setViewingReservation(null);
    } catch (err: any) {
      console.error("Cancel reservation failed:", err);
      setActionError(err?.message ?? "Failed to cancel reservation.");
    } finally {
      setBusyId(null);
    }
  }

  return {
    user,
    reservations,
    loading,
    search,
    setSearch,
    roomFilter,
    setRoomFilter,
    statusFilter,
    setStatusFilter,
    viewMode,
    setViewMode,
    viewingReservation,
    setViewingReservation,
    dayView,
    setDayView,
    busyId,
    actionError,
    setActionError,
    roomCounts,
    statusCounts,
    filteredReservations,
    calendarEvents,
    handleCancel,
    loadAll,
  };
}

export type RoomReservationData = ReturnType<typeof useRoomReservationData>;
