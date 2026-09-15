// app/Admin/FleetOps/FleetControlTower/FleetControlTowerPage.web.tsx
//
// Fleet Ops — Admin Control Tower (web build).
// All state/logic lives in useFleetControlTowerData.ts — this file is JSX
// only, same split as SupplyRequestsPage.web.tsx / useSupplyRequestsData.ts.

import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../../../../theme/ThemeContext";
import FleetLiveMap from "../FleetLiveMap";
import Calendar from "../../../../components/common/Calendar";
import TripBookingModal from "../../employee/Modal/TripBookingModal";
import { VehicleType, VehicleStatus, DriverDutyStatus, FleetTrip } from "../../../../../types";
import {
  useFleetControlTowerData,
  FleetControlTowerProps,
  formatDateTime,
  isToday,
  getDelayInfo,
  getInitials,
  avatarColor,
  parseTramigoDeviceName,
  TRIP_STATUS_CONFIG,
  getVehicleDisplayStatus,
  DUTY_STATUS_CONFIG,
  FILTER_TABS,
  ACTIVE_STATUSES,
} from "./useFleetControlTowerData";


// Builds a minimal RFC 5545 .ics file for a trip and triggers a browser
// download. Opening the downloaded file lets the user's own Outlook/Google/
// Apple calendar add the event directly — no Graph API or extra login needed.
function downloadTripIcs(trip: {
  tripRef: string;
  pickupLabel: string;
  dropoffLabel: string;
  requestorName: string;
  purpose?: string | null;
  departureDatetime: string;
  returnDatetime?: string | null;
}) {
  const toIcsDate = (iso: string) => {
    const d = new Date(iso);
    return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  };

  const start = toIcsDate(trip.departureDatetime);
  const end = trip.returnDatetime
    ? toIcsDate(trip.returnDatetime)
    : toIcsDate(new Date(new Date(trip.departureDatetime).getTime() + 60 * 60 * 1000).toISOString());

  const descriptionLines = [
    `Requestor: ${trip.requestorName}`,
    trip.purpose ? `Purpose: ${trip.purpose}` : null,
  ].filter(Boolean);

  const escapeIcs = (s: string) => s.replace(/[\\,;]/g, (m) => "\\" + m).replace(/\n/g, "\\n");

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Silverdab UMS//Fleet Trips//EN",
    "BEGIN:VEVENT",
    `UID:${trip.tripRef}@silvergraph-ums`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcs(`Trip #${trip.tripRef.slice(-4)}: ${trip.pickupLabel} → ${trip.dropoffLabel}`)}`,
    `LOCATION:${escapeIcs(trip.pickupLabel)}`,
    `DESCRIPTION:${escapeIcs(descriptionLines.join("\n"))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${trip.tripRef}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ─── KPI card (stacked variant) ─────────────────────────────────────────────

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
        if (onClick) e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.primary}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="flex items-center justify-between">
        <span style={{ color: theme.subtext }} className="text-[11px] font-semibold uppercase tracking-wide">
          {label}
        </span>
        <span style={{ color: theme.subtext }}>{icon}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p style={{ color: valueColor ?? theme.text }} className="text-4xl font-bold leading-none">
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

const ON_TRIP_STATUSES_FOR_CARD = ["ongoing", "arrived", "returning"];

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
          style={{ backgroundColor: config.dot, width: 5, height: 5, borderRadius: "50%" }}
          className="inline-block flex-shrink-0"
        />
      )}
      {config.label}
    </span>
  );
}

// ─── Employee searchable select (Add Driver) ────────────────────────────────

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
        style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                className={"px-3 py-1.5 text-xs cursor-pointer " + (o.value === value ? "font-medium" : "")}
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

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FleetControlTowerPage(props: FleetControlTowerProps) {
  const { theme } = useTheme();
  const { onNavigate } = props;
  const data = useFleetControlTowerData(props);

  const {
    trips, vehicles, drivers, loading,
    statusFilter, setStatusFilter,
    assignDrafts, setDraft, rowError, setRowError, busyTripId, reassignOpen, setReassignOpen,
    rejectingTrip, setRejectingTrip, rejectReason, setRejectReason, handleReject,
    reschedulingTrip, setReschedulingTrip, rescheduleDate, setRescheduleDate,
    rescheduleTime, setRescheduleTime, rescheduleError, rescheduleSubmitting,
    openReschedule, handleReschedule, modifyDropoffs, removeModifyDropoff,
    cancellingTrip, setCancellingTrip, handleCancelTrip,
    focusVehicle, setFocusVehicle,
    viewingTrip, setViewingTrip, dayTripsView, setDayTripsView, calendarEvents,
    addVehicleOpen, setAddVehicleOpen, addVehicleForm, setAddVehicleForm,
    addVehicleError, addVehicleWarning, setAddVehicleWarning, addVehicleSubmitting, handleAddVehicle,
    addDriverOpen, setAddDriverOpen, addDriverForm, setAddDriverForm,
    addDriverError, addDriverWarning, setAddDriverWarning, addDriverSubmitting, handleAddDriver,
    employeeOptions, existingDriverNames, existingVehiclePlates,
    tramigoDevices, loadTramigoDevices, unlinkedTramigoDevices,
    editingVehicle, setEditingVehicle, editVehicleForm, setEditVehicleForm,
    editVehicleError, editVehicleSubmitting, confirmDeleteVehicle, setConfirmDeleteVehicle,
    openEditVehicle, handleUpdateVehicle, handleDeleteVehicle,
    editingDriver, setEditingDriver, editDriverForm, setEditDriverForm,
    editDriverError, editDriverSubmitting, confirmDeleteDriver, setConfirmDeleteDriver,
    openEditDriver, handleUpdateDriver, handleDeleteDriver,
    kpi, filteredTrips, availableVehicles, availableDrivers,
    getAvailableVehicles, getAvailableDrivers,
    onTripDriverUserIds, onTripVehicleIds, ongoingTripByVehicleId, currentTripByDriverId,
    sortedVehicles, sortedDrivers,
    handleApprove, handleReassign, handleMarkArrived, handleStartReturn, handleComplete,
  } = data;

  // Refs so the themed calendar/clock buttons can open the native picker
  // (same pattern as TicketHubPage's reschedule fields).
  const rescheduleDateRef = useRef<HTMLInputElement>(null);
  const rescheduleTimeRef = useRef<HTMLInputElement>(null);

  // "Modify Trip" now opens the same TripBookingModal used by employees
  // (in edit mode), instead of the old inline reschedule/dropoffs form.
  const [editTripTarget, setEditTripTarget] = useState<FleetTrip | null>(null);

  // Confirm-before-marking-arrived — same pattern as Cancel Trip, so a
  // stray tap doesn't immediately flip a live trip's status.
  const [confirmingArrivalTrip, setConfirmingArrivalTrip] = useState<FleetTrip | null>(null);

  if (loading) {
    return (
      <div style={{ backgroundColor: theme.background }} className="flex flex-1 items-center justify-center h-full">
        <div style={{ borderColor: theme.primary }} className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" />
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
    <div style={{ backgroundColor: theme.background }} className="flex flex-col h-full overflow-hidden">
      <style>{`
        .fct-scroll::-webkit-scrollbar { width: 6px; }
        .fct-scroll::-webkit-scrollbar-track { background: transparent; }
        .fct-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .fct-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
        div.absolute.inset-0[style*="rgba(0,0,0,0.6)"] {
          z-index: 1000;
        }
        .fct-date-input::-webkit-calendar-picker-indicator {
          opacity: 0;
          pointer-events: none;
        }
        .fct-date-input::-webkit-inner-spin-button {
          display: none;
        }
      `}</style>

      <div className="fct-scroll flex-1 overflow-y-auto overflow-x-hidden px-5 pb-5" style={{ paddingBottom: 40 }}>
        <div className="pt-5 pb-4 flex items-start justify-between gap-3">
          <div>
            <h1 style={{ color: theme.text }} className="text-xl font-bold leading-tight">
              Fleet Control Tower
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Overview for {today}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6">
          {/* ── Section 1: Map (col 1-2) · Vehicles (col 3) · Drivers (col 4) ── */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
            <div className="lg:col-span-2">
              <div className="mb-2">
                <h3 style={{ color: theme.text }} className="text-sm font-semibold mb-0.5">
                  Live Fleet Map
                </h3>
                <p style={{ color: theme.subtext }} className="text-[11px]">
                  Real-time vehicle positions.
                </p>
              </div>
              <div style={{ height: 450 }} className="w-full overflow-hidden rounded-xl">
                <FleetLiveMap focusVehicle={focusVehicle} vehicles={vehicles} theme={theme} />
              </div>
            </div>

            {/* Vehicles */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 style={{ color: theme.text }} className="text-sm font-semibold mb-0.5">
                    Vehicles
                  </h3>
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    Fleet roster with live monitoring.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setAddVehicleOpen(true);
                    setAddVehicleWarning("");
                    loadTramigoDevices();
                  }}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                            <p style={{ color: theme.text }} className="text-[13.5px] font-semibold">
                              {v.model || "—"}
                            </p>
                            <span
                              style={{ backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }}
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
                              style={{ color: theme.subtext, borderColor: theme.border }}
                              className="p-1 rounded-md border"
                              aria-label="Edit vehicle"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div style={{ color: theme.subtext }} className="text-[11.5px] flex justify-between mt-1.5 mb-2.5">
                          <span>Seating capacity</span>
                          <span style={{ color: theme.text }} className="font-semibold">
                            {v.seatingCapacity} seater
                          </span>
                        </div>
                        {onTripVehicleIds.has(v.id) && (
                          <div
                            style={{ backgroundColor: "rgba(61,111,224,0.16)", borderColor: "rgba(61,111,224,0.5)" }}
                            className="rounded-lg border p-2.5"
                          >
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D6FE0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                              </svg>
                              <span style={{ color: theme.text }} className="text-[12px] font-semibold">
                                {v.assignedDriverName ?? "Unassigned"}
                              </span>
                            </div>
                            {ongoingTripByVehicleId[v.id]?.dropoffLabel && (
                              <div className="flex items-start gap-1.5 mb-1.5">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D6FE0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                                  <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                  <circle cx="12" cy="10" r="3" />
                                </svg>
                                <span style={{ color: theme.subtext }} className="text-[11.5px] leading-snug">
                                  {ongoingTripByVehicleId[v.id].dropoffLabel}
                                </span>
                              </div>
                            )}
                            {ongoingTripByVehicleId[v.id]?.purpose && (
                              <div className="flex items-center gap-1.5">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D6FE0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                  <rect x="8" y="2" width="8" height="4" rx="1" />
                                  <path d="M9 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3" />
                                  <path d="M9 12h6M9 16h6" />
                                </svg>
                                <span style={{ color: theme.subtext }} className="text-[11.5px]">
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

            {/* Drivers */}
            <div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <h3 style={{ color: theme.text }} className="text-sm font-semibold mb-0.5">
                    Drivers
                  </h3>
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    Roster of registered drivers.
                  </p>
                </div>
                <button
                  onClick={() => setAddDriverOpen(true)}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                  {[...sortedDrivers]
                    .sort((a, b) => {
                      const aOnTrip = onTripDriverUserIds.has(a.userId);
                      const bOnTrip = onTripDriverUserIds.has(b.userId);
                      const aAvailable = a.dutyStatus === "active" && !aOnTrip;
                      const bAvailable = b.dutyStatus === "active" && !bOnTrip;
                      if (aAvailable !== bAvailable) return aAvailable ? -1 : 1;
                      return 0;
                    })
                    .map((d) => {
                    const onTrip = onTripDriverUserIds.has(d.userId);
                    const showPlate = onTrip && !!d.vehiclePlate;
                    const dutyCfg = DUTY_STATUS_CONFIG[d.dutyStatus] ?? DUTY_STATUS_CONFIG.off_duty;
                    const isAvailable = d.dutyStatus === "active" && !onTrip;
                    const onTripCfg = { label: "On Trip", bg: "#dbeafe", text: "#1d4ed8" };
                    return (
                      <div
                        key={d.id}
                        style={{ backgroundColor: theme.surface, borderColor: theme.border, opacity: isAvailable ? 1 : 0.55 }}
                        className="rounded-xl border p-3.5 transition-opacity"
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <p style={{ color: theme.text }} className="text-[13.5px] font-semibold">
                            {d.name}
                          </p>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <StatusBadge config={onTrip ? onTripCfg : dutyCfg} size="sm" />
                            <button
                              onClick={() => openEditDriver(d)}
                              style={{ color: theme.subtext, borderColor: theme.border }}
                              className="p-1 rounded-md border"
                              aria-label="Edit driver"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <div style={{ color: theme.subtext }} className="text-[11.5px] flex justify-between mb-2.5">
                          <span>Contact</span>
                          <span style={{ color: theme.text }} className="font-semibold">
                            {d.contactNumber ?? "—"}
                          </span>
                        </div>
                        {onTrip && (
                          <div
                            style={{ backgroundColor: "rgba(61,111,224,0.16)", borderColor: "rgba(61,111,224,0.5)" }}
                            className="rounded-lg border p-2.5"
                          >
                            {d.vehiclePlate && (
                              <div className="flex items-center gap-1.5 mb-1.5">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D6FE0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                                  <circle cx="7" cy="17" r="2" />
                                  <path d="M9 17h6" />
                                  <circle cx="17" cy="17" r="2" />
                                </svg>
                                <span style={{ color: theme.text }} className="text-[12px] font-semibold">
                                  {(() => {
                                    const v = vehicles.find((veh) => veh.plateNumber === d.vehiclePlate);
                                    return v?.model ? `${v.model} · ${d.vehiclePlate}` : d.vehiclePlate;
                                  })()}
                                </span>
                              </div>
                            )}
                            {(() => {
                              const currentTrip = trips.find(
                                (t) => t.driverId === d.userId && ON_TRIP_STATUSES_FOR_CARD.includes(t.status),
                              );
                              return currentTrip?.dropoffLabel ? (
                                <div className="flex items-start gap-1.5">
                                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3D6FE0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-0.5">
                                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                                    <circle cx="12" cy="10" r="3" />
                                  </svg>
                                  <span style={{ color: theme.subtext }} className="text-[11.5px] leading-snug">
                                    {currentTrip.dropoffLabel}
                                  </span>
                                </div>
                              ) : null;
                            })()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── Col 1: Calendar · Col 2: KPI row + Trip Requests panel ── */}
          <div className="flex flex-col lg:flex-row gap-5 min-w-0" style={{ minHeight: 600 }}>
            <div
              style={{ backgroundColor: theme.surface, borderColor: theme.border, height: 600 }}
              className="rounded-xl border p-4 w-full lg:w-1/2 flex-shrink-0"
            >
               <Calendar
                events={calendarEvents}
                onEventClick={(e) => setViewingTrip(e.data)}
                onDateClick={(date, events) => setDayTripsView({ date, trips: events.map((e) => e.data) })}
                initialView="month"
              />
            </div>

            <div className="flex flex-col gap-3 w-full lg:w-1/2 min-w-0" style={{ height: 600 }}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 flex-shrink-0">
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

              <div
                style={{ backgroundColor: theme.surface, borderColor: theme.border }}
                className="rounded-xl border flex flex-col flex-1 min-h-0 min-w-0"
              >
                <div className="px-4 pt-4 pb-3">
                  <h2 style={{ color: theme.text }} className="text-sm font-semibold">
                    Trip Requests
                  </h2>
                  <p style={{ color: theme.subtext }} className="text-[11px] mt-0.5">
                    Assign a vehicle &amp; driver to approve. Requests stay listed here through the full trip until completed.
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
                  <div className="fct-scroll flex flex-col gap-2 px-4 pb-4 overflow-y-auto flex-1 min-h-0 min-w-0">
                    {filteredTrips.map((trip) => {
                      const colors = avatarColor(trip.requestorName);
                      const isBusy = busyTripId === trip.id;
                      const isTripToday = isToday(trip.departureDatetime);
                      const delayInfo = getDelayInfo(trip);

                      const metaTextColor = isTripToday ? "#92400e" : theme.subtext;
                      const vehicleLabel = trip.vehiclePlate
                        ? (() => {
                            const v = vehicles.find((veh) => veh.id === trip.vehicleId);
                            return v?.model ? `${v.model} · ${trip.vehiclePlate}` : trip.vehiclePlate;
                          })()
                        : null;

                      return (
                        <div
                          key={trip.id}
                          style={{
                            borderColor: isTripToday ? "#f59e0b" : theme.border,
                            backgroundColor: isTripToday ? "#fffbeb" : theme.surfaceRaised ?? theme.background,
                          }}
                          className="rounded-lg border p-3"
                        >
                          {/* Top row — route + status badges + action */}
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span style={{ backgroundColor: "#22c55e", width: 6, height: 6, borderRadius: 3 }} className="flex-shrink-0" />
                                <p
                                  style={{ color: isTripToday ? "#78350f" : theme.text }}
                                  className="text-[12.5px] font-semibold leading-tight truncate"
                                  title={trip.pickupLabel}
                                >
                                  {trip.pickupLabel}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5 min-w-0 mt-1">
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
                                {trip.additionalDropoffs && trip.additionalDropoffs.length > 0 && (
                                  <span
                                    style={{ backgroundColor: theme.background, color: theme.subtext, borderColor: theme.border }}
                                    className="flex-shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border whitespace-nowrap"
                                    title={trip.additionalDropoffs.map((s) => s.locationText).join(", ")}
                                  >
                                    +{trip.additionalDropoffs.length}
                                  </span>
                                )}
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
                                <span style={{ backgroundColor: "#f59e0b", color: "#fff" }} className="text-[9.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
                                  Today
                                </span>
                              )}
                              <StatusBadge config={TRIP_STATUS_CONFIG[trip.status]} size="sm" />
                              <button
                                onClick={() => setViewingTrip(trip)}
                                style={
                                  ACTIVE_STATUSES.includes(trip.status)
                                    ? { backgroundColor: theme.primary, color: theme.primaryText }
                                    : { backgroundColor: theme.surface, borderColor: theme.border, color: theme.subtext }
                                }
                                className={
                                  ACTIVE_STATUSES.includes(trip.status)
                                    ? "text-[10.5px] font-bold px-3 py-1.5 rounded-lg whitespace-nowrap"
                                    : "text-[10px] font-semibold px-2 py-1 rounded-lg border whitespace-nowrap"
                                }
                              >
                                {ACTIVE_STATUSES.includes(trip.status) ? "Review" : "View"}
                              </button>
                            </div>
                          </div>

                          {/* Meta row — icon-labeled chips that wrap, instead of one
                              long dot-separated line that got hard to scan. */}
                          <div
                            style={{ borderColor: isTripToday ? "rgba(146,64,14,0.2)" : theme.border }}
                            className="flex flex-wrap gap-x-3.5 gap-y-1 border-t pt-2"
                          >
                            <span style={{ color: isTripToday ? "#78350f" : theme.text }} className="flex items-center gap-1 text-[11px] font-semibold">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                <circle cx="12" cy="8" r="4" />
                                <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
                              </svg>
                              {trip.requestorName}
                            </span>
                            <span style={{ color: metaTextColor }} className="flex items-center gap-1 text-[11px]">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M12 6v6l4 2" />
                              </svg>
                              {formatDateTime(trip.departureDatetime)}
                            </span>
                            <span style={{ color: metaTextColor }} className="flex items-center gap-1 text-[11px]">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                                <circle cx="9" cy="7" r="4" />
                                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                              </svg>
                              {trip.passengerCount} passenger{trip.passengerCount === 1 ? "" : "s"}
                            </span>
                            {vehicleLabel && (
                              <span style={{ color: metaTextColor }} className="flex items-center gap-1 text-[11px]">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                  <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2" />
                                  <circle cx="7" cy="17" r="2" />
                                  <path d="M9 17h6" />
                                  <circle cx="17" cy="17" r="2" />
                                </svg>
                                {vehicleLabel}
                              </span>
                            )}
                            {trip.driverName && (
                              <span style={{ color: metaTextColor }} className="flex items-center gap-1 text-[11px]">
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                                  <circle cx="12" cy="12" r="9" />
                                  <path d="M12 7v3M9 17l1.5-4M15 17l-1.5-4M9 9.5 5.5 8M15 9.5 18.5 8" />
                                </svg>
                                {trip.driverName}
                              </span>
                            )}
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
      </div>

      {/* Reject-reason modal */}
      {rejectingTrip && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[400px] border">
            <p style={{ color: theme.text }} className="text-base font-bold mb-1">
              Reject Trip Request
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mb-4">
              {rejectingTrip.pickupLabel} → {rejectingTrip.dropoffLabel} · {rejectingTrip.requestorName}
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional, shown to requestor)…"
              style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
              className="w-full text-sm px-3 py-2.5 border rounded-lg mb-4 min-h-[80px]"
            />
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  setRejectingTrip(null);
                  setRejectReason("");
                }}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={busyTripId === rejectingTrip.id}
                style={{ backgroundColor: "#ef4444", color: "#fff", opacity: busyTripId === rejectingTrip.id ? 0.6 : 1 }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {busyTripId === rejectingTrip.id ? "Rejecting…" : "Reject Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modify Trip — reuses the employee-facing TripBookingModal in edit
          mode, prefilled with the trip being modified. Replaces the old
          inline reschedule + dropoffs form. */}
      <TripBookingModal
        visible={!!editTripTarget}
        onClose={() => setEditTripTarget(null)}
        user={editTripTarget ? { username: editTripTarget.requestorName, displayName: editTripTarget.requestorName } as any : ({} as any)}
        editTrip={editTripTarget ?? undefined}
        onSuccess={() => {
          setEditTripTarget(null);
          // The hook's own trip list should refresh via its polling/reload;
          // if it doesn't, wire an explicit refetch call here.
        }}
      />

      {/* Cancel Trip confirmation modal */}
      {cancellingTrip && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100 }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-7 w-full max-w-[380px] border flex flex-col items-center text-center">
            <div style={{ backgroundColor: "#fee2e2" }} className="w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>

            <p style={{ color: theme.text }} className="text-base font-bold mb-1.5">
              Cancel this trip?
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mb-1">
              {cancellingTrip.pickupLabel} → {cancellingTrip.dropoffLabel}
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mb-6 max-w-[280px]">
              {cancellingTrip.vehiclePlate || cancellingTrip.driverName
                ? "The assigned vehicle and driver will be released, and the requestor will be notified."
                : "The requestor will be notified that this trip has been cancelled."}
            </p>

            <div className="flex gap-2.5 w-full">
              <button
                onClick={() => setCancellingTrip(null)}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Keep Trip
              </button>
              <button
                onClick={handleCancelTrip}
                disabled={busyTripId === cancellingTrip.id}
                style={{ backgroundColor: "#ef4444", color: "#fff", opacity: busyTripId === cancellingTrip.id ? 0.6 : 1 }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {busyTripId === cancellingTrip.id ? "Cancelling…" : "Cancel Trip"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Arrived confirmation modal */}
      {confirmingArrivalTrip && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1100 }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-7 w-full max-w-[380px] border flex flex-col items-center text-center">
            <div style={{ backgroundColor: "#dbeafe" }} className="w-12 h-12 rounded-full flex items-center justify-center mb-4">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </div>

            <p style={{ color: theme.text }} className="text-base font-bold mb-1.5">
              Mark this trip as arrived?
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mb-6 max-w-[280px]">
              {confirmingArrivalTrip.pickupLabel} → {confirmingArrivalTrip.dropoffLabel} · {confirmingArrivalTrip.driverName ?? "Unassigned"}
            </p>

            <div className="flex gap-2.5 w-full">
              <button
                onClick={() => setConfirmingArrivalTrip(null)}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await handleMarkArrived(confirmingArrivalTrip);
                  setConfirmingArrivalTrip(null);
                }}
                disabled={busyTripId === confirmingArrivalTrip.id}
                style={{ backgroundColor: "#1d4ed8", color: "#fff", opacity: busyTripId === confirmingArrivalTrip.id ? 0.6 : 1 }}
                className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
              >
                {busyTripId === confirmingArrivalTrip.id ? "Updating…" : "Mark as Arrived"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day trips list modal */}
      {dayTripsView && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)", zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[420px] border max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between mb-4 flex-shrink-0">
              <div>
                <p style={{ color: theme.text }} className="text-base font-bold">
                  {dayTripsView.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                </p>
                <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
                  {dayTripsView.trips.length} trip{dayTripsView.trips.length !== 1 ? "s" : ""}
                </p>
              </div>
              <button
                onClick={() => setDayTripsView(null)}
                style={{ backgroundColor: theme.surface, color: theme.subtext }}
                className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="flex flex-col gap-2 overflow-y-auto fct-scroll">
              {dayTripsView.trips.map((trip) => (
                <button
                  key={trip.id}
                  onClick={() => {
                    setViewingTrip(trip);
                    setDayTripsView(null);
                  }}
                  style={{ backgroundColor: theme.surfaceRaised ?? theme.surface, borderColor: theme.border }}
                  className="rounded-lg border p-3 text-left"
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p style={{ color: theme.text }} className="text-[12.5px] font-semibold truncate">
                      {trip.dropoffLabel}
                    </p>
                    <StatusBadge config={TRIP_STATUS_CONFIG[trip.status]} size="sm" />
                  </div>
                  <p style={{ color: theme.subtext }} className="text-[11px] truncate">
                    from {trip.pickupLabel}
                  </p>
                  <p style={{ color: theme.subtext }} className="text-[11px] mt-1">
                    {trip.requestorName} · {formatDateTime(trip.departureDatetime)}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* View Trip Details modal */}
      {viewingTrip && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[420px] border">
            <div className="flex items-start justify-between gap-2 mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span style={{ backgroundColor: "#22c55e", width: 7, height: 7, borderRadius: 4, flexShrink: 0 }} />
                  <p style={{ color: theme.text }} className="text-[13.5px] font-bold leading-snug truncate" title={viewingTrip.pickupLabel}>
                    {viewingTrip.pickupLabel}
                  </p>
                </div>
                <div className="flex items-center gap-2 min-w-0 mt-1">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                  <p style={{ color: theme.text }} className="text-[13.5px] font-bold leading-snug truncate" title={viewingTrip.dropoffLabel}>
                    {viewingTrip.dropoffLabel}
                  </p>
                </div>
                {viewingTrip.additionalDropoffs && viewingTrip.additionalDropoffs.length > 0 && (
                  <div className="flex flex-col gap-1 mt-1 ml-[18px] min-w-0">
                    {viewingTrip.additionalDropoffs.map((stop, idx) => (
                      <div key={stop.locationId ?? idx} className="flex items-center gap-2 min-w-0">
                        <span
                          style={{ backgroundColor: theme.background, color: theme.subtext, borderColor: theme.border }}
                          className="flex-shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[9px] font-bold"
                        >
                          {idx + 2}
                        </span>
                        <span
                          style={{ color: theme.subtext }}
                          className="text-[12px] font-medium leading-snug truncate min-w-0"
                          title={stop.locationText}
                        >
                          {stop.locationText}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <p style={{ color: theme.subtext }} className="text-[11px] mt-1.5">
                  {viewingTrip.tripRef}
                </p>
              </div>
              <StatusBadge config={TRIP_STATUS_CONFIG[viewingTrip.status]} size="sm" />
            </div>



            <div className="flex flex-col gap-2.5 mb-4">
              {[
                ["Requestor", viewingTrip.requestorName],
                ["Departure", formatDateTime(viewingTrip.departureDatetime)],
                ["Passengers", String(viewingTrip.passengerCount)],
                ["Purpose", viewingTrip.purpose || "—"],
                ...(viewingTrip.status === "pending"
                  ? []
                  : [
                      ["Vehicle", viewingTrip.vehiclePlate ?? "Not assigned"],
                      ["Driver", viewingTrip.driverName ?? "Not assigned"],
                      ["Approved by", viewingTrip.approvedByName ?? "—"],
                      ["Approved at", viewingTrip.approvedAt ? formatDateTime(viewingTrip.approvedAt) : "—"],
                    ]),
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-3">
                  <span style={{ color: theme.subtext }} className="text-[11px]">
                    {label}
                  </span>
                  <span style={{ color: theme.text }} className="text-[12.5px] font-semibold text-right">
                    {value}
                  </span>
                </div>
              ))}
              {viewingTrip.status === "rejected" && viewingTrip.rejectedReason && (
                <div>
                  <span style={{ color: theme.subtext }} className="text-[11px] block mb-1">
                    Rejection reason
                  </span>
                  <p style={{ color: theme.text }} className="text-[12.5px]">
                    {viewingTrip.rejectedReason}
                  </p>
                </div>
              )}
            </div>

            {viewingTrip.status !== "pending" && (
              <div style={{ borderColor: theme.border }} className="border-t pt-3 mb-4">
                <p style={{ color: theme.text }} className="text-[12.5px] font-semibold mb-2">
                  Status history
                </p>
                {!viewingTrip.statusHistory || viewingTrip.statusHistory.length === 0 ? (
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    No history recorded for this trip yet.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {[...viewingTrip.statusHistory]
                      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                      .map((entry, idx) => {
                        const cfg = TRIP_STATUS_CONFIG[entry.status];
                        return (
                          <div key={`${entry.status}-${entry.timestamp}-${idx}`} className="flex flex-col gap-0.5">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  style={{ backgroundColor: cfg?.dot ?? theme.subtext, width: 6, height: 6, borderRadius: "50%" }}
                                  className="inline-block flex-shrink-0"
                                />
                                <span style={{ color: theme.text }} className="text-[12px] font-medium truncate">
                                  {entry.note ? entry.note : (cfg?.label ?? entry.status)}
                                </span>
                              </div>
                              <span style={{ color: theme.subtext }} className="text-[11px] whitespace-nowrap flex-shrink-0">
                                {formatDateTime(entry.timestamp)}
                              </span>
                            </div>
                            {entry.note && (
                              <p style={{ color: theme.subtext }} className="text-[10.5px] ml-[13.5px]">
                                Status: {cfg?.label ?? entry.status}
                              </p>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {viewingTrip.status === "pending" && (
              <div style={{ borderColor: theme.border }} className="border-t pt-4 mb-4">
                <p style={{ color: theme.text }} className="text-[12.5px] font-semibold mb-2">
                  Assign vehicle &amp; driver
                </p>
                <div className="flex flex-col gap-2">
                  <select
                    value={assignDrafts[viewingTrip.id]?.vehicleId ?? ""}
                    onChange={(e) => setDraft(viewingTrip.id, { vehicleId: e.target.value })}
                    style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                    className="w-full text-sm px-3 py-2 border rounded-lg"
                  >
                    <option value="">Assign vehicle…</option>
                    {getAvailableVehicles(viewingTrip).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.plateNumber} — {v.model}
                      </option>
                    ))}
                  </select>
                  <select
                    value={assignDrafts[viewingTrip.id]?.driverId ?? ""}
                    onChange={(e) => setDraft(viewingTrip.id, { driverId: e.target.value })}
                    style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                    className="w-full text-sm px-3 py-2 border rounded-lg"
                  >
                    <option value="">Assign driver…</option>
                    {getAvailableDrivers(viewingTrip).map((d) => (
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

            {(viewingTrip.status === "approved" || viewingTrip.status === "arrived") && (
              <div style={{ borderColor: theme.border }} className="border-t pt-4 mb-4">
                <div className="flex gap-2.5">
                  <button
                    onClick={() => {
                      setEditTripTarget(viewingTrip);
                      setViewingTrip(null);
                    }}
                    style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                    className="flex-1 text-sm font-semibold px-3 py-2 rounded-lg border"
                  >
                    Modify Trip
                  </button>
                </div>
                <button
                  onClick={() => {
                    setCancellingTrip(viewingTrip);
                    setViewingTrip(null);
                  }}
                  style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
                  className="w-full mt-2.5 text-sm font-semibold px-3 py-2 rounded-lg"
                >
                  Cancel Trip
                </button>
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
                        style={{ backgroundColor: "#fee2e2", color: "#991b1b", opacity: isBusy ? 0.6 : 1 }}
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
                        style={{ backgroundColor: theme.primary, color: theme.primaryText, opacity: isBusy ? 0.6 : 1 }}
                        className="flex-1 rounded-xl py-2.5 text-sm font-semibold"
                      >
                        {isBusy ? "Approving…" : "Approve"}
                      </button>
                    </div>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                      onClick={() => setViewingTrip(null)}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                      onClick={() => {
                        setConfirmingArrivalTrip(viewingTrip);
                        setViewingTrip(null);
                      }}
                      disabled={isBusy}
                      style={{ backgroundColor: "#dbeafe", color: "#1d4ed8", opacity: isBusy ? 0.6 : 1 }}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                    >
                      Mark as Arrived
                    </button>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                        style={{ backgroundColor: "#fef3c7", color: "#92400e", opacity: isBusy ? 0.6 : 1 }}
                        className="w-full rounded-xl py-2.5 text-sm font-semibold"
                      >
                        {isBusy ? "Updating…" : "Start Return"}
                      </button>
                    )}
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                      style={{ backgroundColor: "#dcfce7", color: "#166534", opacity: isBusy ? 0.6 : 1 }}
                      className="w-full rounded-xl py-2.5 text-sm font-semibold"
                    >
                      {isBusy ? "Updating…" : "Mark Completed"}
                    </button>
                    <button
                      onClick={() => setViewingTrip(null)}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[400px] border">
            <p style={{ color: theme.text }} className="text-base font-bold mb-4">
              Add Vehicle
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
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
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                  <p style={{ color: "#d97706" }} className="text-[11px] mt-1.5 flex items-center gap-1">
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
                <div style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-lg border px-3 py-2.5">
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
                    <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                      Plate number
                    </label>
                    <input
                      value={addVehicleForm.plateNumber}
                      onChange={(e) => setAddVehicleForm((f) => ({ ...f, plateNumber: e.target.value }))}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                      placeholder="e.g. NGP 4521"
                    />
                  </div>
                  <div>
                    <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                      Model
                    </label>
                    <input
                      value={addVehicleForm.model}
                      onChange={(e) => setAddVehicleForm((f) => ({ ...f, model: e.target.value }))}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                      placeholder="e.g. Toyota HiAce"
                    />
                  </div>
                </>
              )}

              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Type
                </label>
                <select
                  value={addVehicleForm.type}
                  onChange={(e) => setAddVehicleForm((f) => ({ ...f, type: e.target.value as VehicleType }))}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                >
                  <option value="sedan">Sedan</option>
                  <option value="van">Van</option>
                  <option value="suv">SUV</option>
                  <option value="truck">Truck</option>
                </select>
              </div>
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Seating capacity
                </label>
                <input
                  type="number"
                  min={1}
                  value={addVehicleForm.seatingCapacity}
                  onChange={(e) => setAddVehicleForm((f) => ({ ...f, seatingCapacity: e.target.value }))}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                  setAddVehicleWarning("");
                }}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddVehicle}
                disabled={addVehicleSubmitting}
                style={{ backgroundColor: theme.primary, color: theme.primaryText, opacity: addVehicleSubmitting ? 0.6 : 1 }}
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
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[400px] border">
            <p style={{ color: theme.text }} className="text-base font-bold mb-1">
              Add Driver
            </p>
            <p style={{ color: theme.subtext }} className="text-[11px] mb-4">
              Links an existing AD user as a driver.
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Employee
                </label>
                <EmployeeSearchableSelect
                  value={addDriverForm.username}
                  displayName={addDriverForm.displayName}
                  options={employeeOptions}
                  theme={theme}
                  onTextChange={(text) => {
                    setAddDriverForm((f) => ({ ...f, username: "", displayName: text }));
                    setAddDriverWarning("");
                  }}
                  onChange={(value, label) => {
                    setAddDriverForm((f) => ({ ...f, username: value, displayName: label }));
                    setAddDriverWarning(
                      existingDriverNames.has(label.trim().toLowerCase())
                        ? `${label} is already registered as a driver.`
                        : "",
                    );
                  }}
                />
                {addDriverWarning && (
                  <p style={{ color: "#d97706" }} className="text-[11px] mt-1.5 flex items-center gap-1">
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
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Contact number
                </label>
                <input
                  value={addDriverForm.contactNumber}
                  onChange={(e) => setAddDriverForm((f) => ({ ...f, contactNumber: e.target.value }))}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                  setAddDriverWarning("");
                }}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleAddDriver}
                disabled={addDriverSubmitting}
                style={{ backgroundColor: theme.primary, color: theme.primaryText, opacity: addDriverSubmitting ? 0.6 : 1 }}
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
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[400px] border">
            <p style={{ color: theme.text }} className="text-base font-bold mb-4">
              Edit Vehicle
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Tramigo device (GPS tracker)
                </label>
                <select
                  value={editVehicleForm.tramigoDeviceId}
                  onChange={(e) => {
                    const deviceId = e.target.value;
                    const device = tramigoDevices.find((d) => d.id === deviceId);
                    if (device) {
                      const { model, plate } = parseTramigoDeviceName(device.name);
                      setEditVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId, model: model || f.model, plateNumber: plate || f.plateNumber }));
                    } else {
                      setEditVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId }));
                    }
                  }}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                <div style={{ backgroundColor: theme.surface, borderColor: theme.border }} className="rounded-lg border px-3 py-2.5">
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
                    <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                      Plate number
                    </label>
                    <input
                      value={editVehicleForm.plateNumber}
                      onChange={(e) => setEditVehicleForm((f) => ({ ...f, plateNumber: e.target.value }))}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                    />
                  </div>
                  <div>
                    <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                      Model
                    </label>
                    <input
                      value={editVehicleForm.model}
                      onChange={(e) => setEditVehicleForm((f) => ({ ...f, model: e.target.value }))}
                      style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                      className="w-full text-sm px-3 py-2 border rounded-lg"
                    />
                  </div>
                </>
              )}

              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Type
                </label>
                <select
                  value={editVehicleForm.type}
                  onChange={(e) => setEditVehicleForm((f) => ({ ...f, type: e.target.value as VehicleType }))}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                >
                  <option value="sedan">Sedan</option>
                  <option value="van">Van</option>
                  <option value="suv">SUV</option>
                  <option value="truck">Truck</option>
                </select>
              </div>
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Seating capacity
                </label>
                <input
                  type="number"
                  min={1}
                  value={editVehicleForm.seatingCapacity}
                  onChange={(e) => setEditVehicleForm((f) => ({ ...f, seatingCapacity: e.target.value }))}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Status
                </label>
                {editingVehicle && onTripVehicleIds.has(editingVehicle.id) ? (
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    Status is locked while this vehicle is out on a trip.
                  </p>
                ) : (
                  <select
                    value={editVehicleForm.status}
                    onChange={(e) => setEditVehicleForm((f) => ({ ...f, status: e.target.value as VehicleStatus }))}
                    style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
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
                  setConfirmDeleteVehicle(false);
                }}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateVehicle}
                disabled={editVehicleSubmitting}
                style={{ backgroundColor: theme.primary, color: theme.primaryText, opacity: editVehicleSubmitting ? 0.6 : 1 }}
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
              {editVehicleSubmitting ? "Deleting…" : confirmDeleteVehicle ? "Click again to confirm delete" : "Delete Vehicle"}
            </button>
          </div>
        </div>
      )}

      {/* Edit Driver modal */}
      {editingDriver && (
        <div className="absolute inset-0 items-center justify-center p-6 flex" style={{ backgroundColor: "rgba(0,0,0,0.6)" }}>
          <div style={{ backgroundColor: theme.background, borderColor: theme.border }} className="rounded-2xl p-6 w-full max-w-[400px] border">
            <p style={{ color: theme.text }} className="text-base font-bold mb-1">
              Edit Driver
            </p>
            <p style={{ color: theme.subtext }} className="text-[11px] mb-4">
              {editingDriver.name}
            </p>
            <div className="flex flex-col gap-3 mb-4">
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Contact number
                </label>
                <input
                  value={editDriverForm.contactNumber}
                  onChange={(e) => setEditDriverForm((f) => ({ ...f, contactNumber: e.target.value }))}
                  style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                  className="w-full text-sm px-3 py-2 border rounded-lg"
                />
              </div>
              <div>
                <label style={{ color: theme.subtext }} className="text-[11px] font-semibold block mb-1">
                  Duty status
                </label>
                {editingDriver && onTripDriverUserIds.has(editingDriver.userId) ? (
                  <p style={{ color: theme.subtext }} className="text-[11px]">
                    Status is locked while this driver is out on a trip.
                  </p>
                ) : (
                  <select
                    value={editDriverForm.dutyStatus}
                    onChange={(e) =>
                      setEditDriverForm((f) => ({
                        ...f,
                        dutyStatus: e.target.value as DriverDutyStatus,
                      }))
                    }
                    style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                    className="w-full text-sm px-3 py-2 border rounded-lg"
                  >
                    {Object.entries(DUTY_STATUS_CONFIG).map(([key, cfg]) => (
                      <option key={key} value={key}>
                        {cfg.label}
                      </option>
                    ))}
                  </select>
                )}
                <p style={{ color: theme.subtext }} className="text-[10.5px] mt-1">
                  Use this if the driver forgot to update their own status.
                </p>
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
                  setConfirmDeleteDriver(false);
                }}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }}
                className="flex-1 rounded-xl py-2.5 border text-sm font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateDriver}
                disabled={editDriverSubmitting}
                style={{ backgroundColor: theme.primary, color: theme.primaryText, opacity: editDriverSubmitting ? 0.6 : 1 }}
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
              {editDriverSubmitting ? "Deleting…" : confirmDeleteDriver ? "Click again to confirm delete" : "Delete Driver"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
