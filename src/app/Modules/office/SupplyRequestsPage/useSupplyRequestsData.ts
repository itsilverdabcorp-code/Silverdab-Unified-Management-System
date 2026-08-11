import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { Platform } from "react-native";
import { ADUser, SupplyRequest } from "../../../../../types";
import {
  getAllSupplyRequests,
  approveSupplyRequest,
  approveSupplyRequestPartial,
  rejectSupplyRequest,
  markDelivered,
  markFailedDelivery,
  archiveSupplyRequest,
} from "../../../../services/supplyRequest";
import { getAllInventoryItems } from "../../../../services/Officeinventory";

// ─── Types ────────────────────────────────────────────────────────────────

export type PageTab = "requests" | "deliveries";
export type StatusFilter =
  | "all"
  | "pending"
  | "awaiting_stock"
  | "out_for_delivery"
  | "resolved"
  | "unfulfilled";
export type StockStatus = "available" | "low" | "out_of_stock";
export type DeliveryFilter = "all" | "out_for_delivery" | "resolved" | "failed_delivery";

// ─── Status config ────────────────────────────────────────────────────────

export const REQUEST_STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Awaiting stock", value: "awaiting_stock" },
  { label: "Out for delivery", value: "out_for_delivery" },
  { label: "Issued", value: "resolved" },
  { label: "Unfulfilled", value: "unfulfilled" },
];

export const DELIVERY_STATUS_TABS: { label: string; value: DeliveryFilter }[] = [
  { label: "All", value: "all" },
  { label: "For delivery", value: "out_for_delivery" },
  { label: "Issued", value: "resolved" },
  { label: "Failed", value: "failed_delivery" },
];

export const REQUEST_HEADERS = [
  "Ticket #",
  "Requested by",
  "Item",
  "Qty",
  "Date filed",
  "Stock status",
  "Status",
  "",
];
export const DELIVERY_HEADERS = [
  "Ticket #",
  "Deliver to",
  "Item",
  "Qty",
  "Approved at",
  "Status",
  "",
];

// ─── Badge / label helpers (colors used by both platforms) ────────────────

export function statusBadgeColors(status: string): { bg: string; fg: string } {
  switch (status) {
    case "pending":
      return { bg: "#e0f2fe", fg: "#0369a1" };
    case "awaiting_stock":
      return { bg: "#fef3c7", fg: "#b45309" };
    case "out_for_delivery":
      return { bg: "#dbeafe", fg: "#1d4ed8" };
    case "resolved":
      return { bg: "#d1fae5", fg: "#047857" };
    case "failed_delivery":
      return { bg: "#ffedd5", fg: "#c2410c" };
    case "rejected":
      return { bg: "#ffe4e6", fg: "#be123c" };
    case "cancelled":
      return { bg: "#f3e8ff", fg: "#7e22ce" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

export function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "awaiting_stock":
      return "Awaiting stock";
    case "out_for_delivery":
      return "Out for delivery";
    case "resolved":
      return "Issued";
    case "failed_delivery":
      return "Failed delivery";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function stockBadgeColors(status: StockStatus): { bg: string; fg: string } {
  switch (status) {
    case "available":
      return { bg: "#d1fae5", fg: "#047857" };
    case "low":
      return { bg: "#fef3c7", fg: "#b45309" };
    case "out_of_stock":
      return { bg: "#ffe4e6", fg: "#be123c" };
    default:
      return { bg: "#f3f4f6", fg: "#374151" };
  }
}

export function stockLabel(status: StockStatus): string {
  switch (status) {
    case "available":
      return "In stock";
    case "low":
      return "Low stock";
    case "out_of_stock":
      return "Out of stock";
    default:
      return status;
  }
}

export function worstStockStatus(
  items: SupplyRequest["items"],
  liveStock?: Record<string, StockStatus>,
): StockStatus {
  const effective = (i: SupplyRequest["items"][number]): StockStatus =>
    (liveStock?.[i.itemId] as StockStatus) ??
    (i.stockStatusAtRequest as StockStatus);

  if (items.some((i) => effective(i) === "out_of_stock")) return "out_of_stock";
  if (items.some((i) => effective(i) === "low")) return "low";
  return "available";
}

export function toRequestStockStatus(inventoryStockStatus: string): StockStatus {
  switch (inventoryStockStatus) {
    case "in_stock":
      return "available";
    case "low_stock":
      return "low";
    case "out_of_stock":
      return "out_of_stock";
    default:
      return inventoryStockStatus as StockStatus;
  }
}

export function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

export function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export function effectiveItems(items: SupplyRequest["items"]) {
  const anyReviewed = items.some(
    (i) => i.quantityApproved !== null && i.quantityApproved !== undefined,
  );
  if (!anyReviewed) return items;
  return items.filter((i) => (i.quantityApproved ?? 0) > 0);
}

export function displayQty(item: SupplyRequest["items"][number]): number {
  return item.quantityApproved ?? item.quantityRequested;
}

export function itemSummary(items: SupplyRequest["items"]) {
  const active = effectiveItems(items);
  if (active.length === 0)
    return { primaryLabel: "—", extraCount: 0, qtyLabel: "—" };
  const first = active[0];
  return {
    primaryLabel: first.itemName,
    extraCount: active.length - 1,
    qtyLabel:
      active.length === 1
        ? String(displayQty(first))
        : `${active.length} items`,
  };
}

export function effectiveStatus(
  r: SupplyRequest,
  liveStock?: Record<string, StockStatus>,
): string {
  if (r.status === "pending" || r.status === "awaiting_stock") {
    return worstStockStatus(r.items, liveStock) === "out_of_stock"
      ? "awaiting_stock"
      : "pending";
  }
  return r.status;
}

const STATUS_SORT_ORDER: Record<string, number> = {
  pending: 0,
  out_for_delivery: 1,
  awaiting_stock: 2,
  resolved: 3,
  failed_delivery: 3,
  rejected: 3,
  cancelled: 3,
};

export const UNFULFILLED_STATUSES = new Set([
  "rejected",
  "failed_delivery",
  "cancelled",
]);

export function closureDate(r: SupplyRequest): string {
  switch (r.status) {
    case "cancelled":
      return r.cancelledAt || r.createdAt;
    case "rejected":
      return r.reviewedAt || r.createdAt;
    case "failed_delivery":
      return r.failedAt || r.createdAt;
    case "resolved":
      return r.resolvedAt || r.createdAt;
    default:
      return r.createdAt;
  }
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useSupplyRequestsData({
  user,
  initialApprovalRequest,
  onApprovalModalOpened,
}: {
  user?: ADUser;
  initialApprovalRequest?: SupplyRequest | null;
  onApprovalModalOpened?: () => void;
}) {
  const [pageTab, setPageTab] = useState<PageTab>("requests");
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [delivFilter, setDelivFilter] = useState<DeliveryFilter>("out_for_delivery");
  const [detailRequest, setDetailRequest] = useState<SupplyRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SupplyRequest | null>(null);
  const [failTarget, setFailTarget] = useState<SupplyRequest | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<SupplyRequest | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SupplyRequest | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [delivActionId, setDelivActionId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [failing, setFailing] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [liveStock, setLiveStock] = useState<Record<string, StockStatus>>({});
  const isFirstLoad = useRef(true);

  const loadRequests = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    else setRefreshing(true);
    try {
      const [data, items] = await Promise.all([
        getAllSupplyRequests(),
        getAllInventoryItems().catch((err) => {
          console.warn("Could not fetch live inventory for status check:", err);
          return [];
        }),
      ]);
      setRequests(data);
      setLiveStock(
        Object.fromEntries(
          items.map((it) => [it.id, toRequestStockStatus(it.stockStatus)]),
        ),
      );
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load supply requests.");
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initialApprovalRequest) {
      setApprovalTarget(initialApprovalRequest);
      onApprovalModalOpened?.();
    }
  }, [initialApprovalRequest]);

  useEffect(() => {
    loadRequests();

    const POLL_INTERVAL_MS = 8_000;
    const intervalId = setInterval(loadRequests, POLL_INTERVAL_MS);

    // Web-only: refresh when the tab regains focus. Guarded so it's a no-op
    // on native, where `window` isn't the right focus signal (and may not
    // exist at all).
    let removeFocusListener: (() => void) | undefined;
    if (Platform.OS === "web" && typeof window !== "undefined") {
      const onFocus = () => loadRequests();
      window.addEventListener("focus", onFocus);
      removeFocusListener = () => window.removeEventListener("focus", onFocus);
    }

    return () => {
      clearInterval(intervalId);
      removeFocusListener?.();
    };
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    let r = requests;
    if (statusFilter === "unfulfilled") {
      r = r.filter((x) => UNFULFILLED_STATUSES.has(x.status));
    } else if (statusFilter !== "all") {
      r = r.filter((x) => effectiveStatus(x, liveStock) === statusFilter);
    }
    const q = search.trim().toLowerCase();
    if (q)
      r = r.filter((x) =>
        [
          x.ticketNumber,
          x.requestedByName,
          ...x.items.map((i) => i.itemName),
          ...x.items.map((i) => i.itemCode),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );

    return [...r].sort((a, b) => {
      const pa = STATUS_SORT_ORDER[effectiveStatus(a, liveStock)] ?? 99;
      const pb = STATUS_SORT_ORDER[effectiveStatus(b, liveStock)] ?? 99;
      if (pa !== pb) return pa - pb;
      return (
        new Date(closureDate(b)).getTime() - new Date(closureDate(a)).getTime()
      );
    });
  }, [requests, statusFilter, search, liveStock]);

  const filteredDeliveries = useMemo(() => {
    let r = requests.filter((x) =>
      ["out_for_delivery", "resolved", "failed_delivery"].includes(x.status),
    );
    if (delivFilter !== "all") r = r.filter((x) => x.status === delivFilter);
    const q = search.trim().toLowerCase();
    if (q)
      r = r.filter((x) =>
        [x.ticketNumber, x.requestedByName, ...x.items.map((i) => i.itemName)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    return r;
  }, [requests, delivFilter, search]);

  const requestCounts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    requests.forEach((r) => {
      const s = effectiveStatus(r, liveStock);
      c[s] = (c[s] ?? 0) + 1;
    });
    c.unfulfilled = requests.filter((r) => UNFULFILLED_STATUSES.has(r.status)).length;
    return c;
  }, [requests, liveStock]);

  const delivCounts = useMemo(() => {
    const base = requests.filter((x) =>
      ["out_for_delivery", "delivered", "failed_delivery"].includes(x.status),
    );
    return {
      all: base.length,
      out_for_delivery: base.filter((x) => x.status === "out_for_delivery").length,
      resolved: base.filter((x) => x.status === "resolved").length,
      failed_delivery: base.filter((x) => x.status === "failed_delivery").length,
    };
  }, [requests]);

  const pendingDeliveryCount = requests.filter(
    (x) => x.status === "out_for_delivery",
  ).length;

  const handleApproveAll = async (request: SupplyRequest) => {
    setApprovingId(request.id);
    setError("");
    try {
      await approveSupplyRequest(request.id);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve request.");
      throw err;
    } finally {
      setApprovingId(null);
    }
  };

  const handleApprovePartial = async (
    requestId: string,
    lines: { itemId: string; qtyToDispense: number }[],
  ) => {
    setApprovingId(requestId);
    setError("");
    try {
      await approveSupplyRequestPartial(requestId, lines);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve request.");
      throw err;
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    setError("");
    try {
      await rejectSupplyRequest(rejectTarget.id, reason);
      setRejectTarget(null);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to reject request.");
    } finally {
      setRejecting(false);
    }
  };

  const handleMarkDelivered = async (request: SupplyRequest) => {
    setDelivActionId(request.id);
    setError("");
    try {
      await markDelivered(request.id, user?.displayName ?? "Technician");
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to mark as delivered.");
    } finally {
      setDelivActionId(null);
    }
  };

  const handleConfirmFailed = async (reason: string) => {
    if (!failTarget) return;
    setFailing(true);
    setError("");
    try {
      await markFailedDelivery(
        failTarget.id,
        reason,
        user?.displayName ?? "Technician",
      );
      setFailTarget(null);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update delivery status.");
    } finally {
      setFailing(false);
    }
  };

  const handleReject = (requestId: string) => {
    const request = requests.find((r) => r.id === requestId);
    if (!request) return;
    setApprovalTarget(null);
    setTimeout(() => setRejectTarget(request), 100);
  };

  const handleArchive = (request: SupplyRequest) => {
    setArchiveTarget(request);
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setError("");
    try {
      await archiveSupplyRequest(archiveTarget.id);
      setArchiveTarget(null);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to archive request.");
    } finally {
      setArchiving(false);
    }
  };

  return {
    pageTab, setPageTab,
    requests,
    loading,
    refreshing,
    search, setSearch,
    statusFilter, setStatusFilter,
    delivFilter, setDelivFilter,
    detailRequest, setDetailRequest,
    rejectTarget, setRejectTarget,
    failTarget, setFailTarget,
    approvalTarget, setApprovalTarget,
    approvingId,
    archiveTarget, setArchiveTarget,
    archiving,
    delivActionId,
    rejecting,
    failing,
    error,
    liveStock,
    filteredRequests,
    filteredDeliveries,
    requestCounts,
    delivCounts,
    pendingDeliveryCount,
    handleApproveAll,
    handleApprovePartial,
    handleConfirmReject,
    handleMarkDelivered,
    handleConfirmFailed,
    handleReject,
    handleArchive,
    handleConfirmArchive,
  };
}