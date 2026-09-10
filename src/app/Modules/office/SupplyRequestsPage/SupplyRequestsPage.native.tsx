import React from "react";
import {
  View,
  Text,
  ScrollView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  Keyboard,
  StyleSheet,
} from "react-native";
import Svg, { Path, Circle } from "react-native-svg";
import { SlidersHorizontal } from "lucide-react-native";
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

// Shared yes/no confirmation used before "Mark as Delivered" / mark-as-failed
// actions fire, so a stray tap on a list card doesn't silently change a
// request's status.
function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmColor,
  busy,
  onCancel,
  onConfirm,
  theme,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  theme: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onCancel}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: 24 }}
      >
        <TouchableOpacity activeOpacity={1} style={{ width: "100%", maxWidth: 340, backgroundColor: theme.surface, borderRadius: 16, padding: 20 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>{title}</Text>
          <Text style={{ color: theme.subtext, fontSize: 13, lineHeight: 19, marginBottom: 18 }}>{message}</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={busy}
              style={{ flex: 1, paddingVertical: 11, borderRadius: 8, borderWidth: 1, borderColor: theme.border, alignItems: "center", opacity: busy ? 0.6 : 1 }}
            >
              <Text style={{ color: theme.subtext, fontSize: 13, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={busy}
              style={{ flex: 1, paddingVertical: 11, borderRadius: 8, backgroundColor: confirmColor, alignItems: "center", justifyContent: "center", opacity: busy ? 0.7 : 1 }}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>{confirmLabel}</Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const ITEM_ICON_COLOR = "#64748b";

function MetaIcon({ name, color }: { name: "person" | "box" | "calendar"; color: string }) {
  const common = {
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  if (name === "person") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" {...common}>
        <Circle cx={12} cy={8} r={4} />
        <Path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
      </Svg>
    );
  }
  if (name === "calendar") {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" {...common}>
        <Path d="M8 2v4M16 2v4M3 10h18" />
        <Path d="M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" />
      </Svg>
    );
  }
  // box
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" {...common}>
      <Path d="M21 8 12 3 3 8l9 5 9-5Z" />
      <Path d="M3 8v8l9 5 9-5V8" />
      <Path d="M12 13v8" />
    </Svg>
  );
}

function activityVerb(kind: string): string {
  switch (kind) {
    case "requested":
      return "Requested by";
    case "approved":
      return "Approved by";
    case "rejected":
      return "Rejected by";
    case "delivered":
      return "Delivered by";
    case "failed":
      return "Delivery failed";
    case "cancelled":
      return "Cancelled by";
    default:
      return kind;
  }
}

type ActivityEntry = { kind: string; actorName?: string | null; timestamp: string };

function buildActivity(request: SupplyRequest): ActivityEntry[] {
  const entries: ActivityEntry[] = [];

  entries.push({ kind: "requested", actorName: request.requestedByName, timestamp: request.createdAt });

  if (request.reviewedAt) {
    entries.push({
      kind: request.status === "rejected" ? "rejected" : "approved",
      actorName: request.reviewedByName,
      timestamp: request.reviewedAt,
    });
  } else if (request.approvedAt) {
    entries.push({ kind: "approved", actorName: request.approvedByName, timestamp: request.approvedAt });
  }

  if (request.deliveredAt) {
    entries.push({ kind: "delivered", actorName: request.deliveredByName, timestamp: request.deliveredAt });
  }

  if (request.failedAt) {
    entries.push({ kind: "failed", actorName: null, timestamp: request.failedAt });
  }

  if (request.cancelledAt) {
    entries.push({ kind: "cancelled", actorName: request.cancelledByName, timestamp: request.cancelledAt });
  }

  return entries.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}

const RequestCard = React.memo(function RequestCard({
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
  const isOutForDelivery = request.status === "out_for_delivery";
  const isApproving = approvingId === request.id;
  const statusColors = statusBadgeColors(status);
  const [confirmKind, setConfirmKind] = React.useState<"deliver" | "fail" | null>(null);

  return (
    <>
    <TouchableOpacity
      onPress={() => onView(request)}
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>
          SR-{request.ticketNumber.replace(/^SR-\d+-/, "")}
        </Text>
        <Badge label={statusLabel(status)} colors={statusColors} />
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          marginBottom: 14,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", flex: 1 }} numberOfLines={1}>
          {primaryLabel}{extraCount > 0 ? `  +${extraCount}` : ""}
        </Text>
        <Badge label={stockLabel(stock)} colors={stockBadgeColors(stock)} />
      </View>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingTop: 12,
          marginBottom: isPending || isOutForDelivery ? 14 : 0,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MetaIcon name="person" color={theme.subtext} />
          <Text style={{ color: theme.text, fontSize: 15 }} numberOfLines={1}>
            {request.requestedByName}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MetaIcon name="box" color={theme.subtext} />
          <Text style={{ color: theme.text, fontSize: 15 }} numberOfLines={1}>
            {qtyLabel}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MetaIcon name="calendar" color={theme.subtext} />
          <Text style={{ color: theme.text, fontSize: 15 }}>{formatDate(request.createdAt)}</Text>
        </View>
      </View>

      {isPending ? (
        <TouchableOpacity
          onPress={() => onApprove(request)}
          disabled={isApproving}
          style={{ backgroundColor: theme.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: isApproving ? 0.6 : 1 }}
        >
          <Text style={{ color: theme.primaryText, fontSize: 15, fontWeight: "600" }}>
            {isApproving ? "Reviewing…" : "Review request"}
          </Text>
        </TouchableOpacity>
      ) : isOutForDelivery ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              setConfirmKind("fail");
            }}
            disabled={isApproving}
            style={{
              width: 42,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: isApproving ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.subtext, fontSize: 14, fontWeight: "600" }}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              setConfirmKind("deliver");
            }}
            disabled={isApproving}
            style={{ flex: 1, backgroundColor: "#16a34a", borderRadius: 10, paddingVertical: 10, alignItems: "center", opacity: isApproving ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
              {isApproving ? "Saving…" : "Mark as Delivered"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>

    <ConfirmModal
      visible={confirmKind !== null}
      title={confirmKind === "deliver" ? "Mark as delivered?" : "Mark as failed?"}
      message={
        confirmKind === "deliver"
          ? "This confirms the items were handed off to the requestor."
          : "This flags the delivery as unsuccessful — you can add details on the next screen."
      }
      confirmLabel={confirmKind === "deliver" ? "Mark as delivered" : "Mark as failed"}
      confirmColor={confirmKind === "deliver" ? "#16a34a" : "#ef4444"}
      busy={isApproving}
      onCancel={() => setConfirmKind(null)}
      onConfirm={() => {
        if (confirmKind === "deliver") onDeliver(request);
        else if (confirmKind === "fail") onFail(request);
        setConfirmKind(null);
      }}
      theme={theme}
    />
    </>
  );
});

const DeliveryCard = React.memo(function DeliveryCard({
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
  const [confirmKind, setConfirmKind] = React.useState<"deliver" | "fail" | null>(null);

  return (
    <>
    <TouchableOpacity
      onPress={() => onView(request)}
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <Text style={{ color: theme.text, fontSize: 19, fontWeight: "700" }}>
          SR-{request.ticketNumber.replace(/^SR-\d+-/, "")}
        </Text>
        <Badge label={statusLabel(status)} colors={statusBadgeColors(status)} />
      </View>

      <Text style={{ color: theme.text, fontSize: 18, fontWeight: "700", marginBottom: 14 }} numberOfLines={2}>
        {primaryLabel}{extraCount > 0 ? `  +${extraCount}` : ""}
      </Text>

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: theme.border,
          paddingTop: 12,
          marginBottom: 14,
          gap: 8,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MetaIcon name="person" color={theme.subtext} />
          <Text style={{ color: theme.text, fontSize: 15 }} numberOfLines={1}>
            {request.requestedByName}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MetaIcon name="box" color={theme.subtext} />
          <Text style={{ color: theme.text, fontSize: 15 }} numberOfLines={1}>
            {qtyLabel}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <MetaIcon name="calendar" color={theme.subtext} />
          <Text style={{ color: theme.text, fontSize: 15 }}>
            Approved {formatDate(request.approvedAt ?? "")}
          </Text>
        </View>
      </View>

      {status === "failed_delivery" && request.failedReason && (
        <Text style={{ color: theme.subtext, fontSize: 13, marginBottom: 14 }} numberOfLines={1}>
          {request.failedReason}
        </Text>
      )}

      {isForDelivery ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              setConfirmKind("fail");
            }}
            disabled={isActive}
            style={{
              width: 48,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: "center",
              justifyContent: "center",
              opacity: isActive ? 0.6 : 1,
            }}
          >
            <Text style={{ color: theme.subtext, fontSize: 16, fontWeight: "600" }}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={(e) => {
              e.stopPropagation?.();
              setConfirmKind("deliver");
            }}
            disabled={isActive}
            style={{ flex: 1, backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 14, alignItems: "center", opacity: isActive ? 0.6 : 1 }}
          >
            <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>
              {isActive ? "Saving…" : "Mark as Delivered"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </TouchableOpacity>

    <ConfirmModal
      visible={confirmKind !== null}
      title={confirmKind === "deliver" ? "Mark as delivered?" : "Mark as failed?"}
      message={
        confirmKind === "deliver"
          ? "This confirms the items were handed off to the requestor."
          : "This flags the delivery as unsuccessful — you can add details on the next screen."
      }
      confirmLabel={confirmKind === "deliver" ? "Mark as delivered" : "Mark as failed"}
      confirmColor={confirmKind === "deliver" ? "#16a34a" : "#ef4444"}
      busy={isActive}
      onCancel={() => setConfirmKind(null)}
      onConfirm={() => {
        if (confirmKind === "deliver") onDeliver(request);
        else if (confirmKind === "fail") onFail(request);
        setConfirmKind(null);
      }}
      theme={theme}
    />
    </>
  );
});

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
              paddingHorizontal: 20,
              paddingVertical: 18,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text style={{ color: theme.subtext, fontSize: 13, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>
                Approve request
              </Text>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }}>
                {request.ticketNumber}
                <Text style={{ color: theme.subtext, fontWeight: "400" }}> · {request.requestedByName}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <Text style={{ color: theme.subtext, fontSize: 22 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ backgroundColor: theme.background, borderWidth: 1, borderColor: theme.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 }}>
              <Text style={{ color: theme.subtext, fontSize: 14, lineHeight: 20 }}>
                Adjust quantities per item based on available stock. Skipped items won't be deducted.{" "}
                <Text style={{ color: theme.text, fontWeight: "700" }}>Approve all</Text> fulfills every item at the requested qty.
              </Text>
            </View>

            {error && (
              <View style={{ backgroundColor: "#fef2f2", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: "#b91c1c", fontSize: 14 }}>{error}</Text>
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
                        borderRadius: 14,
                        padding: 16,
                        opacity: line.skipped ? 0.5 : 1,
                      }}
                    >
                      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                        <View style={{ flex: 1, marginRight: 8 }}>
                          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }} numberOfLines={1}>
                            {line.item.itemName}
                          </Text>
                          <Text style={{ color: theme.subtext, fontSize: 13 }}>{line.item.itemCode}</Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => toggleSkip(line.item.itemId)}
                          disabled={isOutOfStock}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 9,
                            borderWidth: 1,
                            borderColor: theme.border,
                            backgroundColor: line.skipped ? theme.surface : "transparent",
                            alignItems: "center",
                            justifyContent: "center",
                            opacity: isOutOfStock ? 0.4 : 1,
                          }}
                        >
                          <Text style={{ color: line.skipped ? theme.primary : "#f87171", fontSize: 19, fontWeight: "700" }}>
                            {line.skipped ? "+" : "–"}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ flexDirection: "row", alignItems: "center", gap: 18 }}>
                        <View>
                          <Text style={{ color: theme.subtext, fontSize: 12, textTransform: "uppercase" }}>Requested</Text>
                          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "600" }}>{line.item.quantityRequested}</Text>
                        </View>

                        <View>
                          <Text style={{ color: theme.subtext, fontSize: 12, textTransform: "uppercase" }}>In stock</Text>
                          <Text style={{ color: stockColor(line.liveStock, line.item.quantityRequested), fontSize: 17, fontWeight: "700" }}>
                            {line.liveStock}
                          </Text>
                          {isOutOfStock ? (
                            <Text style={{ color: "#f87171", fontSize: 12 }}>none</Text>
                          ) : isShortStock ? (
                            <Text style={{ color: "#fb923c", fontSize: 12 }}>short</Text>
                          ) : null}
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ color: theme.subtext, fontSize: 12, textTransform: "uppercase", marginBottom: 5 }}>Dispense</Text>
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
                              borderRadius: 9,
                              paddingHorizontal: 12,
                              paddingVertical: 10,
                              fontSize: 16,
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
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 14 }}>
                    <Text style={{ color: theme.subtext, fontSize: 14, marginBottom: 5 }}>
                      {activeLines.length} of {lines.length} item{lines.length !== 1 ? "s" : ""} will be dispensed
                      {somePartial ? <Text style={{ color: "#fb923c" }}> (partial quantities)</Text> : null}
                    </Text>
                    <Text style={{ color: theme.subtext, fontSize: 14 }}>
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

          <View style={{ borderTopWidth: 1, borderTopColor: theme.border, padding: 16, gap: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                style={{ flex: 1, borderWidth: 1, borderColor: theme.border, borderRadius: 10, paddingVertical: 14, alignItems: "center" }}
              >
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleReject}
                disabled={submitting || loading}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: "#fca5a5",
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: submitting || loading ? 0.6 : 1,
                }}
              >
                <Text style={{ color: "#ef4444", fontSize: 15, fontWeight: "600" }}>{submitting ? "Saving…" : "Reject"}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={handleApproveAll}
                disabled={submitting || loading}
                style={{
                  flex: 1,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: submitting || loading ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600" }}>{submitting ? "Saving…" : "Approve all"}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApprovePartial}
                disabled={submitting || loading || !hasAnyActive}
                style={{
                  flex: 1,
                  backgroundColor: theme.primary,
                  borderRadius: 10,
                  paddingVertical: 14,
                  alignItems: "center",
                  opacity: submitting || loading || !hasAnyActive ? 0.6 : 1,
                }}
              >
                <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 15, fontWeight: "600" }}>{approveLabel}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Request Detail Modal ────────────────────────────────────────────────

function RequestDetailModal({
  request,
  liveStock,
  onClose,
  theme,
}: {
  request: SupplyRequest | null;
  liveStock: Record<string, StockStatus>;
  onClose: () => void;
  theme: any;
}) {
  const statusColors = request ? statusBadgeColors(request.status) : { bg: "transparent", fg: "transparent" };
  const totalQty = request ? request.items.reduce((s, i) => s + i.quantityRequested, 0) : 0;
  const history = request ? buildActivity(request) : [];

  return (
    <Modal visible={request !== null} transparent animationType="none" onRequestClose={onClose}>
      {!request ? (
        <View style={{ flex: 1 }} />
      ) : (
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: 20 }}>
        <TouchableOpacity activeOpacity={1} onPress={onClose} style={StyleSheet.absoluteFill} />
        <View
          style={{
            backgroundColor: theme.background,
            borderRadius: 16,
            maxHeight: "85%",
            overflow: "hidden",
          }}
        >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                backgroundColor: ITEM_ICON_COLOR,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z" />
                <Path d="M10 21.9V14L2.1 9.1" />
                <Path d="m10 14 11.9-6.9" />
                <Path d="M14 19.8v-8.1" />
                <Path d="M18 17.5V9.4" />
              </Svg>
            </View>
            <Badge label={statusLabel(request.status)} colors={statusColors} />
          </View>

          <Text style={{ color: theme.text, fontSize: 22, fontWeight: "700", marginBottom: 10 }}>
            {itemSummary(request.items).primaryLabel}
          </Text>

          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 20 }}>
            <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "600" }}>
              #{request.ticketNumber.replace(/^SR-\d+-/, "")}
            </Text>
            <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "600" }}>
              {formatDate(request.createdAt)}
            </Text>
          </View>

          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700", marginBottom: 10 }}>Details</Text>
          <View
            style={{
              backgroundColor: theme.surface,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 14,
              padding: 16,
              marginBottom: 22,
              gap: 12,
            }}
          >
            {[
              ["Requested by", request.requestedByName],
              ["Date Requested", formatDate(request.createdAt)],
              ["Total items", String(request.items.length)],
              ["Total Qty.", String(totalQty)],
            ].map(([label, value]) => (
              <View key={label} style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.subtext, fontSize: 15 }}>{label}</Text>
                <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "600" }}>{value}</Text>
              </View>
            ))}
          </View>

          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700", marginBottom: 10 }}>
            Items ({request.items.length})
          </Text>
          <View style={{ gap: 10, marginBottom: 22 }}>
            {request.items.map((item) => {
              const itemStock = worstStockStatus([item], liveStock);
              return (
                <View
                  key={item.itemId}
                  style={{
                    backgroundColor: theme.surface,
                    borderWidth: 1,
                    borderColor: theme.border,
                    borderRadius: 14,
                    padding: 16,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", flex: 1 }} numberOfLines={1}>
                      {item.itemName}
                    </Text>
                    <Text style={{ color: theme.primary, fontSize: 15, fontWeight: "600" }}>
                      x{item.quantityRequested}
                    </Text>
                  </View>
                  <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <Text style={{ color: theme.subtext, fontSize: 13 }}>
                      {item.itemCode}
                      {item.category ? ` - ${item.category}` : ""}
                    </Text>
                    <Badge label={stockLabel(itemStock)} colors={stockBadgeColors(itemStock)} />
                  </View>
                </View>
              );
            })}
          </View>

          {request.notes ? (
            <>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 8 }}>Notes</Text>
              <View
                style={{
                  backgroundColor: theme.surface,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 18,
                }}
              >
                <Text style={{ color: theme.subtext, fontSize: 12 }}>{request.notes}</Text>
              </View>
            </>
          ) : null}

          {history.length > 0 && (
            <>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700", marginBottom: 12 }}>Activity</Text>
              <View style={{ marginBottom: 22 }}>
                {history.map((entry, idx) => (
                  <View key={`${entry.kind}-${entry.timestamp}-${idx}`} style={{ flexDirection: "row", gap: 12 }}>
                    <View style={{ alignItems: "center", width: 12 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: theme.primary, marginTop: 5 }} />
                      {idx < history.length - 1 && (
                        <View style={{ flex: 1, width: 1, borderStyle: "dashed", borderLeftWidth: 1, borderColor: theme.border, marginTop: 2 }} />
                      )}
                    </View>
                    <View style={{ flex: 1, paddingBottom: 18 }}>
                      <Text style={{ color: theme.text, fontSize: 15 }}>
                        {activityVerb(entry.kind)}
                        {entry.actorName ? (
                          <Text style={{ color: theme.primary, fontWeight: "600" }}> {entry.actorName}</Text>
                        ) : null}
                      </Text>
                      <Text style={{ color: theme.subtext, fontSize: 13, marginTop: 3 }}>{formatDate(entry.timestamp)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.border }}>
          <TouchableOpacity
            onPress={onClose}
            style={{ backgroundColor: theme.surface, borderRadius: 12, paddingVertical: 15, alignItems: "center" }}
          >
            <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }}>Back</Text>
          </TouchableOpacity>
        </View>
        </View>
      </View>
      )}
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function SupplyRequestsPage({ user, initialApprovalRequest, onApprovalModalOpened }: Props) {
  const { theme } = useTheme();
  const [filterMenuVisible, setFilterMenuVisible] = React.useState(false);
  const {
    pageTab, setPageTab,
    loading,
    search, setSearch,
    statusFilter, setStatusFilter,
    delivFilter, setDelivFilter,
    detailRequest, setDetailRequest,
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
    notYetIssuedCount,
    handleApproveAll,
    handleApprovePartial,
    handleMarkDelivered,
    handleReject,
  } = useSupplyRequestsData({ user, initialApprovalRequest, onApprovalModalOpened });

  const handleApprove = React.useCallback((x: SupplyRequest) => setApprovalTarget(x), [setApprovalTarget]);
  const handleView = React.useCallback((x: SupplyRequest) => setDetailRequest(x), [setDetailRequest]);
  const handleFail = React.useCallback((x: SupplyRequest) => setFailTarget(x), [setFailTarget]);
  const handleCloseDetail = React.useCallback(() => setDetailRequest(null), [setDetailRequest]);
  const handleCloseApproval = React.useCallback(() => setApprovalTarget(null), [setApprovalTarget]);

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
            ? `${filteredRequests.length} of ${filteredRequests.length} Requests`
            : `${filteredDeliveries.length} Deliveries`}
        </Text>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              borderWidth: 1,
              borderRadius: 14,
              paddingHorizontal: 12,
            }}
          >
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={theme.subtext} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
              <Circle cx={11} cy={11} r={8} />
              <Path d="m21 21-4.34-4.34" />
            </Svg>
            <TextInput
              placeholder="Search by name, item, category"
              placeholderTextColor={theme.subtext}
              value={search}
              onChangeText={setSearch}
              style={{
                flex: 1,
                color: theme.inputText,
                paddingVertical: 10,
                fontSize: 13,
              }}
            />
          </View>
          <TouchableOpacity
            onPress={() => setFilterMenuVisible(true)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.inputBorder,
              backgroundColor: theme.inputBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SlidersHorizontal color={theme.primary} size={18} />
          </TouchableOpacity>
        </View>

        <View
          style={{
            flexDirection: "row",
            marginBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}
        >
          {(["requests", "deliveries"] as const).map((tab) => {
            const badgeCount = tab === "requests" ? notYetIssuedCount : pendingDeliveryCount;
            const active = pageTab === tab;
            return (
              <TouchableOpacity
                key={tab}
                onPress={() => setPageTab(tab)}
                style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingBottom: 10 }}
              >
                <Text
                  style={{
                    color: active ? theme.text : theme.subtext,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  {tab === "requests" ? "Requests" : "Deliveries"}
                </Text>
                {badgeCount > 0 && (
                  <View
                    style={{
                      backgroundColor: tab === "requests" ? theme.primary : "#16a34a",
                      borderRadius: 999,
                      minWidth: 20,
                      height: 20,
                      paddingHorizontal: 6,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{badgeCount}</Text>
                  </View>
                )}
                {active && (
                  <View
                    style={{
                      position: "absolute",
                      bottom: -1,
                      left: 0,
                      right: 0,
                      height: 2,
                      backgroundColor: theme.primary,
                    }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {error ? (
          <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <Text style={{ color: "#b91c1c", fontSize: 12 }}>⚠ {error}</Text>
          </View>
        ) : null}
      </View>

      {pageTab === "requests" ? (
        <FlatList
          data={filteredRequests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}
          renderItem={({ item: r }) => (
            <RequestCard
              request={r}
              liveStock={liveStock}
              onApprove={handleApprove}
              onView={handleView}
              onDeliver={handleMarkDelivered}
              onFail={handleFail}
              approvingId={approvingId}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
              No requests found.
            </Text>
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
        />
      ) : (
        <FlatList
          data={filteredDeliveries}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}
          renderItem={({ item: r }) => (
            <DeliveryCard
              request={r}
              onDeliver={handleMarkDelivered}
              onFail={handleFail}
              onView={handleView}
              actionId={delivActionId}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
              No deliveries found.
            </Text>
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
        />
      )}

      <Modal visible={filterMenuVisible} transparent animationType="fade" onRequestClose={() => setFilterMenuVisible(false)}>
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setFilterMenuVisible(false)}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 170, paddingRight: 16 }}
        >
          <View
            style={{
              backgroundColor: theme.surface,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.border,
              paddingVertical: 8,
              width: 200,
            }}
          >
            {(pageTab === "requests" ? REQUEST_STATUS_TABS : DELIVERY_STATUS_TABS).map((tab) => {
              const active = pageTab === "requests" ? statusFilter === tab.value : delivFilter === tab.value;
              return (
                <TouchableOpacity
                  key={tab.value}
                  onPress={() => {
                    if (pageTab === "requests") setStatusFilter(tab.value as any);
                    else setDelivFilter(tab.value as any);
                    setFilterMenuVisible(false);
                  }}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    backgroundColor: active ? (theme.primarySubtle ?? theme.background) : "transparent",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: active ? "700" : "500",
                      color: active ? theme.primary : theme.text,
                    }}
                  >
                    {tab.label}
                  </Text>
                  {active && (
                    <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>✓</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <PartialApprovalNativeModal
        visible={approvalTarget !== null}
        request={approvalTarget}
        onClose={handleCloseApproval}
        onApproveAll={handleApproveAll}
        onApprovePartial={handleApprovePartial}
        onReject={handleReject}
        theme={theme}
      />

      <RequestDetailModal
        request={detailRequest}
        liveStock={liveStock}
        onClose={handleCloseDetail}
        theme={theme}
      />

      {/* Reject modal, failed-delivery modal, and archive modal are
          web-only <div>-based components in this pass — they'll throw
          on native if rendered. Build native versions of these (or a
          shared cross-platform modal primitive) before shipping this to
          mobile; for now they're intentionally omitted here. */}
    </View>
  );
}