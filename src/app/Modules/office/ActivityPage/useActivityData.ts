import { useCallback, useEffect, useMemo, useState } from "react";
import { StockTransaction } from "../../../../../types";
import {
  getAllInventoryItems,
  getAllStockTransactions,
} from "../../../../services/Officeinventory";

// ─── Action badge config ──────────────────────────────────────────────────────

export const ACTION_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  item_created: {
    label: "Item Added",
    bg: "#ede9fe",
    text: "#5b21b6",
    border: "#ddd6fe",
  },
  delivery: {
    label: "Delivery",
    bg: "#dcfce7",
    text: "#15803d",
    border: "#bbf7d0",
  },
  manual_adjustment: {
    label: "Manual adj.",
    bg: "#e2e8f0",
    text: "#334155",
    border: "#cbd5e1",
  },
  supply_request_fulfilled: {
    label: "Approved",
    bg: "#dbeafe",
    text: "#1d4ed8",
    border: "#bfdbfe",
  },
  ticket_deduction: {
    label: "Ticket",
    bg: "#fef3c7",
    text: "#92400e",
    border: "#fde68a",
  },
  supply_request_rejected: {
    label: "Rejected",
    bg: "#fee2e2",
    text: "#b91c1c",
    border: "#fecaca",
  },
  item_archived: {
    label: "Archived",
    bg: "#f1f5f9",
    text: "#475569",
    border: "#cbd5e1",
  },
  item_restored: {
    label: "Restored",
    bg: "#dbeafe",
    text: "#1d4ed8",
    border: "#bfdbfe",
  },
  item_deleted: {
    label: "Deleted",
    bg: "#fee2e2",
    text: "#b91c1c",
    border: "#fecaca",
  },
};

export function getActionConfig(type: string) {
  return (
    ACTION_CONFIG[type] ?? {
      label: type,
      bg: "#f1f5f9",
      text: "#475569",
      border: "#e2e8f0",
    }
  );
}

export const ACTION_FILTER_OPTIONS = [
  { label: "All actions", value: "all" },
  { label: "Item Added", value: "item_created" },
  { label: "Delivery", value: "delivery" },
  { label: "Manual adjustment", value: "manual_adjustment" },
  { label: "Supply request approved", value: "supply_request_fulfilled" },
  { label: "Ticket deduction", value: "ticket_deduction" },
  { label: "Supply request rejected", value: "supply_request_rejected" },
  { label: "Item archived", value: "item_archived" },
  { label: "Item restored", value: "item_restored" },
  { label: "Item deleted", value: "item_deleted" },
];

// ─── Formatters ─────────────────────────────────────────────────────────────

export function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export function formatDateTimeFull(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })
  );
}

export function formatQty(
  tx: StockTransaction,
  unitMap: Record<string, string>,
): string {
  const sign = tx.quantityChange > 0 ? "+" : "";
  const unit = unitMap[tx.itemId];
  return unit
    ? `${sign}${tx.quantityChange} ${unit}`
    : `${sign}${tx.quantityChange}`;
}

export function deriveRef(tx: StockTransaction): string {
  const match = tx.reason?.match(/SR-\d{4}-\d{4,}/);
  if (match) return match[0];
  const prefix =
    tx.type === "delivery"
      ? "DEL"
      : tx.type === "manual_adjustment"
        ? "ADJ"
        : tx.type === "supply_request_fulfilled"
          ? "SR"
          : tx.type === "item_archived"
            ? "ARC"
            : tx.type === "item_restored"
              ? "RST"
              : tx.type === "item_deleted"
                ? "DEL"
                : "TXN";
  return `${prefix}-${tx.id.slice(0, 6).toUpperCase()}`;
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

export function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
  { bg: "#ffedd5", text: "#9a3412" },
];

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Builds a CSV string from transactions. Platform-agnostic — no Blob/DOM
 * usage — so both web (wrap in a Blob + <a download>) and native (Share.share
 * or write-to-file) can reuse it.
 */
export function buildActivityCsv(
  rows: StockTransaction[],
  unitMap: Record<string, string>,
): string {
  const headers = [
    "Date",
    "Action",
    "Item",
    "Item Code",
    "Qty Change",
    "Stock Before",
    "Stock After",
    "Price/Unit",
    "Total Amount",
    "Performed By",
    "Reason",
    "Ref",
  ];
  const lines = rows.map((tx) =>
    [
      formatDateTime(tx.createdAt),
      getActionConfig(tx.type).label,
      tx.itemName,
      tx.itemCode,
      String(tx.quantityChange),
      String(tx.stockBefore),
      String(tx.stockAfter),
      formatPeso(tx.pricePerUnit),
      formatPeso(tx.totalAmount),
      tx.performedByName,
      (tx.reason ?? "").replace(/"/g, '""'),
      deriveRef(tx),
    ]
      .map((v) => `"${v}"`)
      .join(","),
  );
  return [headers.join(","), ...lines].join("\n");
}

export function activityCsvFilename(): string {
  return `activity_log_${new Date().toISOString().split("T")[0]}.csv`;
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useActivityData() {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState<StockTransaction | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [txs, items] = await Promise.all([
        getAllStockTransactions(),
        getAllInventoryItems(),
      ]);
      setTransactions(txs);
      const map: Record<string, string> = {};
      items.forEach((i) => (map[i.id] = i.unit));
      setUnitMap(map);
    } catch (err) {
      console.error("Failed to load activity log:", err);
      setError("Failed to load activity log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let result = transactions;
    if (actionFilter !== "all") {
      result = result.filter((tx) => tx.type === actionFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((tx) =>
        [tx.itemName, tx.itemCode, tx.performedByName, tx.reason ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return result;
  }, [transactions, actionFilter, search]);

  return {
    transactions,
    unitMap,
    loading,
    error,
    search,
    setSearch,
    actionFilter,
    setActionFilter,
    selectedTx,
    setSelectedTx,
    filtered,
    loadData,
  };
}
