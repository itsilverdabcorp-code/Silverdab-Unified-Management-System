import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Keyboard,
} from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser, SupplyRequest, SupplyRequestItem } from "../../../../../types";
import { getAllInventoryItems } from "../../../../services/Officeinventory";
import {
  useSupplyRequestsData,
  REQUEST_STATUS_TABS,
  DELIVERY_STATUS_TABS,
  statusLabel,
  statusBadgeColors,
  stockLabel,
  stockBadgeColors,
  worstStockStatus,
  effectiveStatus,
  itemSummary,
  getInitials,
  formatDate,
  type StockStatus,
} from "./useSupplyRequestsData";

type Props = {
  user?: ADUser;
  initialApprovalRequest?: SupplyRequest | null;
  onApprovalModalOpened?: () => void;
};

function Badge({ label, colors }: { label: string; colors: { bg: string; fg: string } }) {
  return (
    <View style={{ backgroundColor: colors.bg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 }}>
      <Text style={{ color: colors.fg, fontSize: 10, fontWeight: "600" }}>{label}</Text>
    </View>
  );
}

function RequestCard({
  request,
  liveStock,
  onApprove,
  onView,
  onDeliver,
  onFail,
  approvingId,
  theme,
}: {
  request: SupplyRequest;
  liveStock: Record<string, StockStatus>;
  onApprove: (r: SupplyRequest) => void;
  onView: (r: SupplyRequest) => void;
  onDeliver: (r: SupplyRequest) => void;
  onFail: (r: SupplyRequest) => void;
  approvingId: string | null;
  theme: any;
}) {
  const stock = worstStockStatus(request.items, liveStock);
  const status = effectiveStatus(request, liveStock);
  const { primaryLabel, extraCount, qtyLabel } = itemSummary(request.items);
  const isPending = request.status === "pending" || request.status === "awaiting_stock";
  const isApproving = approvingId === request.id;

  return (
    <TouchableOpacity
      onPress={() => onView(request)}
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 10,
        padding: 10,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flex: 1 }}>
          <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: theme.primaryText, fontSize: 8, fontWeight: "600" }}>
              {getInitials(request.requestedByName)}
            </Text>
          </View>
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
            #{request.ticketNumber.replace(/^SR-\d+-/, "")}
          </Text>
          <Text style={{ color: theme.subtext, fontSize: 11 }} numberOfLines={1}>
            {request.requestedByName}
          </Text>
        </View>
        <Badge label={statusLabel(status)} colors={statusBadgeColors(status)} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", flex: 1 }} numberOfLines={1}>
          {primaryLabel}{extraCount > 0 ? `  +${extraCount}` : ""}
        </Text>
        <Badge label={stockLabel(stock)} colors={stockBadgeColors(stock)} />
      </View>

      <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 8 }}>
        {qtyLabel} · {formatDate(request.createdAt)}
      </Text>

      {isPending ? (
        <TouchableOpacity
          onPress={() => onApprove(request)}
          disabled={isApproving}
          style={{ backgroundColor: theme.primary, borderRadius: 8, paddingVertical: 8, alignItems: "center", opacity: isApproving ? 0.6 : 1 }}
        >
          <Text style={{ color: theme.primaryText, fontSize: 12, fontWeight: "600" }}>
            {isApproving ? "Reviewing…" : "Review"}
          </Text>
        </TouchableOpacity>
      ) : request.status === "out_for_delivery" ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity
            onPress={() => onDeliver(request)}
            disabled={isApproving}
            style={{ flex: 1, backgroundColor: "#16a34a", borderRadius: 8, paddingVertical: 8, alignItems: "center", opacity: isApproving ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
              {isApproving ? "Saving…" : "✓ Deliver"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onFail(request)}
            disabled={isApproving}
            style={{ backgroundColor: "#D97706", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, opacity: isApproving ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => onView(request)}
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>View</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

function DeliveryCard({
  request,
  onDeliver,
  onFail,
  onView,
  actionId,
  theme,
}: {
  request: SupplyRequest;
  onDeliver: (r: SupplyRequest) => void;
  onFail: (r: SupplyRequest) => void;
  onView: (r: SupplyRequest) => void;
  actionId: string | null;
  theme: any;
}) {
  const { primaryLabel, extraCount, qtyLabel } = itemSummary(request.items);
  const status = request.status;
  const isActive = actionId === request.id;
  const isForDelivery = status === "out_for_delivery" || status === "failed_delivery";

  return (
    <TouchableOpacity
      onPress={() => onView(request)}
      style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>
          #{request.ticketNumber.replace(/^SR-\d+-/, "")}
        </Text>
        <Badge label={statusLabel(status)} colors={statusBadgeColors(status)} />
      </View>
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
        {primaryLabel}{extraCount > 0 ? `  +${extraCount}` : ""}
      </Text>
      <Text style={{ color: theme.subtext, fontSize: 11, marginVertical: 6 }}>
        {qtyLabel} · Approved {formatDate(request.approvedAt ?? "")}
      </Text>
      {status === "failed_delivery" && request.failedReason && (
        <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 6 }} numberOfLines={1}>
          {request.failedReason}
        </Text>
      )}
      {isForDelivery ? (
        <View style={{ flexDirection: "row", gap: 6 }}>
          <TouchableOpacity
            onPress={() => onDeliver(request)}
            disabled={isActive}
            style={{ flex: 1, backgroundColor: "#16a34a", borderRadius: 8, paddingVertical: 8, alignItems: "center", opacity: isActive ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
              {isActive ? "Saving…" : "✓ Deliver"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onFail(request)}
            disabled={isActive}
            style={{ backgroundColor: "#D97706", borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14, opacity: isActive ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => onView(request)}
          style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 8, alignItems: "center" }}
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>View</Text>
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );
}

// ─── Partial approval modal ─────────────────────────────────────────────
// Defined here directly, not imported — this page is the only native
// screen that needs it, so there's no shared cross-platform file to keep
// in sync. (OfficeDashboardPage.native.tsx has its own separate bare
// approve/reject stand-in for the same reason: page-local, not shared.)

type FulfillmentLine = {
  item: SupplyRequestItem;
  liveStock: number;
  qtyToDispense: number;
  skipped: boolean;
};

function clampQty(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function stockColor(stock: number, requested: number): string {
  if (stock <= 0) return "#f87171";
  if (stock < requested) return "#fb923c";
  return "#34d399";
}

function PartialApprovalNativeModal({
  visible,
  request,
  onClose,
  onApproveAll,
  onApprovePartial,
  onReject,
  theme,
}: {
  visible: boolean;
  request: SupplyRequest | null;
  onClose: () => void;
  onApproveAll: (request: SupplyRequest) => Promise<void>;
  onApprovePartial: (requestId: string, lines: { itemId: string; qtyToDispense: number }[]) => Promise<void>;
  onReject: (requestId: string) => void;
  theme: any;
}) {
  const [lines, setLines] = React.useState<FulfillmentLine[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible || !request) return;
    setError(null);
    setSubmitting(false);

    const fetchStock = async () => {
      setLoading(true);
      try {
        const inventory = await getAllInventoryItems();
        const stockMap = new Map(inventory.map((i) => [i.id, i.currentStock]));

        const newLines: FulfillmentLine[] = request.items.map((item) => {
          const liveStock = stockMap.get(item.itemId) ?? 0;
          const maxDispensable = Math.min(item.quantityRequested, liveStock);
          return {
            item,
            liveStock,
            qtyToDispense: maxDispensable,
            skipped: liveStock <= 0,
          };
        });
        setLines(newLines);
      } catch (err: any) {
        setError("Failed to load live stock. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, [visible, request]);

  if (!request) return null;

  const activeLines = lines.filter((l) => !l.skipped);
  const hasAnyActive = activeLines.length > 0;
  const somePartial = lines.some((l) => !l.skipped && l.qtyToDispense < l.item.quantityRequested);
  const someSkipped = lines.some((l) => l.skipped);

  const updateQty = (itemId: string, raw: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.item.itemId !== itemId) return l;
        const parsed = parseInt(raw, 10);
        const qty = isNaN(parsed) ? 1 : clampQty(parsed, 1, Math.min(l.item.quantityRequested, l.liveStock));
        const shouldSkip = !isNaN(parsed) && parsed <= 0;
        return { ...l, qtyToDispense: shouldSkip ? 0 : qty, skipped: shouldSkip };
      }),
    );
  };

  const toggleSkip = (itemId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.item.itemId !== itemId) return l;
        if (l.skipped) {
          const max = Math.min(l.item.quantityRequested, l.liveStock);
          return { ...l, skipped: false, qtyToDispense: max > 0 ? max : 0 };
        }
        return { ...l, skipped: true, qtyToDispense: 0 };
      }),
    );
  };

  const handleApproveAll = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onApproveAll(request);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePartial = async () => {
    if (!hasAnyActive) return;
    setSubmitting(true);
    setError(null);
    try {
      await onApprovePartial(
        request.id,
        lines.filter((l) => !l.skipped && l.qtyToDispense > 0).map((l) => ({ itemId: l.item.itemId, qtyToDispense: l.qtyToDispense })),
      );
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReject = () => onReject(request.id);

  const approveLabel = submitting ? "Saving…" : someSkipped || somePartial ? "Approve with adjustments" : "Approve";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {
            Keyboard.dismiss();
            onClose();
          }}
          style={{ flex: 1 }}
        />
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "88%" }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: theme.subtext, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>
                Approve request
              </Text>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
                {request.ticketNumber}
                <Text style={{ color: theme.subtext, fontWeight: "400" }}> · {request.requestedByName}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
              <Text style={{ color: theme.subtext, fontSize: 12, lineHeight: 17 }}>
                Adjust quantities per item based on available stock. Skipped items won't be deducted.{" "}
                <Text style={{ color: theme.text, fontWeight: "700" }}>Approve all</Text> fulfills every item at the requested qty.
              </Text>
            </View>

            {error && (
              <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                <Text style={{ color: "#b91c1c", fontSize: 12 }}>{error}</Text>
              </View>
            )}

            {loading ? (
              <View style={{ paddingVertical: 30, alignItems: "center" }}>
                <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
              </View>
            ) : (
              <>
                {lines.map((line) => {
                  const isOutOfStock = line.liveStock <= 0;
                  const isShortStock = line.liveStock < line.item.quantityRequested;

                  return (
                    <View
                      key={line.item.itemId}
                      style={{
                        backgroundColor: theme.background,
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 10,
                        padding: 12,
                        opacity: line.skipped ? 0.5 : 1,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>
                            {line.item.itemName}
                          </Text>
                          <Text style={{ color: theme.subtext, fontSize: 11 }}>{line.item.itemCode}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => toggleSkip(line.item.itemId)}
                          disabled={isOutOfStock}
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 7,
                            borderWidth: 1,
                            borderColor: theme.border,
                            backgroundColor: line.skipped ? theme.surface : "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: isOutOfStock ? 0.4 : 1,
                          }}
                        >
                          <Text style={{ color: line.skipped ? theme.primary : "#f87171", fontSize: 15, fontWeight: "700" }}>
                            {line.skipped ? "+" : "–"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                        <View>
                          <Text style={{ color: theme.subtext, fontSize: 10, textTransform: "uppercase" }}>Requested</Text>
                          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{line.item.quantityRequested}</Text>
                        </View>

                        <View>
                          <Text style={{ color: theme.subtext, fontSize: 10, textTransform: "uppercase" }}>In stock</Text>
                          <Text style={{ color: stockColor(line.liveStock, line.item.quantityRequested), fontSize: 14, fontWeight: "700" }}>
                            {line.liveStock}
                          </Text>
                          {isOutOfStock ? (
                            <Text style={{ color: "#f87171", fontSize: 10 }}>none</Text>
                          ) : isShortStock ? (
                            <Text style={{ color: "#fb923c", fontSize: 10 }}>short</Text>
                          ) : null}
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.subtext, fontSize: 10, textTransform: "uppercase", marginBottom: 3 }}>Dispense</Text>
                          <TextInput
                            keyboardType="numeric"
                            editable={!line.skipped && !isOutOfStock}
                            value={line.skipped ? "" : String(line.qtyToDispense)}
                            placeholder={line.skipped ? "—" : "0"}
                            placeholderTextColor={theme.subtext}
                            onChangeText={(v) => updateQty(line.item.itemId, v)}
                            style={{
                              borderWidth: 1,
                              borderColor: theme.inputBorder,
                              backgroundColor: theme.inputBg,
                              color: theme.inputText,
                              borderRadius: 7,
                              paddingHorizontal: 10,
                              paddingVertical: 7,
                              fontSize: 13,
                              textAlign: "center",
                              opacity: isOutOfStock ? 0.4 : 1,
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}

                {lines.length > 0 && (
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 10 }}>
                    <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 3 }}>
                      {activeLines.length} of {lines.length} item{lines.length !== 1 ? "s" : ""} will be dispensed
                      {somePartial ? <Text style={{ color: "#fb923c" }}> (partial quantities)</Text> : null}
                    </Text>
                    <Text style={{ color: theme.subtext, fontSize: 12 }}>
                      Total qty:{" "}
                      <Text style={{ color: theme.text, fontWeight: "700" }}>
                        {activeLines.reduce((s, l) => s + l.qtyToDispense, 0)}
                      </Text>
                      {" / "}
                      {lines.reduce((s, l) => s + l.item.quantityRequested, 0)} requested
                    </Text>
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View style={{ borderTopWidth: 1, borderTopColor: theme.border, padding: 14, gap: 8 }}>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReject}
                disabled={submitting || loading}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#fca5a5",
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: "center",
                  opacity: submitting || loading ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#ef4444", fontSize: 13, fontWeight: "600" }}>{submitting ? "Saving…" : "Reject"}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={handleApproveAll}
                disabled={submitting || loading}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: "center",
                  opacity: submitting || loading ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>{submitting ? "Saving…" : "Approve all"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApprovePartial}
                disabled={submitting || loading || !hasAnyActive}
                style={{
                  flex: 1,
                  backgroundColor: theme.primary,
                  borderRadius: 8,
                  paddingVertical: 10,
                  alignItems: "center",
                  opacity: submitting || loading || !hasAnyActive ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "600" }}>{approveLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SupplyRequestsPage({ user, initialApprovalRequest, onApprovalModalOpened }: Props) {
  const { theme } = useTheme();
  const {
    pageTab, setPageTab,
    loading,
    search, setSearch,
    statusFilter, setStatusFilter,
    delivFilter, setDelivFilter,
    setDetailRequest,
    setRejectTarget,
    setFailTarget,
    approvalTarget, setApprovalTarget,
    approvingId,
    delivActionId,
    error,
    liveStock,
    filteredRequests,
    filteredDeliveries,
    requestCounts,
    delivCounts,
    pendingDeliveryCount,
    handleApproveAll,
    handleApprovePartial,
    handleMarkDelivered,
    handleReject,
  } = useSupplyRequestsData({ user, initialApprovalRequest, onApprovalModalOpened });

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
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Supply requests</Text>
        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2, marginBottom: 12 }}>
          {pageTab === "requests"
            ? `${filteredRequests.length} of ${filteredRequests.length} requests`
            : `${filteredDeliveries.length} deliveries`}
        </Text>

        <View style={{ flexDirection: "row", gap: 16, marginBottom: 12 }}>
          {(["requests", "deliveries"] as const).map((tab) => (
            <TouchableOpacity key={tab} onPress={() => setPageTab(tab)}>
              <Text
                style={{
                  color: pageTab === tab ? theme.primary : theme.subtext,
                  fontSize: 13,
                  fontWeight: "600",
                  paddingBottom: 6,
                  borderBottomWidth: pageTab === tab ? 2 : 0,
                  borderBottomColor: theme.primary,
                }}
              >
                {tab === "requests" ? "Supply Requests" : `Deliveries${pendingDeliveryCount > 0 ? ` (${pendingDeliveryCount})` : ""}`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TextInput
          placeholder="Search…"
          placeholderTextColor={theme.subtext}
          value={search}
          onChangeText={setSearch}
          style={{
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            borderWidth: 1,
            color: theme.inputText,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 8,
            fontSize: 13,
            marginBottom: 10,
          }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(pageTab === "requests" ? REQUEST_STATUS_TABS : DELIVERY_STATUS_TABS).map((tab) => {
              const active = pageTab === "requests" ? statusFilter === tab.value : delivFilter === tab.value;
              const count = pageTab === "requests"
                ? (requestCounts[tab.value] ?? 0)
                : (delivCounts[tab.value as keyof typeof delivCounts] ?? 0);
              return (
                <TouchableOpacity
                  key={tab.value}
                  onPress={() =>
                    pageTab === "requests" ? setStatusFilter(tab.value as any) : setDelivFilter(tab.value as any)
                  }
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                    {tab.label} ({count})
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {error ? (
          <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <Text style={{ color: "#b91c1c", fontSize: 12 }}>⚠ {error}</Text>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
        {pageTab === "requests" ? (
          filteredRequests.length === 0 ? (
            <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
              No requests found.
            </Text>
          ) : (
            filteredRequests.map((r) => (
              <RequestCard
                key={r.id}
                request={r}
                liveStock={liveStock}
                onApprove={(x) => setApprovalTarget(x)}
                onView={(x) => setDetailRequest(x)}
                onDeliver={handleMarkDelivered}
                onFail={(x) => setFailTarget(x)}
                approvingId={approvingId}
                theme={theme}
              />
            ))
          )
        ) : filteredDeliveries.length === 0 ? (
          <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
            No deliveries found.
          </Text>
        ) : (
          filteredDeliveries.map((r) => (
            <DeliveryCard
              key={r.id}
              request={r}
              onDeliver={handleMarkDelivered}
              onFail={(x) => setFailTarget(x)}
              onView={(x) => setDetailRequest(x)}
              actionId={delivActionId}
              theme={theme}
            />
          ))
        )}
      </ScrollView>

      <PartialApprovalNativeModal
        visible={approvalTarget !== null}
        request={approvalTarget}
        onClose={() => setApprovalTarget(null)}
        onApproveAll={handleApproveAll}
        onApprovePartial={handleApprovePartial}
        onReject={handleReject}
        theme={theme}
      />

      {/* Detail drawer, reject modal, failed-delivery modal, and archive
          modal are web-only <div>-based components in this pass — they'll
          throw on native if rendered. Build native versions of these (or a
          shared cross-platform modal primitive) before shipping this to
          mobile; for now they're intentionally omitted here. */}
    </View>
  );
}