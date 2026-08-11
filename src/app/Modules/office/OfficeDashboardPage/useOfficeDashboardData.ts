import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OfficeInventoryItem,
  StockTransaction,
  SupplyRequest,
} from "../../../../../types";
import {
  getAllInventoryItems,
  getAllStockTransactions,
} from "../../../../services/Officeinventory";
import { getAllSupplyRequests } from "../../../../services/supplyRequest";

// ─── Types ────────────────────────────────────────────────────────────────────

export type NavTarget =
  | "inventory"
  | "supply_requests"
  | "monthly_report"
  | "activity";

export type NavPayload = {
  tab: NavTarget | "inventory_deliver";
  approvalRequest?: SupplyRequest;
  deliverItem?: OfficeInventoryItem;
};

export type DashboardInventoryFilter = {
  field: keyof OfficeInventoryItem;
  value: string;
} | null;

export type MobileTab = "attention" | "requests" | "activity";

// ─── Constants ──────────────────────────────────────────────────────────────

export const POLL_INTERVAL_MS = 5_000;
export const ATTENTION_DISPLAY_LIMIT = 10;

export const CATEGORY_LABELS: Record<string, string> = {
  office_supplies: "Office Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
};

export const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  office_supplies: { bg: "#dbeafe", text: "#1e40af" },
  cleaning: { bg: "#ede9fe", text: "#5b21b6" },
  ppe: { bg: "#fce7f3", text: "#9d174d" },
  medicine: { bg: "#ccfbf1", text: "#115e59" },
};

// Mirrors the _priority scores computed in priorityScore().
export const ATTENTION_FILTER_OPTIONS: { priority: number; label: string; dot: string }[] = [
  { priority: 0, label: "Out of stock — pending requests", dot: "#ef4444" },
  { priority: 1, label: "Out of stock — no requests", dot: "#ef4444" },
  { priority: 2, label: "Low stock — pending requests", dot: "#f59e0b" },
  { priority: 3, label: "Low stock", dot: "#f59e0b" },
  { priority: 4, label: "Recent activity", dot: "#3b82f6" },
];

export const CONSUMPTION_TYPES = new Set([
  "manual_adjustment",
  "supply_request_fulfilled",
  "ticket_deduction",
]);

// Flat hex fills for chart bars (recharts <Cell> on web, plain Views on native).
export const CHART_CATEGORY_FILL: Record<string, string> = {
  office_supplies: "#3b82f6",
  cleaning: "#f59e0b",
  ppe: "#a855f7",
  medicine: "#ef4444",
  pantry: "#10b981",
  other: "#64748b",
};

// Shorter than CATEGORY_LABELS — narrow axis/columns wrap mid-word otherwise.
export const CHART_CATEGORY_LABELS: Record<string, string> = {
  office_supplies: "Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
  pantry: "Pantry",
};

export const DASHBOARD_ITEMS_PER_PAGE = 6;
export const DASHBOARD_TREND_MONTHS = 6;
export const DASHBOARD_MAX_COMPARE_ITEMS = 6;
export const DASHBOARD_ITEM_COMPARE_COLORS = [
  "#3b82f6", "#f59e0b", "#a855f7", "#10b981", "#ef4444", "#06b6d4",
];

export const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
  { bg: "#ffedd5", text: "#9a3412" },
];

// Hex-based request-status styling, shared by web (as inline style, in
// place of the old Tailwind className map) and native (which can't use
// Tailwind classes at all).
export const REQUEST_STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "#e0f2fe", text: "#0369a1" },
  awaiting_stock: { bg: "#fef3c7", text: "#92400e" },
  out_for_delivery: { bg: "#dbeafe", text: "#1d4ed8" },
  resolved: { bg: "#d1fae5", text: "#065f46" },
  failed_delivery: { bg: "#fee2e2", text: "#991b1b" },
  rejected: { bg: "#fee2e2", text: "#991b1b" },
};

// label/bg/text only — no icon here, since the web icons are inline SVG JSX
// and native needs its own glyph per action type. Each platform supplies icons.
export const ACTIVITY_ACTION_STYLE: Record<string, { label: string; bg: string; text: string }> = {
  delivery: { label: "Delivery received", bg: "#dcfce7", text: "#15803d" },
  manual_adjustment: { label: "Stock adjusted", bg: "#e2e8f0", text: "#334155" },
  supply_request_fulfilled: { label: "Request approved", bg: "#dbeafe", text: "#1d4ed8" },
  ticket_deduction: { label: "Stock deducted", bg: "#fef3c7", text: "#92400e" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toISOString(val: any): string {
  if (!val) return "";
  if (typeof val?.toDate === "function") return val.toDate().toISOString();
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  return "";
}

export function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatDateTime(val: any): string {
  if (!val) return "—";
  const iso = toISOString(val);
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

export function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

export function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function effectiveStatus(r: SupplyRequest): string {
  const hasOutOfStock = r.items.some(
    (i) => i.stockStatusAtRequest === "out_of_stock",
  );
  if (r.status === "pending" && hasOutOfStock) return "awaiting_stock";
  return r.status;
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
      return "Delivered";
    case "failed_delivery":
      return "Failed delivery";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Consumption graph builders (mirrors MonthlyGraphsView's builders,
// scoped to the current calendar month + already-loaded transactions) ──────

export function buildDashboardConsumptionRows(
  items: OfficeInventoryItem[],
  transactions: StockTransaction[],
) {
  const thisMonth = currentMonthKey();
  const itemById = new Map(items.map((i) => [i.id, i]));
  const totals: Record<string, { consumed: number; amount: number }> = {};

  transactions.forEach((tx) => {
    if (!CONSUMPTION_TYPES.has(tx.type)) return;
    const dateStr = toISOString(tx.createdAt).slice(0, 10);
    if (!dateStr || dateStr.slice(0, 7) !== thisMonth) return;
    if (!totals[tx.itemId]) totals[tx.itemId] = { consumed: 0, amount: 0 };
    totals[tx.itemId].consumed += Math.abs(tx.quantityChange);
    totals[tx.itemId].amount += tx.totalAmount;
  });

  return Object.entries(totals)
    .map(([itemId, v]) => {
      const item = itemById.get(itemId);
      return {
        id: itemId,
        name: item?.name ?? "Unknown item",
        category: item?.category ?? "other",
        unit: item?.unit ?? "units",
        totalConsumed: v.consumed,
        consumptionAmount: v.amount,
      };
    })
    .filter((r) => r.totalConsumed > 0);
}

export function buildDashboardTopItems(
  rows: ReturnType<typeof buildDashboardConsumptionRows>,
) {
  // Full sorted list — paging happens in the component, not here, so the
  // same array can be sliced per page without re-sorting.
  return [...rows]
    .sort((a, b) => b.totalConsumed - a.totalConsumed)
    .map((r) => ({
      name: r.name,
      consumed: r.totalConsumed,
      category: r.category,
      unit: r.unit,
    }));
}

export function buildDashboardCategoryBreakdown(
  rows: ReturnType<typeof buildDashboardConsumptionRows>,
) {
  const byCategory: Record<string, number> = {};
  rows.forEach((r) => {
    byCategory[r.category] = (byCategory[r.category] ?? 0) + r.totalConsumed;
  });
  return Object.entries(byCategory)
    .map(([category, consumed]) => ({ category, consumed }))
    .sort((a, b) => b.consumed - a.consumed);
}

export function buildDashboardMonthlyTrend(
  transactions: StockTransaction[],
  itemIds: string[] = [],
) {
  const byMonth: Record<string, { qty: number; perItem: Record<string, number> }> = {};
  transactions.forEach((tx) => {
    if (!CONSUMPTION_TYPES.has(tx.type)) return;
    const dateStr = toISOString(tx.createdAt).slice(0, 10);
    if (!dateStr) return;
    const ym = dateStr.slice(0, 7);
    if (!byMonth[ym]) byMonth[ym] = { qty: 0, perItem: {} };
    byMonth[ym].qty += Math.abs(tx.quantityChange);
    if (itemIds.includes(tx.itemId)) {
      byMonth[ym].perItem[tx.itemId] =
        (byMonth[ym].perItem[tx.itemId] ?? 0) + Math.abs(tx.quantityChange);
    }
  });
  return Object.entries(byMonth)
    .sort(([a], [b]) => (a > b ? 1 : -1))
    .slice(-DASHBOARD_TREND_MONTHS)
    .map(([ym, v]) => {
      const [y, m] = ym.split("-").map(Number);
      const label =
        y && m
          ? new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short" })
          : ym;
      const row: { ym: string; label: string; qty: number; [key: string]: any } = {
        ym,
        label,
        qty: v.qty,
      };
      itemIds.forEach((id) => {
        row[id] = v.perItem[id] ?? 0;
      });
      return row;
    });
}

export function buildDashboardItemOptions(items: OfficeInventoryItem[]) {
  return [...items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({ id: i.id, name: i.name, itemCode: i.itemCode, unit: i.unit }));
}

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOfficeDashboardData() {
  const [items, setItems] = useState<OfficeInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const [attentionFilters, setAttentionFilters] = useState<Set<number>>(
    new Set([0, 1, 2, 3, 4]),
  );

  const [trendItemIds, setTrendItemIds] = useState<string[]>([]);
  const [trendItemSearch, setTrendItemSearch] = useState<string>("");

  const [topItemsPage, setTopItemsPage] = useState(0);

  const isFirstLoad = useRef(true);

  const loadAll = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    try {
      const [inv, txs, reqs] = await Promise.all([
        getAllInventoryItems(),
        getAllStockTransactions(),
        getAllSupplyRequests(),
      ]);
      setItems(inv);
      setTransactions(txs);
      setRequests(reqs);
    } catch (err) {
      console.error("Dashboard load error:", err);
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
    }
  }, []);

  // Base polling — safe on native (setInterval is a JS timer, not a DOM
  // API). Web additionally wires a window "focus" listener on top of this
  // in OfficeDashboardPage.web.tsx.
  useEffect(() => {
    loadAll();
    const intervalId = setInterval(loadAll, POLL_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [loadAll]);

  // ── KPIs ─────────────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const total = items.length;
    const inStock = items.filter((i) => i.stockStatus === "in_stock").length;
    const lowStock = items.filter((i) => i.stockStatus === "low_stock").length;
    const outOfStock = items.filter((i) => i.stockStatus === "out_of_stock").length;

    const pendingReqs = requests.filter(
      (r) =>
        r.status === "pending" ||
        r.status === "awaiting_stock" ||
        r.status === "out_for_delivery",
    ).length;

    const outOfStockWithPendingReqs = items.filter(
      (i) => i.stockStatus === "out_of_stock",
    );

    return { total, inStock, lowStock, outOfStock, pendingReqs, outOfStockWithPendingReqs };
  }, [items, requests]);

  // ── Consumption graphs ───────────────────────────────────────────────────

  const dashboardConsumptionRows = useMemo(
    () => buildDashboardConsumptionRows(items, transactions),
    [items, transactions],
  );
  const graphTopItemsAll = useMemo(
    () => buildDashboardTopItems(dashboardConsumptionRows),
    [dashboardConsumptionRows],
  );
  const topItemsTotalPages = Math.max(
    1,
    Math.ceil(graphTopItemsAll.length / DASHBOARD_ITEMS_PER_PAGE),
  );
  // Clamped, not stored — if the underlying list shrinks (e.g. a poll
  // refresh drops an item), the visible page adjusts automatically.
  const topItemsCurrentPage = Math.min(topItemsPage, topItemsTotalPages - 1);
  const graphTopItemsPage = useMemo(
    () =>
      graphTopItemsAll.slice(
        topItemsCurrentPage * DASHBOARD_ITEMS_PER_PAGE,
        (topItemsCurrentPage + 1) * DASHBOARD_ITEMS_PER_PAGE,
      ),
    [graphTopItemsAll, topItemsCurrentPage],
  );
  // Fixed across all pages so bar length is relative to the true max.
  const graphTopItemsMaxConsumed = useMemo(
    () => graphTopItemsAll.reduce((max, item) => Math.max(max, item.consumed), 0),
    [graphTopItemsAll],
  );
  const graphCategoryBreakdown = useMemo(
    () => buildDashboardCategoryBreakdown(dashboardConsumptionRows),
    [dashboardConsumptionRows],
  );
  const graphMonthlyTrend = useMemo(
    () => buildDashboardMonthlyTrend(transactions, trendItemIds),
    [transactions, trendItemIds],
  );
  const trendItemOptions = useMemo(() => buildDashboardItemOptions(items), [items]);
  const trendItemSearchResults = useMemo(() => {
    const q = trendItemSearch.trim().toLowerCase();
    if (!q) return trendItemOptions;
    return trendItemOptions.filter(
      (i) => i.name.toLowerCase().includes(q) || i.itemCode.toLowerCase().includes(q),
    );
  }, [trendItemSearch, trendItemOptions]);
  const selectedTrendItems = useMemo(
    () => trendItemOptions.filter((i) => trendItemIds.includes(i.id)),
    [trendItemOptions, trendItemIds],
  );

  const toggleTrendItem = useCallback((id: string) => {
    setTrendItemIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= DASHBOARD_MAX_COMPARE_ITEMS) return prev;
      return [...prev, id];
    });
  }, []);

  // ── Category breakdown (item counts, not consumption) ───────────────────

  const categoryBreakdown = useMemo(() => {
    const counts: Record<
      string,
      { total: number; inStock: number; lowStock: number; outOfStock: number }
    > = {};
    items.forEach((item) => {
      if (!counts[item.category])
        counts[item.category] = { total: 0, inStock: 0, lowStock: 0, outOfStock: 0 };
      counts[item.category].total++;
      if (item.stockStatus === "in_stock") counts[item.category].inStock++;
      else if (item.stockStatus === "low_stock") counts[item.category].lowStock++;
      else if (item.stockStatus === "out_of_stock") counts[item.category].outOfStock++;
    });
    return Object.entries(counts).map(([cat, c]) => ({ category: cat, ...c }));
  }, [items]);

  // ── Recent requests / activity ──────────────────────────────────────────

  const recentRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) => toISOString(b.createdAt).localeCompare(toISOString(a.createdAt)))
      .slice(0, 5);
  }, [requests]);

  const recentActivity = useMemo(() => {
    return [...transactions]
      .sort((a, b) => toISOString(b.createdAt).localeCompare(toISOString(a.createdAt)))
      .slice(0, 6);
  }, [transactions]);

  // ── Needs-attention inventory preview ───────────────────────────────────

  const inventoryPreview = useMemo(() => {
    const pendingItemIds = new Set(
      requests
        .filter((r) => r.status === "pending" || r.status === "awaiting_stock")
        .flatMap((r) => r.items.map((i) => i.itemId)),
    );

    const pendingCountByItemId = requests
      .filter((r) => r.status === "pending" || r.status === "awaiting_stock")
      .flatMap((r) => r.items.map((i) => i.itemId))
      .reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {});

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const recentlyActiveIds = new Set(
      transactions
        .filter((t) => toISOString(t.createdAt) >= sevenDaysAgo)
        .map((t) => t.itemId),
    );

    const priorityScore = (item: OfficeInventoryItem): number => {
      const hasPending = pendingItemIds.has(item.id);
      if (item.stockStatus === "out_of_stock" && hasPending) return 0;
      if (item.stockStatus === "out_of_stock") return 1;
      if (item.stockStatus === "low_stock" && hasPending) return 2;
      if (item.stockStatus === "low_stock") return 3;
      if (recentlyActiveIds.has(item.id)) return 4;
      return 5;
    };

    return [...items]
      .map((item) => ({
        ...item,
        _priority: priorityScore(item),
        _pendingCount: pendingCountByItemId[item.id] ?? 0,
      }))
      .filter((item) => item._priority < 5)
      .sort(
        (a, b) =>
          a._priority - b._priority ||
          a.currentStock - b.currentStock ||
          a.name.localeCompare(b.name),
      );
    // No slice here — this is the FULL set needing attention, across every
    // priority tier. Filtering happens first, then display is capped.
  }, [items, requests, transactions]);

  const filteredAttentionItems = useMemo(
    () => inventoryPreview.filter((item) => attentionFilters.has(item._priority)),
    [inventoryPreview, attentionFilters],
  );

  const visibleAttentionItems = useMemo(
    () => filteredAttentionItems.slice(0, ATTENTION_DISPLAY_LIMIT),
    [filteredAttentionItems],
  );

  const toggleAttentionFilter = useCallback((priority: number) => {
    setAttentionFilters((prev) => {
      const next = new Set(prev);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      return next;
    });
  }, []);

  const allFiltersOn = attentionFilters.size === ATTENTION_FILTER_OPTIONS.length;

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    items, transactions, requests, loading, loadAll, today,
    kpi, categoryBreakdown, recentRequests, recentActivity,
    dashboardConsumptionRows,
    graphTopItemsAll, graphTopItemsPage, graphTopItemsMaxConsumed,
    topItemsPage, setTopItemsPage, topItemsCurrentPage, topItemsTotalPages,
    graphCategoryBreakdown,
    graphMonthlyTrend,
    trendItemOptions, trendItemSearch, setTrendItemSearch, trendItemSearchResults,
    trendItemIds, setTrendItemIds, toggleTrendItem, selectedTrendItems,
    attentionFilters, setAttentionFilters, toggleAttentionFilter, allFiltersOn,
    inventoryPreview, filteredAttentionItems, visibleAttentionItems,
  };
}