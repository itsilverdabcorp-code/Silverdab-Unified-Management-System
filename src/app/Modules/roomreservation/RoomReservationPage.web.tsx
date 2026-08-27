// app/Modules/facilities/RoomReservation/RoomReservationPage.web.tsx
//
// Room Reservation — table + calendar views, filterable by room and status.
// Structure mirrors FleetAllTripsPage.web.tsx.

import React, { useState } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import Calendar from "../../../components/common/Calendar";
import RoomReservationModal from "../employee/Modal/RoomReservationModal";
import {
  useRoomReservationData,
  RoomReservationPageProps,
  formatDate,
  formatTime,
  formatDateTimeShort,
  getDisplayStatus,
  ROOM_CONFIG,
  ROOM_FILTER_TABS,
  STATUS_FILTER_TABS,
  STATUS_BADGE_CONFIG,
} from "./useRoomReservationData";

function Badge({
  config,
}: {
  config: { label: string; bg: string; text: string; dot?: string };
}) {
  return (
    <span
      style={{ backgroundColor: config.bg, color: config.text }}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-semibold whitespace-nowrap text-[10.5px]"
    >
      {config.dot && (
        <span
          style={{ backgroundColor: config.dot, width: 5, height: 5, borderRadius: "50%" }}
          className="inline-block flex-shrink-0"
        />
      )}
      {config.label}
    </span>
  );
}

export default function RoomReservationPage(props: RoomReservationPageProps) {
  const { theme } = useTheme();
  const data = useRoomReservationData(props);
  const [reserveModalVisible, setReserveModalVisible] = useState(false);

  const {
    reservations,
    search, setSearch,
    roomFilter, setRoomFilter,
    statusFilter, setStatusFilter,
    viewMode, setViewMode,
    viewingReservation, setViewingReservation,
    dayView, setDayView,
    busyId, actionError,
    roomCounts, statusCounts, filteredReservations, calendarEvents,
    handleCancel,
    loading,
    loadAll,
  } = data;

  if (loading) {
    return (
      <div style={{ backgroundColor: theme.background }} className="flex flex-1 items-center justify-center h-full">
        <div style={{ borderColor: theme.primary }} className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ backgroundColor: theme.background }} className="flex flex-col h-full overflow-hidden">
      <style>{`
        .rrp-scroll::-webkit-scrollbar { width: 6px; }
        .rrp-scroll::-webkit-scrollbar-track { background: transparent; }
        .rrp-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .rrp-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
      `}</style>

      <div className="px-5 pt-5 pb-4 flex-shrink-0 flex items-start justify-between gap-3">
        <div>
          <h1 style={{ color: theme.text }} className="text-xl font-bold leading-tight">
            Room Reservation
          </h1>
          <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
            All bookings across Conference Room, Meeting Room 1, and Meeting Room 2.
          </p>
          <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
            {filteredReservations.length} of {reservations.length} reservations
          </p>
        </div>
        <button
          onClick={() => setReserveModalVisible(true)}
          style={{ backgroundColor: theme.primary, color: theme.primaryText }}
          className="flex-shrink-0 px-4 py-2 rounded-lg text-[12.5px] font-semibold whitespace-nowrap"
        >
          Reserve a Room
        </button>
      </div>

      <div className="px-5 flex-shrink-0 mb-3">
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
            style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)" }}
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search room, requester, agenda…"
            style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
            className="w-full text-[12.5px] pl-9 pr-3 py-2 border rounded-lg focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2 mb-3 overflow-x-auto rrp-scroll">
          {ROOM_FILTER_TABS.map((tab) => {
            const active = roomFilter === tab.key;
            const cfg = tab.key !== "all" ? ROOM_CONFIG[tab.key] : null;
            return (
              <button
                key={tab.key}
                onClick={() => setRoomFilter(tab.key)}
                style={{
                  backgroundColor: active ? (cfg?.bg ?? theme.primary) : theme.surface,
                  color: active ? (cfg?.text ?? theme.primaryText) : theme.subtext,
                  borderColor: active ? (cfg?.dot ?? theme.primary) : theme.border,
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-semibold whitespace-nowrap flex-shrink-0"
              >
                {cfg && (
                  <span
                    style={{ backgroundColor: cfg.dot, width: 6, height: 6, borderRadius: "50%" }}
                    className="inline-block"
                  />
                )}
                {tab.label}
                <span
                  style={{
                    backgroundColor: active ? "rgba(0,0,0,0.08)" : theme.background,
                    color: active ? (cfg?.text ?? theme.primaryText) : theme.subtext,
                  }}
                  className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                >
                  {roomCounts[tab.key]}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ borderBottom: `1px solid ${theme.border}` }} className="flex items-end justify-between gap-3 -mb-px">
          <div className="flex items-end gap-0 overflow-x-auto rrp-scroll">
            {STATUS_FILTER_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setStatusFilter(tab.key)}
                  style={{
                    color: active ? theme.primary : theme.subtext,
                    borderBottom: active ? `2px solid ${theme.primary}` : "2px solid transparent",
                    backgroundColor: "transparent",
                  }}
                  className="px-3.5 py-2 text-[12.5px] font-medium whitespace-nowrap transition-colors focus:outline-none flex-shrink-0"
                >
                  {tab.label}
                  <span
                    style={{
                      backgroundColor: active ? theme.primary : theme.background,
                      color: active ? theme.primaryText : theme.subtext,
                    }}
                    className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                  >
                    {statusCounts[tab.key]}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mb-1.5">
            {viewMode === "calendar" && (
              <div className="hidden md:flex items-center gap-3 flex-shrink-0">
                {Object.entries(ROOM_CONFIG).map(([room, cfg]) => (
                  <div key={room} className="flex items-center gap-1.5">
                    <span style={{ backgroundColor: cfg.dot, width: 8, height: 8, borderRadius: "50%" }} />
                    <span style={{ color: theme.subtext }} className="text-[11px] font-medium whitespace-nowrap">
                      {cfg.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-lg border flex overflow-hidden flex-shrink-0">
              {(["table", "calendar"] as const).map((mode) => {
                const active = viewMode === mode;
                return (
                  <button
                    key={mode}
                    onClick={() => setViewMode(mode)}
                    style={{
                      backgroundColor: active ? theme.primary : "transparent",
                      color: active ? theme.primaryText : theme.subtext,
                    }}
                    className="text-[11.5px] font-semibold px-3 py-1.5 whitespace-nowrap capitalize"
                  >
                    {mode === "table" ? "Table" : "Calendar"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 pb-5 flex-1 min-h-0">
        {viewMode === "calendar" ? (
          <Calendar
            events={calendarEvents}
            onEventClick={(e) => setViewingReservation(e.data)}
            onDateClick={(date, events) => setDayView({ date, reservations: events.map((e) => e.data) })}
          />
        ) : (
          <div className="rrp-scroll h-full overflow-auto">
            <table
              className="min-w-full text-sm border rounded-lg"
              style={{ borderCollapse: "separate", borderSpacing: 0, borderColor: theme.border }}
            >
              <thead>
                <tr>
                  {["Room id", "Room", "Requested By", "Date", "Time", "Attendees", "AV/Wifi", "Status"].map((h) => (
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
                {filteredReservations.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ color: theme.subtext }} className="text-xs text-center px-4 py-6">
                      No reservations match this filter.
                    </td>
                  </tr>
                ) : (
                  filteredReservations.map((r, index) => {
                    const roomCfg = ROOM_CONFIG[r.roomName];
                    const statusCfg = STATUS_BADGE_CONFIG[getDisplayStatus(r)];
                    return (
                      <tr
                        key={r.id}
                        onClick={() => setViewingReservation(r)}
                        style={{
                          backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
                          borderBottom: `1px solid ${theme.border}`,
                          cursor: "pointer",
                        }}
                      >
                        <td style={{ color: theme.text }} className="px-4 py-2.5 text-[11.5px] font-mono whitespace-nowrap">
                          {r.roomRef ?? `#${r.bookingId?.slice(-4) ?? r.id}`}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span style={{ backgroundColor: roomCfg.dot, width: 7, height: 7, borderRadius: "50%" }} />
                            <span style={{ color: theme.text }} className="text-[12.5px] font-semibold">
                              {r.roomName}
                            </span>
                          </div>
                        </td>
                        <td style={{ color: theme.text }} className="px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                          {r.fullName}
                        </td>
                        <td style={{ color: theme.subtext }} className="px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                          {formatDate(r.bookingDate)}
                        </td>
                        <td style={{ color: theme.subtext }} className="px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                          {formatTime(r.startTime)} – {formatTime(r.endTime)}
                        </td>
                        <td style={{ color: theme.text }} className="px-4 py-2.5 text-[12.5px] whitespace-nowrap">
                          {r.maxAttendees ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <div className="flex flex-col gap-0.5">
                            {r.avRequirement && r.avRequirement !== "None" && (
                              <span style={{ color: theme.subtext }} className="text-[10.5px]">
                                {r.avRequirement}
                              </span>
                            )}
                            {r.needsWifi && (
                              <span style={{ color: theme.subtext }} className="text-[10.5px]">
                                Wifi needed
                              </span>
                            )}
                            {(!r.avRequirement || r.avRequirement === "None") && !r.needsWifi && (
                              <span style={{ color: theme.subtext }} className="text-[10.5px]">
                                —
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap">
                          <Badge config={statusCfg} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {dayView && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[420px] border max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <p style={{ color: theme.text }} className="text-base font-bold">
                  {dayView.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
                  {dayView.reservations.length} reservation{dayView.reservations.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setDayView(null)}
                style={{ backgroundColor: theme.surface, color: theme.subtext }}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto rrp-scroll">
              {dayView.reservations.map((r) => {
                const roomCfg = ROOM_CONFIG[r.roomName];
                return (
                  <button
                    key={r.id}
                    onClick={() => {
                      setViewingReservation(r);
                      setDayView(null);
                    }}
                    style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                    className="rounded-lg border p-3 text-left"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span style={{ backgroundColor: roomCfg.dot, width: 7, height: 7, borderRadius: "50%" }} />
                        <p style={{ color: theme.text }} className="text-[12.5px] font-semibold truncate">
                          {r.roomName}
                        </p>
                      </div>
                      <Badge config={STATUS_BADGE_CONFIG[getDisplayStatus(r)]} />
                    </div>
                    <p style={{ color: theme.subtext }} className="text-[11px] truncate">
                      {r.fullName}
                    </p>
                    <p style={{ color: theme.text }} className="text-[11px] mt-0.5 truncate">
                      {r.agenda || "No purpose specified"}
                    </p>
                    <p style={{ color: theme.subtext }} className="text-[11px] mt-1">
                      {formatTime(r.startTime)} – {formatTime(r.endTime)}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <RoomReservationModal
        visible={reserveModalVisible}
        onClose={() => setReserveModalVisible(false)}
        user={props.user!}
        onSuccess={() => {
          setReserveModalVisible(false);
          loadAll();
        }}
      />

      {viewingReservation && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[420px] border">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    style={{ backgroundColor: ROOM_CONFIG[viewingReservation.roomName].dot, width: 7, height: 7, borderRadius: 4 }}
                    className="flex-shrink-0"
                  />
                  <p style={{ color: theme.text }} className="text-[13.5px] font-bold leading-snug truncate">
                    {viewingReservation.roomName}
                  </p>
                </div>
                <p style={{ color: theme.subtext }} className="text-[11px] mt-1.5">
                  {viewingReservation.roomRef ?? viewingReservation.bookingId}
                </p>
              </div>
              <Badge config={STATUS_BADGE_CONFIG[getDisplayStatus(viewingReservation)]} />
            </div>

            <div className="flex flex-col gap-2.5 mb-4">
              {[
                ["Requested by", viewingReservation.fullName],
                ["Email", viewingReservation.email],
                ["Date", formatDate(viewingReservation.bookingDate)],
                ["Time", `${formatTime(viewingReservation.startTime)} – ${formatTime(viewingReservation.endTime)}`],
                ["Max attendees", String(viewingReservation.maxAttendees ?? "—")],
                ["AV requirement", viewingReservation.avRequirement || "None"],
                ["Wifi", viewingReservation.needsWifi ? "Needed" : "Not needed"],
                [
                  "Guests",
                  viewingReservation.guestEmails && viewingReservation.guestEmails.length > 0
                    ? viewingReservation.guestEmails.join(", ")
                    : "—",
                ],
                ["Booked", formatDateTimeShort(viewingReservation.createdAt)],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3">
                  <span style={{ color: theme.subtext }} className="text-[11px] flex-shrink-0">
                    {label}
                  </span>
                  <span style={{ color: theme.text }} className="text-[12.5px] font-semibold text-right break-words">
                    {value}
                  </span>
                </div>
              ))}
            </div>

            {viewingReservation.agenda && (
              <div style={{ borderColor: theme.border }} className="border-t pt-3 mb-4">
                <p style={{ color: theme.subtext }} className="text-[11px] mb-1">
                  Agenda
                </p>
                <p style={{ color: theme.text }} className="text-[12.5px]">
                  {viewingReservation.agenda}
                </p>
              </div>
            )}

            {viewingReservation.specialRequests && (
              <div style={{ borderColor: theme.border }} className="border-t pt-3 mb-4">
                <p style={{ color: theme.subtext }} className="text-[11px] mb-1">
                  Special requests
                </p>
                <p style={{ color: theme.text }} className="text-[12.5px]">
                  {viewingReservation.specialRequests}
                </p>
              </div>
            )}

            {actionError && (
              <p style={{ color: "#dc2626" }} className="text-[11px] mb-3">
                {actionError}
              </p>
            )}

            <div className="flex flex-col gap-2.5">
              {getDisplayStatus(viewingReservation) === "pending" && (
                <button
                  onClick={() => handleCancel(viewingReservation)}
                  disabled={busyId === viewingReservation.id}
                  style={{ backgroundColor: "#fee2e2", color: "#991b1b", opacity: busyId === viewingReservation.id ? 0.6 : 1 }}
                  className="w-full rounded-xl py-2.5 text-sm font-semibold"
                >
                  {busyId === viewingReservation.id ? "Cancelling…" : "Cancel Reservation"}
                </button>
              )}
              <button
                onClick={() => setViewingReservation(null)}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="w-full rounded-xl py-2.5 border text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}