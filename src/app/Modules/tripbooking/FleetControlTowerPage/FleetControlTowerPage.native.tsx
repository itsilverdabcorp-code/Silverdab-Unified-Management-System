// app/Admin/FleetOps/FleetControlTower/FleetControlTowerPage.native.tsx
//
// Fleet Ops — Admin Control Tower (native build).
// Same data/logic as the web build (useFleetControlTowerData.ts) — this
// file is native JSX only, same split as SupplyRequestsPage.native.tsx.
//
// NOT PORTED YET (same reasoning SupplyRequestsPage.native.tsx used for its
// web-only modals): FleetLiveMap (maplibre-gl, web-only) and the shared
// Calendar component (div-based) don't have native equivalents. Trip
// Requests / Vehicles / Drivers / KPIs / Add & Edit modals are fully
// native. Build a native map + calendar (or a shared cross-platform
// primitive) before shipping this to mobile if those are needed there too.

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { VehicleType, VehicleStatus } from "../../../../../types";
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

// ─── Small shared bits ──────────────────────────────────────────────────────

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
      {dot && colors.dot && (
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.dot }} />
      )}
      <Text style={{ color: colors.text, fontSize: 10, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

function KpiCard({
  label,
  value,
  sub,
  valueColor,
  onPress,
  theme,
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
  onPress?: () => void;
  theme: any;
}) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      onPress={onPress}
      style={{
        flex: 1,
        minWidth: "45%",
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
      }}
    >
      <Text style={{ color: theme.subtext, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text style={{ color: valueColor ?? theme.text, fontSize: 26, fontWeight: "700", marginTop: 4 }}>
        {value}
      </Text>
      {sub && (
        <Text style={{ color: theme.subtext, fontSize: 10, marginTop: 2 }}>{sub}</Text>
      )}
    </Wrapper>
  );
}

// A single-line "select" that opens a bottom-sheet-style modal list —
// stand-in for a web <select>, since RN has no native equivalent.
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
  const [open, setOpen] = useState(false);
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
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setOpen(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}
        >
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

function LabeledInput({
  label,
  value,
  onChangeText,
  theme,
  placeholder,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  theme: any;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "phone-pad";
}) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "700", marginBottom: 4 }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.subtext}
        keyboardType={keyboardType}
        style={{
          borderWidth: 1,
          borderColor: theme.inputBorder ?? theme.border,
          backgroundColor: theme.inputBg ?? theme.surface,
          color: theme.inputText ?? theme.text,
          borderRadius: 8,
          paddingHorizontal: 12,
          paddingVertical: 10,
          fontSize: 13,
        }}
      />
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

export default function FleetControlTowerPage(props: FleetControlTowerProps) {
  const { theme } = useTheme();
  const { onNavigate } = props;
  const data = useFleetControlTowerData(props);

  const {
    vehicles, drivers, loading,
    statusFilter, setStatusFilter,
    assignDrafts, setDraft, rowError, busyTripId,
    rejectingTrip, setRejectingTrip, rejectReason, setRejectReason, handleReject,
    viewingTrip, setViewingTrip,
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
    onTripDriverUserIds, onTripVehicleIds, ongoingTripByVehicleId,
    sortedVehicles, sortedDrivers,
    handleApprove, handleMarkArrived, handleStartReturn, handleComplete,
  } = data;

  const [section, setSection] = useState<"trips" | "vehicles" | "drivers">("trips");

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
      </View>
    );
  }

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Fleet Control Tower</Text>
        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2, marginBottom: 12 }}>Overview for {today}</Text>

        {/* KPI grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
          <KpiCard label="Trips today" value={kpi.tripsToday} sub="Departing/returning today" theme={theme} />
          <KpiCard
            label="Vehicles on trip"
            value={kpi.vehiclesOnTrip}
            sub={`Of ${vehicles.length} in fleet`}
            valueColor="#16a34a"
            onPress={() => onNavigate?.("fleet_vehicles")}
            theme={theme}
          />
          <KpiCard
            label="Pending approval"
            value={kpi.pendingApproval}
            sub="Needs vehicle & driver"
            valueColor="#d97706"
            onPress={() => {
              setSection("trips");
              setStatusFilter("pending");
            }}
            theme={theme}
          />
          <KpiCard
            label="Under maintenance"
            value={kpi.underMaintenance}
            sub="Unavailable for dispatch"
            valueColor="#dc2626"
            onPress={() => {
              setSection("vehicles");
              onNavigate?.("fleet_vehicles");
            }}
            theme={theme}
          />
        </View>

        {/* Section tabs */}
        <View style={{ flexDirection: "row", gap: 16, marginBottom: 12 }}>
          {(["trips", "vehicles", "drivers"] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setSection(tab)}>
              <Text
                style={{
                  color: section === tab ? theme.primary : theme.subtext,
                  fontSize: 13,
                  fontWeight: "700",
                  paddingBottom: 6,
                  borderBottomWidth: section === tab ? 2 : 0,
                  borderBottomColor: theme.primary,
                }}
              >
                {tab === "trips" ? "Trip Requests" : tab === "vehicles" ? "Vehicles" : "Drivers"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
        {section === "trips" && (
          <>
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
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: active ? theme.primary : theme.surface,
                        borderWidth: 1,
                        borderColor: active ? theme.primary : theme.border,
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: "700", color: active ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                        {tab.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            {filteredTrips.length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
                No trips match this filter.
              </Text>
            ) : (
              filteredTrips.map((trip) => {
                const colors = avatarColor(trip.requestorName);
                const isTripToday = isToday(trip.departureDatetime);
                const delayInfo = getDelayInfo(trip);
                return (
                  <TouchableOpacity
                    key={trip.id}
                    onPress={() => setViewingTrip(trip)}
                    style={{
                      backgroundColor: isTripToday ? "#fffbeb" : theme.surface,
                      borderColor: isTripToday ? "#f59e0b" : theme.border,
                      borderWidth: 1,
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                      <View
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          backgroundColor: colors.bg,
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        <Text style={{ color: colors.text, fontSize: 9, fontWeight: "700" }}>{getInitials(trip.requestorName)}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700" }} numberOfLines={1}>
                          {trip.pickupLabel} → {trip.dropoffLabel}
                        </Text>
                        <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }} numberOfLines={1}>
                          {trip.requestorName} · {formatDateTime(trip.departureDatetime)} · {trip.passengerCount} pax
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 4 }}>
                        <Badge label={TRIP_STATUS_CONFIG[trip.status].label} colors={TRIP_STATUS_CONFIG[trip.status]} dot />
                        {isTripToday && <Badge label="Today" colors={{ bg: "#f59e0b", text: "#fff" }} />}
                        {delayInfo && <Badge label={delayInfo.label} colors={{ bg: "#ef4444", text: "#fff" }} />}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {section === "vehicles" && (
          <>
            <TouchableOpacity
              onPress={() => {
                setAddVehicleOpen(true);
                setAddVehicleWarning("");
                loadTramigoDevices();
              }}
              style={{ alignSelf: "flex-start", backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}
            >
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>+ Add vehicle</Text>
            </TouchableOpacity>

            {vehicles.length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>No vehicles yet.</Text>
            ) : (
              sortedVehicles.map((v) => {
                const vCfg = getVehicleDisplayStatus(v, onTripVehicleIds);
                const isAvailable = v.status === "idle" && !onTripVehicleIds.has(v.id);
                return (
                  <TouchableOpacity
                    key={v.id}
                    onPress={() => openEditVehicle(v)}
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      borderWidth: 1,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                      opacity: isAvailable ? 1 : 0.6,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <View>
                        <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>{v.model || "—"}</Text>
                        <Text style={{ color: theme.text, fontSize: 11, fontWeight: "700", marginTop: 3 }}>{v.plateNumber || "No plate"}</Text>
                      </View>
                      <Badge label={vCfg.label} colors={vCfg} />
                    </View>
                    <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 8 }}>
                      {v.seatingCapacity} pax
                      {onTripVehicleIds.has(v.id) && v.assignedDriverName ? ` · Driver: ${v.assignedDriverName}` : ""}
                    </Text>
                    {onTripVehicleIds.has(v.id) && ongoingTripByVehicleId[v.id]?.purpose && (
                      <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                        Purpose: {ongoingTripByVehicleId[v.id].purpose}
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}

        {section === "drivers" && (
          <>
            <TouchableOpacity
              onPress={() => setAddDriverOpen(true)}
              style={{ alignSelf: "flex-start", backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}
            >
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>+ Add driver</Text>
            </TouchableOpacity>

            {drivers.length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>No drivers yet.</Text>
            ) : (
              sortedDrivers.map((d) => {
                const onTrip = onTripDriverUserIds.has(d.userId);
                const showPlate = onTrip && !!d.vehiclePlate;
                const dutyCfg = DUTY_STATUS_CONFIG[d.dutyStatus] ?? DUTY_STATUS_CONFIG.off_duty;
                const isAvailable = d.dutyStatus === "active" && !onTrip;
                return (
                  <TouchableOpacity
                    key={d.id}
                    onPress={() => openEditDriver(d)}
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      borderWidth: 1,
                      borderRadius: 10,
                      padding: 12,
                      marginBottom: 8,
                      opacity: isAvailable ? 1 : 0.6,
                    }}
                  >
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <Text style={{ color: theme.text, fontSize: 13.5, fontWeight: "700" }}>{d.name}</Text>
                      {showPlate ? (
                        <Badge label={`On Trip · ${d.vehiclePlate}`} colors={{ bg: "#dbeafe", text: "#1d4ed8" }} />
                      ) : (
                        <Badge label={dutyCfg.label} colors={dutyCfg} />
                      )}
                    </View>
                    <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 6 }}>{d.contactNumber ?? "—"}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>

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

      {/* Review / View Trip modal */}
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
                <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "700", marginBottom: 6 }}>
                  Assign vehicle &amp; driver
                </Text>
                <PickerField
                  label="Vehicle"
                  placeholder="Assign vehicle…"
                  value={assignDrafts[viewingTrip.id]?.vehicleId ?? ""}
                  options={availableVehicles.map((v) => ({ id: v.id, label: `${v.plateNumber} — ${v.model}` }))}
                  theme={theme}
                  onChange={(id) => setDraft(viewingTrip.id, { vehicleId: id })}
                />
                <PickerField
                  label="Driver"
                  placeholder="Assign driver…"
                  value={assignDrafts[viewingTrip.id]?.driverId ?? ""}
                  options={availableDrivers.map((d) => ({ id: d.id, label: d.name }))}
                  theme={theme}
                  onChange={(id) => setDraft(viewingTrip.id, { driverId: id })}
                />
                {rowError[viewingTrip.id] ? (
                  <Text style={{ color: "#dc2626", fontSize: 11, marginBottom: 6 }}>{rowError[viewingTrip.id]}</Text>
                ) : null}
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
                    <Text style={{ color: "#1d4ed8", fontSize: 13, fontWeight: "700" }}>
                      {isBusy ? "Updating…" : "Mark as Arrived"}
                    </Text>
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
                    <Text style={{ color: "#92400e", fontSize: 13, fontWeight: "700" }}>
                      {isBusy ? "Updating…" : "Start Return"}
                    </Text>
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
                    <Text style={{ color: "#166534", fontSize: 13, fontWeight: "700" }}>
                      {isBusy ? "Updating…" : "Mark Completed"}
                    </Text>
                  </TouchableOpacity>
                );
              }

              return null;
            })()}
          </>
        )}
      </ModalShell>

      {/* Add Vehicle modal */}
      <ModalShell
        visible={addVehicleOpen}
        onClose={() => {
          setAddVehicleOpen(false);
          setAddVehicleWarning("");
        }}
        title="Add Vehicle"
        theme={theme}
      >
        <PickerField
          label="Tramigo device (GPS tracker)"
          placeholder="Not linked yet"
          value={addVehicleForm.tramigoDeviceId}
          options={unlinkedTramigoDevices().map((d) => ({ id: d.id, label: `${d.name} — ${d.imei}` }))}
          theme={theme}
          onChange={(deviceId) => {
            const device = tramigoDevices.find((d) => d.id === deviceId);
            if (device) {
              const { model, plate } = parseTramigoDeviceName(device.name);
              setAddVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId, model: model || f.model, plateNumber: plate || f.plateNumber }));
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
        />
        {addVehicleWarning ? (
          <Text style={{ color: "#d97706", fontSize: 11, marginBottom: 10 }}>{addVehicleWarning}</Text>
        ) : null}

        {!addVehicleForm.tramigoDeviceId && (
          <>
            <LabeledInput
              label="Plate number"
              value={addVehicleForm.plateNumber}
              onChangeText={(t) => setAddVehicleForm((f) => ({ ...f, plateNumber: t }))}
              theme={theme}
              placeholder="e.g. NGP 4521"
            />
            <LabeledInput
              label="Model"
              value={addVehicleForm.model}
              onChangeText={(t) => setAddVehicleForm((f) => ({ ...f, model: t }))}
              theme={theme}
              placeholder="e.g. Toyota HiAce"
            />
          </>
        )}

        <PickerField
          label="Type"
          placeholder="Select type"
          value={addVehicleForm.type}
          options={[
            { id: "sedan", label: "Sedan" },
            { id: "van", label: "Van" },
            { id: "suv", label: "SUV" },
            { id: "truck", label: "Truck" },
          ]}
          theme={theme}
          onChange={(id) => setAddVehicleForm((f) => ({ ...f, type: id as VehicleType }))}
        />
        <LabeledInput
          label="Seating capacity"
          value={addVehicleForm.seatingCapacity}
          onChangeText={(t) => setAddVehicleForm((f) => ({ ...f, seatingCapacity: t }))}
          theme={theme}
          keyboardType="numeric"
        />

        {addVehicleError ? <Text style={{ color: "#dc2626", fontSize: 11, marginBottom: 10 }}>{addVehicleError}</Text> : null}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => {
              setAddVehicleOpen(false);
              setAddVehicleWarning("");
            }}
            style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddVehicle}
            disabled={addVehicleSubmitting}
            style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: addVehicleSubmitting ? 0.6 : 1 }}
          >
            <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>
              {addVehicleSubmitting ? "Adding…" : "Add Vehicle"}
            </Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* Add Driver modal */}
      <ModalShell
        visible={addDriverOpen}
        onClose={() => {
          setAddDriverOpen(false);
          setAddDriverWarning("");
        }}
        title="Add Driver"
        subtitle="Links an existing AD user as a driver."
        theme={theme}
      >
        <PickerField
          label="Employee"
          placeholder="Select an employee"
          value={addDriverForm.username}
          options={employeeOptions.map((o) => ({ id: o.value, label: o.label }))}
          theme={theme}
          onChange={(id) => {
            const opt = employeeOptions.find((o) => o.value === id);
            const label = opt?.label ?? "";
            setAddDriverForm((f) => ({ ...f, username: id, displayName: label }));
            setAddDriverWarning(
              existingDriverNames.has(label.trim().toLowerCase()) ? `${label} is already registered as a driver.` : "",
            );
          }}
        />
        {addDriverWarning ? <Text style={{ color: "#d97706", fontSize: 11, marginBottom: 10 }}>{addDriverWarning}</Text> : null}
        <LabeledInput
          label="Contact number"
          value={addDriverForm.contactNumber}
          onChangeText={(t) => setAddDriverForm((f) => ({ ...f, contactNumber: t }))}
          theme={theme}
          keyboardType="phone-pad"
        />
        {addDriverError ? <Text style={{ color: "#dc2626", fontSize: 11, marginBottom: 10 }}>{addDriverError}</Text> : null}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
          <TouchableOpacity
            onPress={() => {
              setAddDriverOpen(false);
              setAddDriverWarning("");
            }}
            style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
          >
            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddDriver}
            disabled={addDriverSubmitting}
            style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: addDriverSubmitting ? 0.6 : 1 }}
          >
            <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>
              {addDriverSubmitting ? "Adding…" : "Add Driver"}
            </Text>
          </TouchableOpacity>
        </View>
      </ModalShell>

      {/* Edit Vehicle modal */}
      <ModalShell
        visible={!!editingVehicle}
        onClose={() => {
          setEditingVehicle(null);
          setConfirmDeleteVehicle(false);
        }}
        title="Edit Vehicle"
        theme={theme}
      >
        {editingVehicle && (
          <>
            <PickerField
              label="Tramigo device (GPS tracker)"
              placeholder="Not linked"
              value={editVehicleForm.tramigoDeviceId}
              options={unlinkedTramigoDevices(editingVehicle.id).map((d) => ({ id: d.id, label: `${d.name} — ${d.imei}` }))}
              theme={theme}
              onChange={(deviceId) => {
                const device = tramigoDevices.find((d) => d.id === deviceId);
                if (device) {
                  const { model, plate } = parseTramigoDeviceName(device.name);
                  setEditVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId, model: model || f.model, plateNumber: plate || f.plateNumber }));
                } else {
                  setEditVehicleForm((f) => ({ ...f, tramigoDeviceId: deviceId }));
                }
              }}
            />

            {!editVehicleForm.tramigoDeviceId && (
              <>
                <LabeledInput
                  label="Plate number"
                  value={editVehicleForm.plateNumber}
                  onChangeText={(t) => setEditVehicleForm((f) => ({ ...f, plateNumber: t }))}
                  theme={theme}
                />
                <LabeledInput
                  label="Model"
                  value={editVehicleForm.model}
                  onChangeText={(t) => setEditVehicleForm((f) => ({ ...f, model: t }))}
                  theme={theme}
                />
              </>
            )}

            <PickerField
              label="Type"
              placeholder="Select type"
              value={editVehicleForm.type}
              options={[
                { id: "sedan", label: "Sedan" },
                { id: "van", label: "Van" },
                { id: "suv", label: "SUV" },
                { id: "truck", label: "Truck" },
              ]}
              theme={theme}
              onChange={(id) => setEditVehicleForm((f) => ({ ...f, type: id as VehicleType }))}
            />
            <LabeledInput
              label="Seating capacity"
              value={editVehicleForm.seatingCapacity}
              onChangeText={(t) => setEditVehicleForm((f) => ({ ...f, seatingCapacity: t }))}
              theme={theme}
              keyboardType="numeric"
            />

            {onTripVehicleIds.has(editingVehicle.id) ? (
              <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 10 }}>
                Status is locked while this vehicle is out on a trip.
              </Text>
            ) : (
              <PickerField
                label="Status"
                placeholder="Select status"
                value={editVehicleForm.status}
                options={[
                  { id: "idle", label: "Available" },
                  { id: "personal", label: "Personal use" },
                  { id: "maintenance", label: "Maintenance" },
                ]}
                theme={theme}
                onChange={(id) => setEditVehicleForm((f) => ({ ...f, status: id as VehicleStatus }))}
              />
            )}

            {editVehicleError ? <Text style={{ color: "#dc2626", fontSize: 11, marginBottom: 10 }}>{editVehicleError}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setEditingVehicle(null);
                  setConfirmDeleteVehicle(false);
                }}
                style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUpdateVehicle}
                disabled={editVehicleSubmitting}
                style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: editVehicleSubmitting ? 0.6 : 1 }}
              >
                <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>
                  {editVehicleSubmitting ? "Saving…" : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (!confirmDeleteVehicle) {
                  setConfirmDeleteVehicle(true);
                  return;
                }
                handleDeleteVehicle();
              }}
              disabled={editVehicleSubmitting}
              style={{
                backgroundColor: confirmDeleteVehicle ? "#ef4444" : "#fee2e2",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
                opacity: editVehicleSubmitting ? 0.6 : 1,
              }}
            >
              <Text style={{ color: confirmDeleteVehicle ? "#fff" : "#991b1b", fontSize: 13, fontWeight: "700" }}>
                {editVehicleSubmitting ? "Deleting…" : confirmDeleteVehicle ? "Tap again to confirm delete" : "Delete Vehicle"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ModalShell>

      {/* Edit Driver modal */}
      <ModalShell
        visible={!!editingDriver}
        onClose={() => {
          setEditingDriver(null);
          setConfirmDeleteDriver(false);
        }}
        title="Edit Driver"
        subtitle={editingDriver?.name}
        theme={theme}
      >
        {editingDriver && (
          <>
            <LabeledInput
              label="License number"
              value={editDriverForm.licenseNumber}
              onChangeText={(t) => setEditDriverForm((f) => ({ ...f, licenseNumber: t }))}
              theme={theme}
            />
            <LabeledInput
              label="Contact number"
              value={editDriverForm.contactNumber}
              onChangeText={(t) => setEditDriverForm((f) => ({ ...f, contactNumber: t }))}
              theme={theme}
              keyboardType="phone-pad"
            />
            {editDriverError ? <Text style={{ color: "#dc2626", fontSize: 11, marginBottom: 10 }}>{editDriverError}</Text> : null}

            <View style={{ flexDirection: "row", gap: 10, marginBottom: 10 }}>
              <TouchableOpacity
                onPress={() => {
                  setEditingDriver(null);
                  setConfirmDeleteDriver(false);
                }}
                style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 12, alignItems: "center" }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleUpdateDriver}
                disabled={editDriverSubmitting}
                style={{ flex: 1, backgroundColor: theme.primary, borderRadius: 10, paddingVertical: 12, alignItems: "center", opacity: editDriverSubmitting ? 0.6 : 1 }}
              >
                <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>
                  {editDriverSubmitting ? "Saving…" : "Save Changes"}
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => {
                if (!confirmDeleteDriver) {
                  setConfirmDeleteDriver(true);
                  return;
                }
                handleDeleteDriver();
              }}
              disabled={editDriverSubmitting}
              style={{
                backgroundColor: confirmDeleteDriver ? "#ef4444" : "#fee2e2",
                borderRadius: 10,
                paddingVertical: 12,
                alignItems: "center",
                opacity: editDriverSubmitting ? 0.6 : 1,
              }}
            >
              <Text style={{ color: confirmDeleteDriver ? "#fff" : "#991b1b", fontSize: 13, fontWeight: "700" }}>
                {editDriverSubmitting ? "Deleting…" : confirmDeleteDriver ? "Tap again to confirm delete" : "Delete Driver"}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ModalShell>
    </View>
  );
}
