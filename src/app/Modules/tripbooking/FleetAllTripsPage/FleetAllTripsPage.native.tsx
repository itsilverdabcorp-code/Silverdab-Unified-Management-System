// app/Modules/tripbooking/FleetAllTrips/FleetAllTripsPage.native.tsx
//
// Fleet Ops — All Trips (native build).
// Same data/logic as the web build (useFleetAllTripsData.ts) — this file
// is native JSX only, same split as FleetControlTowerPage.native.tsx.
//
// Calendar view uses components/common/Calendar.native.tsx (month view
// only — see that file's header for why). List/Calendar toggle mirrors
// the web build's Table/Calendar toggle.

import React from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, Modal } from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import Calendar from "../../../../components/common/Calendar.native";
import {
  useFleetAllTripsData,
  FleetAllTripsProps,
  formatDateTime,
  TRIP_STATUS_CONFIG,
  FILTER_TABS,
} from "./useFleetAllTripsData";

function Badge({ label, colors, dot }: { label: string; colors: { bg: string; text: string; dot?: string }; dot?: boolean }) {
  return (
    <View
      style={{
        backgroundColor: colors.bg,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      {dot && colors.dot && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.dot }} />}
      <Text style={{ color: colors.text, fontSize: 10, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function PickerField({
  label,
  placeholder,
  value,
  options,
  theme,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  options: { id: string; label: string }[];
  theme: any;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>{label}</Text>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        style={{
          borderWidth: 1,
          borderColor: theme.inputBorder ?? theme.border,
          backgroundColor: theme.inputBg ?? theme.surface,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <Text style={{ color: current ? (theme.inputText ?? theme.text) : theme.subtext, fontSize: 13 }}>
          {current ? current.label : placeholder}
        </Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <TouchableOpacity activeOpacity={1} onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "60%" }}>
            <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{label}</Text>
            </View>
            <ScrollView>
              {options.length === 0 ? (
                <Text style={{ color: theme.subtext, fontSize: 12, padding: 16 }}>No options available.</Text>
              ) : (
                options.map((o) => (
                  <TouchableOpacity
                    key={o.id}
                    onPress={() => {
                      onChange(o.id);
                      setOpen(false);
                    }}
                    style={{ paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
                  >
                    <Text style={{ color: o.id === value ? theme.primary : theme.text, fontSize: 13, fontWeight: o.id === value ? "700" : "400" }}>
                      {o.label}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function ModalShell({
  visible,
  onClose,
  title,
  subtitle,
  theme,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  theme: any;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1 }} />
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: "90%" }}>
          <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>{title}</Text>
            {subtitle ? <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>{subtitle}</Text> : null}
          </View>
          <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function FleetAllTripsPage(props: FleetAllTripsProps) {
  const { theme } = useTheme();
  const data = useFleetAllTripsData(props);

  const {
    trips,
    search, setSearch,
    statusFilter, setStatusFilter,
    viewingTrip, setViewingTrip,
    rejectingTrip, setRejectingTrip,
    dayTripsView, setDayTripsView,
    viewMode, setViewMode,
    rejectReason, setRejectReason,
    assignDrafts, setDraft, rowError, busyTripId,
    tabCounts, filteredTrips, calendarEvents,
    getAvailableVehicles, getAvailableDrivers,
    handleApprove, handleReject,
    handleMarkArrived, handleStartReturn, handleComplete,
    loading,
  } = data;

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>All Trips</Text>
        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>Full trip log — search and filter across every booking.</Text>
        <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 12 }}>
          {filteredTrips.length} of {trips.length} trips
        </Text>

        <TextInput
          placeholder="Search route, employee, vehicle, driver…"
          placeholderTextColor={theme.subtext}
          value={search}
          onChangeText={setSearch}
          style={{
            backgroundColor: theme.inputBg ?? theme.surface,
            borderColor: theme.inputBorder ?? theme.border,
            borderWidth: 1,
            color: theme.inputText ?? theme.text,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 13,
            marginBottom: 10,
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {FILTER_TABS.map((tab) => {
              const active = statusFilter === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setStatusFilter(tab.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "700", color: active ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                    {tab.label} ({tabCounts[tab.key]})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* List / Calendar toggle — mirrors the web build's Table/Calendar toggle */}
        <View
          style={{
            flexDirection: "row",
            alignSelf: "flex-start",
            backgroundColor: theme.surface,
            borderColor: theme.border,
            borderWidth: 1,
            borderRadius: 8,
            overflow: "hidden",
            marginBottom: 12,
          }}
        >
          {(["list", "calendar"] as const).map((mode) => {
            const active = (mode === "list" ? "table" : "calendar") === viewMode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => setViewMode(mode === "list" ? "table" : "calendar")}
                style={{
                  backgroundColor: active ? theme.primary : "transparent",
                  paddingHorizontal: 14,
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontSize: 11.5, fontWeight: "700", color: active ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                  {mode === "list" ? "List" : "Calendar"}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {viewMode === "calendar" ? (
        <View style={{ flex: 1, paddingHorizontal: 16, paddingBottom: 16 }}>
          <Calendar
            events={calendarEvents}
            onEventClick={(e) => setViewingTrip(e.data)}
            onDateClick={(date, events) => setDayTripsView({ date, trips: events.map((e) => e.data) })}
          />
        </View>
      ) : (
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
        {filteredTrips.length === 0 ? (
          <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>No trips match this filter.</Text>
        ) : (
          filteredTrips.map((trip) => {
            const cfg = TRIP_STATUS_CONFIG[trip.status];
            return (
              <TouchableOpacity
                key={trip.id}
                onPress={() => setViewingTrip(trip)}
                style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 }}
              >
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                  <Text style={{ color: theme.text, fontSize: 11.5, fontFamily: "monospace" }}>#{trip.tripRef.slice(-4)}</Text>
                  <Badge label={cfg.label} colors={cfg} dot />
                </View>
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700" }} numberOfLines={1}>
                  {trip.pickupLabel} → {trip.dropoffLabel}
                </Text>
                <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 4 }} numberOfLines={1}>
                  {trip.requestorName}
                  {trip.vehiclePlate ? ` · ${trip.vehiclePlate}` : ""}
                  {trip.driverName ? ` – ${trip.driverName}` : ""}
                </Text>
                <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                  Booked {formatDateTime(trip.createdAt)} · Departs {formatDateTime(trip.departureDatetime)}
                </Text>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
      )}

      {/* Reject-reason modal */}
      <ModalShell
        visible={!!rejectingTrip}
        onClose={() => {
          setRejectingTrip(null);
          setRejectReason("");
        }}
        title="Reject Trip Request"
        subtitle={rejectingTrip ? `${rejectingTrip.pickupLabel} → ${rejectingTrip.dropoffLabel} · ${rejectingTrip.requestorName}` : undefined}
        theme={theme}
      >
        <TextInput
          value={rejectReason}
          onChangeText={setRejectReason}
          placeholder="Reason for rejection (optional, shown to requestor)…"
          placeholderTextColor={theme.subtext}
          multiline
          style={{
            borderWidth: 1,
            borderColor: theme.inputBorder ?? theme.border,
            backgroundColor: theme.inputBg ?? theme.surface,
            color: theme.inputText ?? theme.text,
            borderRadius: 8,
            padding: 10,
            minHeight: 80,
            fontSize: 13,
            textAlignVertical: "top",
            marginBottom: 14,
          }}
        />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={() => {
              setRejectingTrip(null);
              setRejectReason("");
            }}
            style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleReject}
            disabled={!!rejectingTrip && busyTripId === rejectingTrip.id}
            style={{ flex: 1, backgroundColor: "#ef4444", borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
              {rejectingTrip && busyTripId === rejectingTrip.id ? "Rejecting…" : "Reject Trip"}
            </Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* Day trips list modal — shown when a calendar date is tapped */}
      <ModalShell
        visible={!!dayTripsView}
        onClose={() => setDayTripsView(null)}
        title={dayTripsView ? dayTripsView.date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }) : ""}
        subtitle={dayTripsView ? `${dayTripsView.trips.length} trip${dayTripsView.trips.length !== 1 ? "s" : ""}` : undefined}
        theme={theme}
      >
        {dayTripsView?.trips.map((trip) => {
          const cfg = TRIP_STATUS_CONFIG[trip.status];
          return (
            <TouchableOpacity
              key={trip.id}
              onPress={() => {
                setViewingTrip(trip);
                setDayTripsView(null);
              }}
              style={{ backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                  {trip.dropoffLabel}
                </Text>
                <Badge label={cfg.label} colors={cfg} dot />
              </View>
              <Text style={{ color: theme.subtext, fontSize: 11 }} numberOfLines={1}>
                from {trip.pickupLabel}
              </Text>
              <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                {trip.requestorName} · {formatDateTime(trip.departureDatetime)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ModalShell>

      {/* View Trip Details modal */}
      <ModalShell
        visible={!!viewingTrip}
        onClose={() => setViewingTrip(null)}
        title={viewingTrip ? `${viewingTrip.pickupLabel} → ${viewingTrip.dropoffLabel}` : ""}
        subtitle={viewingTrip?.tripRef}
        theme={theme}
      >
        {viewingTrip && (
          <>
            <View style={{ marginBottom: 12 }}>
              <Badge label={TRIP_STATUS_CONFIG[viewingTrip.status].label} colors={TRIP_STATUS_CONFIG[viewingTrip.status]} dot />
            </View>

            {[
              ["Requestor", viewingTrip.requestorName],
              ["Date Booked", formatDateTime(viewingTrip.createdAt)],
              ["Departure", formatDateTime(viewingTrip.departureDatetime)],
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
                    ["Approved at", viewingTrip.approvedAt ? formatDateTime(viewingTrip.approvedAt) : "—"],
                  ]),
            ].map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 8 }}>
                <Text style={{ color: theme.subtext, fontSize: 11 }}>{label}</Text>
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700" }}>{value}</Text>
              </View>
            ))}

            {viewingTrip.status === "rejected" && viewingTrip.rejectedReason && (
              <View style={{ marginTop: 6, marginBottom: 12 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 4 }}>Rejection reason</Text>
                <Text style={{ color: theme.text, fontSize: 12.5 }}>{viewingTrip.rejectedReason}</Text>
              </View>
            )}

            {viewingTrip.status === "pending" && (
              <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14, marginTop: 6, marginBottom: 6 }}>
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700", marginBottom: 6 }}>Assign vehicle &amp; driver</Text>
                <PickerField
                  label="Vehicle"
                  placeholder="Assign vehicle…"
                  value={assignDrafts[viewingTrip.id]?.vehicleId ?? ""}
                  options={getAvailableVehicles(viewingTrip).map((v) => ({ id: v.id, label: `${v.plateNumber} — ${v.model}` }))}
                  theme={theme}
                  onChange={(id) => setDraft(viewingTrip.id, { vehicleId: id })}
                />
                <PickerField
                  label="Driver"
                  placeholder="Assign driver…"
                  value={assignDrafts[viewingTrip.id]?.driverId ?? ""}
                  options={getAvailableDrivers(viewingTrip).map((d) => ({ id: d.id, label: d.name }))}
                  theme={theme}
                  onChange={(id) => setDraft(viewingTrip.id, { driverId: id })}
                />
                {rowError[viewingTrip.id] ? <Text style={{ color: "#dc2626", fontSize: 11, marginBottom: 6 }}>{rowError[viewingTrip.id]}</Text> : null}
              </View>
            )}

            {(() => {
              const trip = viewingTrip;
              const isBusy = busyTripId === trip.id;

              if (trip.status === "pending") {
                return (
                  <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                    <TouchableOpacity
                      onPress={() => {
                        setRejectingTrip(trip);
                        setViewingTrip(null);
                      }}
                      disabled={isBusy}
                      style={{ flex: 1, backgroundColor: "#fee2e2", borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: isBusy ? 0.6 : 1 }}
                    >
                      <Text style={{ color: "#991b1b", fontSize: 13, fontWeight: "700" }}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        const ok = await handleApprove(trip);
                        if (ok) setViewingTrip(null);
                      }}
                      disabled={isBusy}
                      style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: isBusy ? 0.6 : 1 }}
                    >
                      <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>
                        {isBusy ? "Approving…" : "Approve"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              }

              if (trip.status === "approved" || trip.status === "ongoing") {
                return (
                  <TouchableOpacity
                    onPress={async () => {
                      await handleMarkArrived(trip);
                      setViewingTrip(null);
                    }}
                    disabled={isBusy}
                    style={{ backgroundColor: "#dbeafe", borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: isBusy ? 0.6 : 1 }}
                  >
                    <Text style={{ color: "#1d4ed8", fontSize: 13, fontWeight: "700" }}>{isBusy ? "Updating…" : "Mark as Arrived"}</Text>
                  </TouchableOpacity>
                );
              }

              if (trip.status === "arrived") {
                return (
                  <TouchableOpacity
                    onPress={async () => {
                      await handleStartReturn(trip);
                      setViewingTrip(null);
                    }}
                    disabled={isBusy}
                    style={{ backgroundColor: "#fef3c7", borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: isBusy ? 0.6 : 1 }}
                  >
                    <Text style={{ color: "#92400e", fontSize: 13, fontWeight: "700" }}>{isBusy ? "Updating…" : "Start Return"}</Text>
                  </TouchableOpacity>
                );
              }

              if (trip.status === "returning") {
                return (
                  <TouchableOpacity
                    onPress={async () => {
                      await handleComplete(trip);
                      setViewingTrip(null);
                    }}
                    disabled={isBusy}
                    style={{ backgroundColor: "#dcfce7", borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: isBusy ? 0.6 : 1 }}
                  >
                    <Text style={{ color: "#166534", fontSize: 13, fontWeight: "700" }}>{isBusy ? "Updating…" : "Mark Completed"}</Text>
                  </TouchableOpacity>
                );
              }

              return null;
            })()}
          </>
        )}
      </ModalShell>
    </View>
  );
}
