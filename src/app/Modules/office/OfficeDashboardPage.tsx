// app/Admin/OfficeInventory/OfficeDashboardPage.tsx
//
// Mobile update: "Needs attention", "Pending requests", and "Recent activity"
// now collapse into a tab switcher below the `md` breakpoint instead of a
// fixed two-column layout. Desktop behavior is untouched — all three
// sections render simultaneously as before; only mobile gates visibility
// via activeMobileTab.

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ADUser,
  OfficeInventoryItem,
  StockTransaction,
  SupplyRequest,
} from "../../../../types";
import {
  getAllInventoryItems,
  getAllStockTransactions,
} from "../../../services/Officeinventory";
import { getAllSupplyRequests } from "../../../services/supplyRequest";
import { useTheme } from "../../../theme/ThemeContext";
import PartialApprovalModal from "./Modal/PartialApprovalModal"; // adjust path as needed
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

type NavTarget =
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

type Props = {
  user?: ADUser;
  onNavigate?: (tab: NavTarget, filter?: DashboardInventoryFilter) => void;
  onNavigateWithPayload?: (payload: NavPayload) => void;
};

type MobileTab = "attention" | "requests" | "activity";

const POLL_INTERVAL_MS = 5_000;
const ATTENTION_DISPLAY_LIMIT = 10;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISOString(val: any): string {
  if (!val) return "";
  if (typeof val?.toDate === "function") return val.toDate().toISOString();
  if (typeof val === "string") return val;
  if (val instanceof Date) return val.toISOString();
  return "";
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function formatDateTime(val: any): string {
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

function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0][0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}
const DISMISSED_ALERT_STORAGE_KEY = "officeDashboard.dismissedAlertSignature";

function readDismissedAlertSignature(): string | null {
  try {
    return localStorage.getItem(DISMISSED_ALERT_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeDismissedAlertSignature(signature: string): void {
  try {
    localStorage.setItem(DISMISSED_ALERT_STORAGE_KEY, signature);
  } catch {
    // localStorage unavailable (e.g. private browsing) — dismissal just
    // won't persist across refresh in that case, banner still works in-session.
  }
}

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
  { bg: "#ffedd5", text: "#9a3412" },
];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function effectiveStatus(r: SupplyRequest): string {
  const hasOutOfStock = r.items.some(
    (i) => i.stockStatusAtRequest === "out_of_stock",
  );
  if (r.status === "pending" && hasOutOfStock) return "awaiting_stock";
  return r.status;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-sky-100 text-sky-700";
    case "awaiting_stock":
      return "bg-amber-100 text-amber-700";
    case "out_for_delivery":
      return "bg-blue-100 text-blue-700";
    case "resolved":
      return "bg-emerald-100 text-emerald-700";
    case "failed_delivery":
      return "bg-rose-100 text-rose-700";
    case "rejected":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusLabel(status: string): string {
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

const CATEGORY_LABELS: Record<string, string> = {
  office_supplies: "Office Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  office_supplies: { bg: "#dbeafe", text: "#1e40af" },
  cleaning: { bg: "#ede9fe", text: "#5b21b6" },
  ppe: { bg: "#fce7f3", text: "#9d174d" },
  medicine: { bg: "#ccfbf1", text: "#115e59" },
};

// Mirrors the _priority scores computed in inventoryPreview's priorityScore().
const ATTENTION_FILTER_OPTIONS: { priority: number; label: string; dot: string }[] = [
  { priority: 0, label: "Out of stock — pending requests", dot: "#ef4444" },
  { priority: 1, label: "Out of stock — no requests", dot: "#ef4444" },
  { priority: 2, label: "Low stock — pending requests", dot: "#f59e0b" },
  { priority: 3, label: "Low stock", dot: "#f59e0b" },
  { priority: 4, label: "Recent activity", dot: "#3b82f6" },
];

// ─── Dashboard consumption graphs (mirrors MonthlyGraphsView's builders,
// scoped to the current calendar month + already-loaded `transactions`) ──────

const CONSUMPTION_TYPES = new Set([
  "manual_adjustment",
  "supply_request_fulfilled",
  "ticket_deduction",
]);

// Flat hex fills for recharts <Cell>. Distinct from CATEGORY_COLORS above,
// which is {bg,text} for HTML badges.
const CHART_CATEGORY_FILL: Record<string, string> = {
  office_supplies: "#3b82f6",
  cleaning: "#f59e0b",
  ppe: "#a855f7",
  medicine: "#ef4444",
  pantry: "#10b981",
  other: "#64748b",
};

// Shorter than CATEGORY_LABELS — the y-axis column is narrow, and
// "Office Supplies" was wrapping mid-word inside it.
const CHART_CATEGORY_LABELS: Record<string, string> = {
  office_supplies: "Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
  pantry: "Pantry",
};

const DASHBOARD_ITEMS_PER_PAGE = 6;
const DASHBOARD_TREND_MONTHS = 6;
const DASHBOARD_MAX_COMPARE_ITEMS = 6;
const DASHBOARD_ITEM_COMPARE_COLORS = ["#3b82f6", "#f59e0b", "#a855f7", "#10b981", "#ef4444", "#06b6d4"];

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function buildDashboardConsumptionRows(
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
        totalConsumed: v.consumed,
        consumptionAmount: v.amount,
      };
    })
    .filter((r) => r.totalConsumed > 0);
}

function buildDashboardTopItems(
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
    }));
}

function buildDashboardCategoryBreakdown(
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

function buildDashboardMonthlyTrend(
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
      const row: Record<string, any> = { ym, label, qty: v.qty };
      itemIds.forEach((id) => {
        row[id] = v.perItem[id] ?? 0;
      });
      return row;
    });
}

function buildDashboardItemOptions(items: OfficeInventoryItem[]) {
  return [...items]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({ id: i.id, name: i.name, itemCode: i.itemCode }));
}

// ─── Sub-components (unchanged) ───────────────────────────────────────────────

function KpiCard({
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
      }}
      className="rounded-xl border p-4 flex flex-col gap-2 flex-1 min-w-[150px] transition-shadow"
      onMouseEnter={(e) => {
        if (onClick)
          e.currentTarget.style.boxShadow = `0 0 0 2px ${theme.primary}33`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
      }}
    >
      <div className="flex items-center justify-between">
        <span
          style={{ color: theme.subtext }}
          className="text-[11px] font-semibold uppercase tracking-wide"
        >
          {label}
        </span>
        <span style={{ color: theme.subtext }}>{icon}</span>
      </div>
      <p
        style={{ color: valueColor ?? theme.text }}
        className="text-3xl font-bold leading-none"
      >
        {value}
      </p>
      {sub && (
        <p style={{ color: theme.subtext }} className="text-xs">
          {sub}
        </p>
      )}
    </div>
  );
}

function SectionHeader({
  title,
  action,
  actionLabel,
  theme,
}: {
  title: string;
  action?: () => void;
  actionLabel?: string;
  theme: any;
}) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 style={{ color: theme.text }} className="text-sm font-semibold">
        {title}
      </h2>
      {action && actionLabel && (
        <button
          onClick={action}
          style={{ color: theme.primary }}
          className="text-xs font-medium hover:underline"
        >
          {actionLabel} →
        </button>
      )}
    </div>
  );
}

function AlertBanner({
  items,
  pendingCount,
  onViewRequests,
  theme,
  dismissedSignature,
  onDismiss,
}: {
  items: OfficeInventoryItem[];
  pendingCount: number;
  onViewRequests?: () => void;
  theme: any;
  dismissedSignature: string | null;
  onDismiss: (signature: string) => void;
}) {
  const outOfStockWithPending = items.filter(
    (i) => i.stockStatus === "out_of_stock",
  );
  if (outOfStockWithPending.length === 0 || pendingCount === 0) return null;

  const signature =
    outOfStockWithPending
      .map((i) => i.id)
      .sort()
      .join(",") + `|${pendingCount}`;

  if (dismissedSignature === signature) return null;

  const firstName = outOfStockWithPending[0].name;
  const extra = outOfStockWithPending.length - 1;

  const handleViewRequests = () => {
    onDismiss(signature);
    onViewRequests?.();
  };

  return (
    <div
      style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a" }}
      className="rounded-lg border px-4 py-3 flex items-center justify-between gap-3 mb-4 flex-shrink-0"
    >
      <div className="flex items-center gap-2">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#d97706"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
        <p className="text-xs text-amber-800">
          <strong>
            {pendingCount} pending {pendingCount === 1 ? "request" : "requests"}
          </strong>{" "}
          for <strong>{firstName}</strong>
          {extra > 0 ? ` and ${extra} other${extra > 1 ? "s" : ""}` : ""} —
          stock now out.
        </p>
      </div>
      {onViewRequests && (
        <button
          onClick={handleViewRequests}
          style={{ borderColor: "#fcd34d", color: "#92400e" }}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border whitespace-nowrap flex-shrink-0"
        >
          View requests
        </button>
      )}
    </div>
  );
}

function StockBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const map: Record<
    string,
    { bg: string; text: string; dot: string; label: string }
  > = {
    in_stock: {
      bg: "#dcfce7",
      text: "#166534",
      dot: "#22c55e",
      label: "In stock",
    },
    low_stock: {
      bg: "#fef3c7",
      text: "#92400e",
      dot: "#f59e0b",
      label: "Low stock",
    },
    out_of_stock: {
      bg: "#fee2e2",
      text: "#991b1b",
      dot: "#ef4444",
      label: "Out of stock",
    },
  };
  const s = map[status] ?? {
    bg: "#f1f5f9",
    text: "#475569",
    dot: "#94a3b8",
    label: status,
  };
  return (
    <span
      style={{ backgroundColor: s.bg, color: s.text }}
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
        size === "sm" ? "text-[9.5px]" : "text-[11px]"
      }`}
    >
      <span
        style={{
          backgroundColor: s.dot,
          width: size === "sm" ? 4 : 5,
          height: size === "sm" ? 4 : 5,
          borderRadius: "50%",
          flexShrink: 0,
          display: "inline-block",
        }}
      />
      {s.label}
    </span>
  );
}

const ACTION_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; icon: React.ReactNode }
> = {
  delivery: {
    label: "Delivery received",
    bg: "#dcfce7",
    text: "#15803d",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  manual_adjustment: {
    label: "Stock adjusted",
    bg: "#e2e8f0",
    text: "#334155",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
  supply_request_fulfilled: {
    label: "Request approved",
    bg: "#dbeafe",
    text: "#1d4ed8",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
  },
  ticket_deduction: {
    label: "Stock deducted",
    bg: "#fef3c7",
    text: "#92400e",
    icon: (
      <svg
        width="13"
        height="13"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    ),
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function OfficeDashboardPage({
  user,
  onNavigate,
  onNavigateWithPayload,
}: Props) {
  const { theme } = useTheme();

  const [items, setItems] = useState<OfficeInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [approvalRequest, setApprovalRequest] = useState<SupplyRequest | null>(
    null,
  );

  // Mobile tab state — only consulted below the md breakpoint.
const [activeMobileTab, setActiveMobileTab] =
    useState<MobileTab>("attention");

  // ── Needs-attention filter ──────────────────────────────────────────────
  // Lets the user hide priority tiers they've already handled, e.g. "I know
  // about out-of-stock, just show me low stock right now."
  const [attentionFilters, setAttentionFilters] = useState<Set<number>>(
    new Set([0, 1, 2, 3, 4]),
  );
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef<HTMLDivElement | null>(null);

  // ── Consumption-by-month item comparison ────────────────────────────────
  const [trendItemIds, setTrendItemIds] = useState<string[]>([]);
  const [trendItemSearch, setTrendItemSearch] = useState<string>("");
  const [trendDropdownOpen, setTrendDropdownOpen] = useState(false);
  const trendDropdownRef = useRef<HTMLDivElement | null>(null);

  // ── Most consumed items pagination ──────────────────────────────────────
  const [topItemsPage, setTopItemsPage] = useState(0);

  const [dismissedAlertSignature, setDismissedAlertSignature] = useState<
    string | null
  >(() => readDismissedAlertSignature());
  const handleDismissAlert = useCallback((signature: string) => {
    writeDismissedAlertSignature(signature);
    setDismissedAlertSignature(signature);
  }, []);
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // ── MySQL data loading: one-shot fetch, polled — no live push available ──
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

  useEffect(() => {
    loadAll();

    const intervalId = setInterval(loadAll, POLL_INTERVAL_MS);
    const onFocus = () => loadAll();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadAll]);

  useEffect(() => {
    if (!filterMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        filterMenuRef.current &&
        !filterMenuRef.current.contains(e.target as Node)
      ) {
        setFilterMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterMenuOpen]);

  // ── KPI computations ────────────────────────────────────────────────────────

  const kpi = useMemo(() => {
    const total = items.length;
    const inStock = items.filter((i) => i.stockStatus === "in_stock").length;
    const lowStock = items.filter((i) => i.stockStatus === "low_stock").length;
    const outOfStock = items.filter(
      (i) => i.stockStatus === "out_of_stock",
    ).length;

    const pendingReqs = requests.filter(
      (r) =>
        r.status === "pending" ||
        r.status === "awaiting_stock" ||
        r.status === "out_for_delivery",
    ).length;

    const outOfStockWithPendingReqs = items.filter(
      (i) => i.stockStatus === "out_of_stock",
    );

    return {
      total,
      inStock,
      lowStock,
      outOfStock,
      pendingReqs,
      outOfStockWithPendingReqs,
    };
  }, [items, requests]);

  // ── Consumption graphs (this month + all-time trend) ───────────────────────

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
  // refresh drops an item), the visible page adjusts automatically instead
  // of pointing at a page that no longer exists.
  const topItemsCurrentPage = Math.min(topItemsPage, topItemsTotalPages - 1);
  const graphTopItemsPage = useMemo(
    () =>
      graphTopItemsAll.slice(
        topItemsCurrentPage * DASHBOARD_ITEMS_PER_PAGE,
        (topItemsCurrentPage + 1) * DASHBOARD_ITEMS_PER_PAGE,
      ),
    [graphTopItemsAll, topItemsCurrentPage],
  );
  // Fixed across all pages so bar height is relative to the true max,
  // not just whatever happens to be on the current page.
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

  const toggleTrendItem = (id: string) => {
    setTrendItemIds((prev) => {
      if (prev.includes(id)) return prev.filter((c) => c !== id);
      if (prev.length >= DASHBOARD_MAX_COMPARE_ITEMS) return prev;
      return [...prev, id];
    });
  };

  useEffect(() => {
    if (!trendDropdownOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        trendDropdownRef.current &&
        !trendDropdownRef.current.contains(e.target as Node)
      ) {
        setTrendDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [trendDropdownOpen]);

  // ── Category breakdown ──────────────────────────────────────────────────────

  const categoryBreakdown = useMemo(() => {
    const counts: Record<
      string,
      { total: number; inStock: number; lowStock: number; outOfStock: number }
    > = {};
    items.forEach((item) => {
      if (!counts[item.category])
        counts[item.category] = {
          total: 0,
          inStock: 0,
          lowStock: 0,
          outOfStock: 0,
        };
      counts[item.category].total++;
      if (item.stockStatus === "in_stock") counts[item.category].inStock++;
      else if (item.stockStatus === "low_stock")
        counts[item.category].lowStock++;
      else if (item.stockStatus === "out_of_stock")
        counts[item.category].outOfStock++;
    });
    return Object.entries(counts).map(([cat, c]) => ({ category: cat, ...c }));
  }, [items]);

  // ── Recent requests ─────────────────────────────────────────────────────────

  const recentRequests = useMemo(() => {
    return [...requests]
      .sort((a, b) =>
        toISOString(b.createdAt).localeCompare(toISOString(a.createdAt)),
      )
      .slice(0, 5);
  }, [requests]);

  // ── Recent activity ─────────────────────────────────────────────────────────

  const recentActivity = useMemo(() => {
    return [...transactions]
      .sort((a, b) =>
        toISOString(b.createdAt).localeCompare(toISOString(a.createdAt)),
      )
      .slice(0, 6);
  }, [transactions]);

  // ── Inventory table (recent items) ─────────────────────────────────────────

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

    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();
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
    // No slice here — this is the FULL set of items needing attention,
    // across every priority tier. Filtering happens first, then display
    // is capped, so unchecking a tier can surface items that were
    // previously crowded out of the old top-10.
  }, [items, requests, transactions]);

  const filteredAttentionItems = useMemo(
    () => inventoryPreview.filter((item) => attentionFilters.has(item._priority)),
    [inventoryPreview, attentionFilters],
  );

  const visibleAttentionItems = useMemo(
    () => filteredAttentionItems.slice(0, ATTENTION_DISPLAY_LIMIT),
    [filteredAttentionItems],
  );

  const toggleAttentionFilter = (priority: number) => {
    setAttentionFilters((prev) => {
      const next = new Set(prev);
      if (next.has(priority)) next.delete(priority);
      else next.add(priority);
      return next;
    });
  };

  const allFiltersOn = attentionFilters.size === ATTENTION_FILTER_OPTIONS.length;

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div
        style={{ backgroundColor: theme.background }}
        className="flex flex-1 items-center justify-center h-full"
      >
        <div
          style={{ borderColor: theme.primary }}
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
        />
      </div>
    );
  }

  const MOBILE_TABS: { key: MobileTab; label: string; badge?: number }[] = [
    { key: "attention", label: "Needs attention" },
    { key: "requests", label: "Requests", badge: kpi.pendingReqs },
    { key: "activity", label: "Activity" },
  ];

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* Header moved into scrollable container to allow scrolling on mobile */}

      {/* ── Scrollable body ── */}
      <style>{`
        .office-dashboard-scroll::-webkit-scrollbar { width: 6px; }
        .office-dashboard-scroll::-webkit-scrollbar-track { background: transparent; }
        .office-dashboard-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .office-dashboard-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }

        .needs-attention-scroll::-webkit-scrollbar { height: 6px; }
        .needs-attention-scroll::-webkit-scrollbar-track { background: ${theme.surfaceRaised}; }
        .needs-attention-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .needs-attention-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
      `}</style>
      <div
        className="office-dashboard-scroll flex-1 overflow-y-auto px-5 pb-5"
        style={{ paddingBottom: 88 }}
      >
        <div className="px-0 pt-5 pb-0">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1
                style={{ color: theme.text }}
                className="text-xl font-bold leading-tight"
              >
                Dashboard
              </h1>
              <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
                Overview for {today}
              </p>
            </div>
          </div>

          <AlertBanner
            items={items}
            pendingCount={kpi.pendingReqs}
            onViewRequests={() => onNavigate?.("supply_requests")}
            theme={theme}
            dismissedSignature={dismissedAlertSignature}
            onDismiss={handleDismissAlert}
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5 items-stretch">
            <div
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-xl border p-4 flex flex-col h-full"
            >
              <p style={{ color: theme.text }} className="text-sm font-semibold mb-0.5">
                Most consumed items
              </p>
              <p style={{ color: theme.subtext }} className="text-xs mb-3">
                {graphTopItemsAll.length === 0
                  ? "This month"
                  : `This month · ${topItemsCurrentPage * DASHBOARD_ITEMS_PER_PAGE + 1}–${Math.min(
                      (topItemsCurrentPage + 1) * DASHBOARD_ITEMS_PER_PAGE,
                      graphTopItemsAll.length,
                    )} of ${graphTopItemsAll.length}`}
              </p>
              {graphTopItemsAll.length === 0 ? (
                <p style={{ color: theme.subtext }} className="text-xs py-8 text-center">
                  No consumption yet this month.
                </p>
              ) : (
                <>
                  <div className="flex-1 min-h-[160px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={graphTopItemsPage} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
                      <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        stroke={theme.subtext}
                        fontSize={9}
                        angle={-35}
                        textAnchor="end"
                        interval={0}
                        height={60}
                      />
                      <YAxis
                        stroke={theme.subtext}
                        fontSize={10}
                        domain={[0, graphTopItemsMaxConsumed]}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: theme.surfaceRaised ?? theme.surface,
                          border: `1px solid ${theme.border}`,
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        labelStyle={{ color: theme.text }}
                        itemStyle={{ color: theme.text }}
                        formatter={(value: any) => [`${Number(value)} units`, "Consumed"]}
                      />
                      <Bar dataKey="consumed" radius={[3, 3, 0, 0]}>
                        {graphTopItemsPage.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={CHART_CATEGORY_FILL[entry.category] ?? CHART_CATEGORY_FILL.other}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                  {topItemsTotalPages > 1 && (
                    <div className="flex items-center justify-between mt-2">
                      <button
                        type="button"
                        onClick={() => setTopItemsPage(Math.max(0, topItemsCurrentPage - 1))}
                        disabled={topItemsCurrentPage === 0}
                        style={{
                          borderColor: theme.border,
                          color: topItemsCurrentPage === 0 ? theme.subtext : theme.primary,
                          opacity: topItemsCurrentPage === 0 ? 0.5 : 1,
                        }}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border"
                      >
                        ← Prev
                      </button>
                      <span style={{ color: theme.subtext }} className="text-[10.5px]">
                        Page {topItemsCurrentPage + 1} of {topItemsTotalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setTopItemsPage(Math.min(topItemsTotalPages - 1, topItemsCurrentPage + 1))
                        }
                        disabled={topItemsCurrentPage >= topItemsTotalPages - 1}
                        style={{
                          borderColor: theme.border,
                          color:
                            topItemsCurrentPage >= topItemsTotalPages - 1
                              ? theme.subtext
                              : theme.primary,
                          opacity: topItemsCurrentPage >= topItemsTotalPages - 1 ? 0.5 : 1,
                        }}
                        className="text-xs font-medium px-2.5 py-1 rounded-lg border"
                      >
                        Next →
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            <div
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-xl border p-4 flex flex-col h-full"
            >
              <p style={{ color: theme.text }} className="text-sm font-semibold mb-0.5">
                Consumption by category
              </p>
              <p style={{ color: theme.subtext }} className="text-xs mb-3">
                This month
              </p>
              {graphCategoryBreakdown.length === 0 ? (
                <p style={{ color: theme.subtext }} className="text-xs py-8 text-center">
                  No consumption yet this month.
                </p>
              ) : (
                <div className="flex-1 min-h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={graphCategoryBreakdown}
                    layout="vertical"
                    margin={{ top: 5, right: 20, bottom: 5, left: 10 }}
                  >
                    <CartesianGrid stroke={theme.border} strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" stroke={theme.subtext} fontSize={10} />
                    <YAxis
                      type="category"
                      dataKey="category"
                      stroke={theme.subtext}
                      fontSize={10}
                      width={70}
                      tickFormatter={(v: string) => CHART_CATEGORY_LABELS[v] ?? v}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme.surfaceRaised ?? theme.surface,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      labelStyle={{ color: theme.text }}
                      itemStyle={{ color: theme.text }}
                      formatter={(value: any) => [`${Number(value)} units`, "Consumed"]}
                    />
                    <Bar dataKey="consumed" radius={[0, 4, 4, 0]}>
                      {graphCategoryBreakdown.map((entry, idx) => (
                        <Cell
                          key={idx}
                          fill={CHART_CATEGORY_FILL[entry.category] ?? CHART_CATEGORY_FILL.other}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              )}
            </div>

            <div
              style={{ backgroundColor: theme.surface, borderColor: theme.border }}
              className="rounded-xl border p-4 flex flex-col h-full"
            >
              <p style={{ color: theme.text }} className="text-sm font-semibold mb-0.5">
                Consumption by month
              </p>
              <p style={{ color: theme.subtext }} className="text-xs mb-3">
                {selectedTrendItems.length > 0
                  ? `Comparing ${selectedTrendItems.length} item${selectedTrendItems.length > 1 ? "s" : ""} · last ${DASHBOARD_TREND_MONTHS} months`
                  : `All items · last ${DASHBOARD_TREND_MONTHS} months`}
              </p>

              <div className="mb-3 space-y-2" ref={trendDropdownRef}>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTrendDropdownOpen((o) => !o)}
                    style={{
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: selectedTrendItems.length > 0 ? theme.text : theme.subtext,
                    }}
                    className="w-full flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 border rounded-lg"
                  >
                    <span className="truncate">
                      {selectedTrendItems.length > 0
                        ? `${selectedTrendItems.length} item${selectedTrendItems.length > 1 ? "s" : ""} selected`
                        : `Add item to compare (up to ${DASHBOARD_MAX_COMPARE_ITEMS})…`}
                    </span>
                    <span style={{ color: theme.subtext }}>{trendDropdownOpen ? "▲" : "▼"}</span>
                  </button>

                  {trendDropdownOpen && (
                    <div
                      style={{
                        backgroundColor: theme.surfaceRaised ?? theme.surface,
                        borderColor: theme.border,
                      }}
                      className="absolute z-10 mt-1 w-full border rounded-lg shadow-lg overflow-hidden"
                    >
                      <div style={{ borderColor: theme.border }} className="p-2 border-b">
                        <input
                          autoFocus
                          value={trendItemSearch}
                          onChange={(e) => setTrendItemSearch(e.target.value)}
                          placeholder="Search items…"
                          style={{
                            backgroundColor: theme.surface,
                            borderColor: theme.border,
                            color: theme.text,
                          }}
                          className="w-full text-xs px-2.5 py-1.5 border rounded-lg focus:outline-none"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {trendItemSearchResults.length === 0 ? (
                          <p style={{ color: theme.subtext }} className="text-xs px-2.5 py-2">
                            No items match "{trendItemSearch}"
                          </p>
                        ) : (
                          trendItemSearchResults.map((item) => {
                            const checked = trendItemIds.includes(item.id);
                            const disabled =
                              !checked && trendItemIds.length >= DASHBOARD_MAX_COMPARE_ITEMS;
                            return (
                              <label
                                key={item.id}
                                style={{ color: disabled ? theme.subtext : theme.text }}
                                className="flex items-center gap-2 px-2.5 py-1.5 text-xs cursor-pointer hover:opacity-70"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  disabled={disabled}
                                  onChange={() => toggleTrendItem(item.id)}
                                />
                                <span className="truncate">{item.name}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {selectedTrendItems.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedTrendItems.map((item, idx) => (
                      <button
                        key={item.id}
                        onClick={() => toggleTrendItem(item.id)}
                        className="text-xs px-2 py-1 rounded-full border flex items-center gap-1.5"
                        style={{
                          borderColor:
                            DASHBOARD_ITEM_COMPARE_COLORS[idx % DASHBOARD_ITEM_COMPARE_COLORS.length],
                          color:
                            DASHBOARD_ITEM_COMPARE_COLORS[idx % DASHBOARD_ITEM_COMPARE_COLORS.length],
                          backgroundColor: `${DASHBOARD_ITEM_COMPARE_COLORS[idx % DASHBOARD_ITEM_COMPARE_COLORS.length]}1A`,
                        }}
                      >
                        {item.name}
                        <span style={{ color: theme.subtext }}>×</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {graphMonthlyTrend.length === 0 ? (
                <p style={{ color: theme.subtext }} className="text-xs py-8 text-center">
                  No historical data yet.
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={graphMonthlyTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid stroke={theme.border} strokeDasharray="3 3" />
                    <XAxis dataKey="label" stroke={theme.subtext} fontSize={10} />
                    <YAxis stroke={theme.subtext} fontSize={10} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: theme.surfaceRaised ?? theme.surface,
                        border: `1px solid ${theme.border}`,
                        borderRadius: 8,
                        fontSize: 11,
                      }}
                      labelStyle={{ color: theme.text }}
                      itemStyle={{ color: theme.text }}
                      formatter={(value: any, name: any) => [`${Number(value)} units`, name]}
                    />
                    {selectedTrendItems.length > 0 && <Legend wrapperStyle={{ fontSize: 10 }} />}
                    {selectedTrendItems.length === 0 ? (
                      <Bar dataKey="qty" name="All items" radius={[3, 3, 0, 0]} maxBarSize={56}>
                        {graphMonthlyTrend.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={idx === graphMonthlyTrend.length - 1 ? theme.primary ?? "#3b82f6" : "#94a3b8"}
                          />
                        ))}
                      </Bar>
                    ) : (
                      selectedTrendItems.map((item, idx) => (
                        <Bar
                          key={item.id}
                          dataKey={item.id}
                          name={item.name}
                          radius={[3, 3, 0, 0]}
                          maxBarSize={56}
                          fill={DASHBOARD_ITEM_COMPARE_COLORS[idx % DASHBOARD_ITEM_COMPARE_COLORS.length]}
                        />
                      ))
                    )}
                  </BarChart>
                </ResponsiveContainer>
              )}
              <p style={{ color: theme.subtext }} className="text-[10.5px] mt-2">
                {selectedTrendItems.length > 0
                  ? "Each color is a different item."
                  : graphMonthlyTrend.length === 1
                    ? `Trend builds as more months come in — currently only ${graphMonthlyTrend[0].label} has recorded consumption.`
                    : "Latest month is highlighted."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:flex gap-3 mb-5 sm:flex-wrap">
            <KpiCard
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              }
              label="Total items"
              value={kpi.total}
              sub={`Across ${categoryBreakdown.length} categories`}
              onClick={() => onNavigate?.("inventory", null)}
              theme={theme}
            />
            <KpiCard
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              }
              label="In stock"
              value={kpi.inStock}
              sub="Available"
              valueColor="#16a34a"
              onClick={() =>
                onNavigate?.("inventory", {
                  field: "stockStatus",
                  value: "in_stock",
                })
              }
              theme={theme}
            />
            <KpiCard
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              }
              label="Low stock"
              value={kpi.lowStock}
              sub="Needs restocking"
              valueColor="#d97706"
              onClick={() =>
                onNavigate?.("inventory", {
                  field: "stockStatus",
                  value: "low_stock",
                })
              }
              theme={theme}
            />
            <KpiCard
              icon={
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              }
              label="Out of stock"
              value={kpi.outOfStock}
              sub={
                kpi.pendingReqs > 0
                  ? `${kpi.pendingReqs} with pending requests`
                  : undefined
              }
              valueColor="#dc2626"
              onClick={() =>
                onNavigate?.("inventory", {
                  field: "stockStatus",
                  value: "out_of_stock",
                })
              }
              theme={theme}
            />
          </div>
        </div>
        {/* ── Mobile tab bar (hidden md and up) ── */}
        <div
          role="tablist"
          aria-label="Dashboard sections"
          style={{
            backgroundColor: theme.surfaceRaised ?? theme.background,
            borderColor: theme.border,
          }}
          className="flex md:hidden gap-1 p-1 rounded-lg border mb-4"
        >
          {MOBILE_TABS.map((t) => {
            const isActive = activeMobileTab === t.key;
            return (
              <button
                key={t.key}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveMobileTab(t.key)}
                style={{
                  backgroundColor: isActive ? theme.surface : "transparent",
                  color: isActive ? theme.text : theme.subtext,
                  boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-colors whitespace-nowrap"
              >
                {t.label}
                {!!t.badge && (
                  <span className="bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {t.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col md:flex-row gap-4 items-start">
          {/* ── Left column ── */}
          <div className="flex flex-col gap-4 flex-1 min-w-0 w-full">
            <div
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
              className={`${activeMobileTab === "attention" ? "block" : "hidden"} md:block rounded-xl border`}
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 px-4 pt-4 pb-3">
                <div>
                  <h2
                    style={{ color: theme.text }}
                    className="text-sm font-semibold"
                  >
                    Needs attention
                  </h2>
                  <p
                    style={{ color: theme.subtext }}
                    className="text-[11px] mt-0.5"
                  >
                    Sorted by urgency · out of stock, low stock, and recent
                    activity
                  </p>
                </div>

                <div
                  ref={filterMenuRef}
                  style={{ position: "relative" }}
                  className="flex items-center justify-between md:justify-end gap-2 flex-shrink-0"
                >
                  <button
                    onClick={() => setFilterMenuOpen((prev) => !prev)}
                    style={{
                      borderColor: theme.border,
                      color: allFiltersOn ? theme.subtext : theme.primary,
                      backgroundColor: allFiltersOn
                        ? "transparent"
                        : `${theme.primary}1a`,
                    }}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border whitespace-nowrap"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                    Filter
                    {!allFiltersOn && (
                      <span
                        style={{
                          backgroundColor: theme.primary,
                          color: theme.primaryText,
                        }}
                        className="text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center leading-none"
                      >
                        {attentionFilters.size}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => onNavigate?.("inventory")}
                    style={{ color: theme.primary }}
                    className="text-xs font-medium hover:underline whitespace-nowrap"
                  >
                    Full inventory →
                  </button>

                  {filterMenuOpen && (
                    <div
                      style={{
                        backgroundColor: theme.surfaceRaised ?? theme.surface,
                        borderColor: theme.border,
                        top: "calc(100% + 6px)",
                      }}
                      className="absolute right-0 z-20 w-64 rounded-lg border shadow-lg py-1.5"
                    >
                      <div className="flex items-center justify-between px-3 py-1.5">
                        <span
                          style={{ color: theme.subtext }}
                          className="text-[10px] font-semibold uppercase tracking-wide"
                        >
                          Show priority
                        </span>
                        <button
                          onClick={() =>
                            setAttentionFilters(
                              allFiltersOn ? new Set() : new Set([0, 1, 2, 3, 4]),
                            )
                          }
                          style={{ color: theme.primary }}
                          className="text-[10px] font-medium hover:underline"
                        >
                          {allFiltersOn ? "Clear all" : "Select all"}
                        </button>
                      </div>
                      {ATTENTION_FILTER_OPTIONS.map((opt) => {
                        const checked = attentionFilters.has(opt.priority);
                        return (
                          <label
                            key={opt.priority}
                            style={{ color: theme.text }}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-black/10"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAttentionFilter(opt.priority)}
                              className="w-3.5 h-3.5 rounded"
                            />
                            <span
                              style={{ backgroundColor: opt.dot }}
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {inventoryPreview.length === 0 ? (
                <div className="px-4 pb-5 pt-2 text-center">
                  <p style={{ color: theme.subtext }} className="text-xs">
                    All items are well-stocked. No action needed.
                  </p>
                </div>
              ) : filteredAttentionItems.length === 0 ? (
                <div className="px-4 pb-5 pt-2 text-center">
                  <p style={{ color: theme.subtext }} className="text-xs">
                    No items match the current filter.
                  </p>
                  <button
                    onClick={() => setAttentionFilters(new Set([0, 1, 2, 3, 4]))}
                    style={{ color: theme.primary }}
                    className="text-xs font-medium hover:underline mt-1"
                  >
                    Reset filter
                  </button>
                </div>
              ) : (
                <>
                 <div className="overflow-x-auto needs-attention-scroll hidden md:block">
                    <table
                      className="w-full text-sm"
                      style={{ borderCollapse: "collapse" }}
                    >
                      <thead>
                        <tr>
                          {[
                            "PRIORITY",
                            "ITEM",
                            "CATEGORY",
                            "STOCK",
                            "STATUS",
                            "PENDING REQS",
                            "₱/UNIT",
                            "",
                          ].map((h) => (
                            <th
                              key={h}
                              style={{
                                color: theme.subtext,
                                borderTop: `1px solid ${theme.border}`,
                                borderBottom: `1px solid ${theme.border}`,
                                backgroundColor: theme.surfaceRaised,
                              }}
                              className="px-4 py-2 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap"
                            >
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAttentionItems.map((item, index) => {
                          const catColor = CATEGORY_COLORS[item.category] ?? {
                            bg: "#f1f5f9",
                            text: "#475569",
                          };
                          const isOutOfStock =
                            item.stockStatus === "out_of_stock";
                          const isLowStock = item.stockStatus === "low_stock";

                          const priorityConfig =
                            item._priority === 0
                              ? {
                                  label: "Critical",
                                  bg: "#fee2e2",
                                  text: "#991b1b",
                                }
                              : item._priority === 1
                                ? {
                                    label: "Out of stock",
                                    bg: "#fee2e2",
                                    text: "#991b1b",
                                  }
                                : item._priority === 2
                                  ? {
                                      label: "Low + pending",
                                      bg: "#fef3c7",
                                      text: "#92400e",
                                    }
                                  : item._priority === 3
                                    ? {
                                        label: "Low stock",
                                        bg: "#fef3c7",
                                        text: "#92400e",
                                      }
                                    : {
                                        label: "Recent activity",
                                        bg: "#dbeafe",
                                        text: "#1e40af",
                                      };

                          return (
                            <tr
                              key={item.id}
                              style={{
                                backgroundColor:
                                  index % 2 === 0
                                    ? theme.surface
                                    : theme.background,
                                borderBottom: `1px solid ${theme.border}`,
                              }}
                            >
                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span
                                  style={{
                                    backgroundColor: priorityConfig.bg,
                                    color: priorityConfig.text,
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                >
                                  {item._priority <= 1 && (
                                    <span
                                      style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: "50%",
                                        backgroundColor: "#ef4444",
                                        display: "inline-block",
                                        flexShrink: 0,
                                      }}
                                    />
                                  )}
                                  {item._priority === 2 ||
                                  item._priority === 3 ? (
                                    <span
                                      style={{
                                        width: 5,
                                        height: 5,
                                        borderRadius: "50%",
                                        backgroundColor: "#f59e0b",
                                        display: "inline-block",
                                        flexShrink: 0,
                                      }}
                                    />
                                  ) : null}
                                  {priorityConfig.label}
                                </span>
                              </td>

                              <td className="px-4 py-2.5 min-w-[160px]">
                                <p
                                  style={{ color: theme.text }}
                                  className="text-sm font-medium leading-tight"
                                >
                                  {item.name}
                                </p>
                                <p
                                  style={{ color: theme.subtext }}
                                  className="text-[11px] font-mono mt-0.5"
                                >
                                  {item.itemCode}
                                </p>
                              </td>

                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span
                                  style={{
                                    backgroundColor: catColor.bg,
                                    color: catColor.text,
                                  }}
                                  className="inline-flex px-2 py-0.5 rounded-md text-[11px] font-medium"
                                >
                                  {CATEGORY_LABELS[item.category] ??
                                    item.category}
                                </span>
                              </td>

                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span
                                  style={{
                                    color: isOutOfStock
                                      ? "#ef4444"
                                      : isLowStock
                                        ? "#f59e0b"
                                        : theme.text,
                                    fontWeight: 700,
                                  }}
                                  className="text-sm"
                                >
                                  {item.currentStock}
                                </span>
                                <span
                                  style={{ color: theme.subtext }}
                                  className="text-xs ml-1"
                                >
                                  {item.unit}
                                </span>
                              </td>

                              <td className="px-4 py-2.5 whitespace-nowrap">
                               <StockBadge status={item.stockStatus} size="sm" />
                              </td>

                              <td className="px-4 py-2.5 whitespace-nowrap">
                                {item._pendingCount > 0 ? (
                                  <button
                                    onClick={() =>
                                      onNavigate?.("supply_requests")
                                    }
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                                    style={{
                                      backgroundColor: "#fee2e2",
                                      color: "#991b1b",
                                    }}
                                  >
                                    <svg
                                      width="10"
                                      height="10"
                                      viewBox="0 0 24 24"
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth={2.5}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <line x1="12" y1="8" x2="12" y2="12" />
                                      <line
                                        x1="12"
                                        y1="16"
                                        x2="12.01"
                                        y2="16"
                                      />
                                    </svg>
                                    {item._pendingCount} pending
                                  </button>
                                ) : (
                                  <span
                                    style={{ color: theme.subtext }}
                                    className="text-xs"
                                  >
                                    —
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-2.5 whitespace-nowrap">
                                <span
                                  style={{ color: theme.text }}
                                  className="text-sm"
                                >
                                  ₱{item.pricePerUnit.toLocaleString("en-PH")}
                                </span>
                              </td>

                              <td className="px-4 py-2.5 whitespace-nowrap text-right">
                                <button
                                  onClick={() =>
                                    onNavigateWithPayload?.({
                                      tab: "inventory_deliver",
                                      deliverItem: item,
                                    })
                                  }
                                  style={{
                                    backgroundColor: theme.primary,
                                    color: theme.primaryText,
                                  }}
                                  className="text-[10px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap"
                                >
                                  + Add stock
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                     </tbody>
                    </table>
                  </div>

                  {/* Mobile card view — same data as the table above, no horizontal scroll */}
                  <div className="md:hidden flex flex-col gap-2 px-4 pb-2">
                    {visibleAttentionItems.map((item) => {
                      const catColor = CATEGORY_COLORS[item.category] ?? {
                        bg: "#f1f5f9",
                        text: "#475569",
                      };
                      const priorityConfig =
                        item._priority === 0
                          ? { label: "Critical", bg: "#fee2e2", text: "#991b1b" }
                          : item._priority === 1
                            ? { label: "Out of stock", bg: "#fee2e2", text: "#991b1b" }
                            : item._priority === 2
                              ? { label: "Low + pending", bg: "#fef3c7", text: "#92400e" }
                              : item._priority === 3
                                ? { label: "Low stock", bg: "#fef3c7", text: "#92400e" }
                                : { label: "Recent activity", bg: "#dbeafe", text: "#1e40af" };

                      return (
                        <div
                          key={item.id}
                          style={{
                            backgroundColor: theme.surfaceRaised ?? theme.background,
                            borderColor: theme.border,
                          }}
                          className="rounded-lg border px-3 py-2.5"
                        >
                          {/* Name + priority badge */}
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div className="min-w-0">
                              <p
                                style={{ color: theme.text }}
                                className="text-sm font-medium leading-tight truncate"
                              >
                                {item.name}
                              </p>
                              <p
                                style={{ color: theme.subtext }}
                                className="text-[10.5px] font-mono leading-tight"
                              >
                                {item.itemCode}
                              </p>
                            </div>
                            <span
                              style={{
                                backgroundColor: priorityConfig.bg,
                                color: priorityConfig.text,
                              }}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap flex-shrink-0"
                            >
                              {priorityConfig.label}
                            </span>
                          </div>

                          {/* Stats — label + value on one line, 2x2 grid */}
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{ color: theme.subtext }}
                                className="text-[9.5px] uppercase tracking-wide flex-shrink-0"
                              >
                                Category
                              </span>
                              <span
                                style={{
                                  backgroundColor: catColor.bg,
                                  color: catColor.text,
                                }}
                                className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium truncate"
                              >
                                {CATEGORY_LABELS[item.category] ?? item.category}
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{ color: theme.subtext }}
                                className="text-[9.5px] uppercase tracking-wide"
                              >
                                Stock
                              </span>
                              <span className="text-xs">
                                <span
                                  style={{
                                    color:
                                      item.stockStatus === "out_of_stock"
                                        ? "#ef4444"
                                        : item.stockStatus === "low_stock"
                                          ? "#f59e0b"
                                          : theme.text,
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.currentStock}
                                </span>
                                <span style={{ color: theme.subtext }} className="ml-1">
                                  {item.unit}
                                </span>
                              </span>
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{ color: theme.subtext }}
                                className="text-[9.5px] uppercase tracking-wide"
                              >
                                Status
                              </span>
                              <StockBadge status={item.stockStatus} />
                            </div>

                            <div className="flex items-center justify-between gap-2">
                              <span
                                style={{ color: theme.subtext }}
                                className="text-[9.5px] uppercase tracking-wide"
                              >
                                ₱/Unit
                              </span>
                              <span style={{ color: theme.text }} className="text-xs font-medium">
                                ₱{item.pricePerUnit.toLocaleString("en-PH")}
                              </span>
                            </div>
                          </div>

                          {/* Pending reqs + action */}
                          <div
                            style={{ borderTop: `1px solid ${theme.border}` }}
                            className="flex items-center justify-between pt-1.5"
                          >
                            {item._pendingCount > 0 ? (
                              <button
                                onClick={() => onNavigate?.("supply_requests")}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}
                              >
                                {item._pendingCount} pending
                              </button>
                            ) : (
                              <span style={{ color: theme.subtext }} className="text-[10.5px]">
                                No pending reqs
                              </span>
                            )}
                            <button
                              onClick={() =>
                                onNavigateWithPayload?.({
                                  tab: "inventory_deliver",
                                  deliverItem: item,
                                })
                              }
                              style={{
                                backgroundColor: theme.primary,
                                color: theme.primaryText,
                              }}
                              className="text-[10.5px] font-medium px-2.5 py-1 rounded-md whitespace-nowrap"
                            >
                              + Add stock
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div
                    style={{ borderTop: `1px solid ${theme.border}` }}
                    className="px-4 py-2.5 flex items-center justify-between"
                  >
                    <p style={{ color: theme.subtext }} className="text-[11px]">
                      Showing {visibleAttentionItems.length} of {filteredAttentionItems.length}
                      {filteredAttentionItems.length !== inventoryPreview.length
                        ? ` matching filter · ${inventoryPreview.length} total need attention`
                        : " items that need action"}
                    </p>
                    <button
                      onClick={() => onNavigate?.("inventory")}
                      style={{ color: theme.primary }}
                      className="text-xs font-medium hover:underline"
                    >
                      View all {items.length} items →
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Category breakdown — hidden on mobile when not on "Needs attention" tab */}
            <div
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
              className={`${activeMobileTab === "attention" ? "block" : "hidden"} md:block rounded-xl border p-4`}
            >
              <SectionHeader
                title="Category breakdown"
                action={() => onNavigate?.("inventory")}
                actionLabel="Full inventory"
                theme={theme}
              />
              <div className="space-y-3 md:space-y-2.5">
                {categoryBreakdown.map((cat) => {
                  const pct =
                    cat.total > 0
                      ? Math.round((cat.inStock / cat.total) * 100)
                      : 0;
                  const color = CATEGORY_COLORS[cat.category] ?? {
                    bg: "#f1f5f9",
                    text: "#475569",
                  };
                  return (
                    <div key={cat.category}>
                      {/* Row 1: badge + item count — always its own row so long
                          category names never wrap and misalign the layout */}
                      <div className="flex items-center justify-between md:justify-start gap-2 mb-1.5 md:mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            style={{
                              backgroundColor: color.bg,
                              color: color.text,
                            }}
                            className="px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
                          >
                            {CATEGORY_LABELS[cat.category] ?? cat.category}
                          </span>
                          <span
                            style={{ color: theme.subtext }}
                            className="text-xs whitespace-nowrap"
                          >
                            {cat.total} items
                          </span>
                        </div>

                        {/* Desktop only: stats stay inline on row 1 */}
                        <div className="hidden md:flex items-center gap-2 text-xs flex-shrink-0">
                          {cat.lowStock > 0 && (
                            <span style={{ color: "#d97706" }}>
                              ⚠ {cat.lowStock} low
                            </span>
                          )}
                          {cat.outOfStock > 0 && (
                            <span style={{ color: "#dc2626" }}>
                              ✕ {cat.outOfStock} out
                            </span>
                          )}
                          <span style={{ color: theme.subtext }}>
                            {pct}% in stock
                          </span>
                        </div>
                      </div>

                      <div
                        style={{
                          backgroundColor: theme.border,
                          height: 6,
                          borderRadius: 99,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${pct}%`,
                            height: "100%",
                            borderRadius: 99,
                            backgroundColor:
                              pct < 40
                                ? "#ef4444"
                                : pct < 70
                                  ? "#f59e0b"
                                  : "#22c55e",
                            transition: "width 0.5s ease",
                          }}
                        />
                      </div>

                      {/* Mobile only: stats move below the bar and wrap freely */}
                      <div className="flex md:hidden flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[10.5px]">
                        {cat.lowStock > 0 && (
                          <span style={{ color: "#d97706" }}>
                            ⚠ {cat.lowStock} low
                          </span>
                        )}
                        {cat.outOfStock > 0 && (
                          <span style={{ color: "#dc2626" }}>
                            ✕ {cat.outOfStock} out
                          </span>
                        )}
                        <span style={{ color: theme.subtext }}>
                          {pct}% in stock
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Right column ── */}
          <div className="flex flex-col gap-4 w-full md:w-[300px] md:flex-shrink-0">
            <div
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
              className={`${activeMobileTab === "requests" ? "block" : "hidden"} md:block rounded-xl border p-4`}
            >
              <div className="flex items-center justify-between mb-3">
                <h2
                  style={{ color: theme.text }}
                  className="text-sm font-semibold"
                >
                  Pending requests
                </h2>
                <div className="flex items-center gap-2">
                  {kpi.pendingReqs > 0 && (
                    <span className="bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                      {kpi.pendingReqs}
                    </span>
                  )}
                  <button
                    onClick={() => onNavigate?.("supply_requests")}
                    style={{ color: theme.primary }}
                    className="text-xs font-medium hover:underline"
                  >
                    All →
                  </button>
                </div>
              </div>

              {recentRequests.filter(
                (r) =>
                  r.status === "pending" ||
                  r.status === "awaiting_stock" ||
                  r.status === "out_for_delivery",
              ).length === 0 ? (
                <p
                  style={{ color: theme.subtext }}
                  className="text-xs text-center py-4"
                >
                  No pending requests.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {recentRequests
                    .filter(
                      (r) =>
                        r.status === "pending" ||
                        r.status === "awaiting_stock" ||
                        r.status === "out_for_delivery",
                    )
                    .slice(0, 4)
                    .map((r) => {
                      const colors = avatarColor(r.requestedByName);
                      const effStatus = effectiveStatus(r);
                      const firstItem = r.items[0];
                      const extra = r.items.length - 1;
                      const isOutForDelivery = r.status === "out_for_delivery";
                      return (
                        <div key={r.id} className="flex items-start gap-2.5">
                          <div
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.text,
                              width: 28,
                              height: 28,
                              flexShrink: 0,
                            }}
                            className="rounded-full flex items-center justify-center text-[10px] font-bold"
                          >
                            {getInitials(r.requestedByName)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              style={{ color: theme.text }}
                              className="text-xs font-medium"
                            >
                              {r.requestedByName}
                            </p>
                            <p
                              style={{ color: theme.subtext }}
                              className="text-[11px] truncate"
                            >
                              {firstItem?.itemName ?? "—"}
                              {extra > 0 ? ` · +${extra} more` : ""}
                            </p>
                            <span
                              className={`inline-flex mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusBadgeClass(effStatus)}`}
                            >
                              {statusLabel(effStatus)}
                            </span>
                          </div>
                          {!isOutForDelivery && (
                            <button
                              onClick={() =>
                                onNavigateWithPayload?.({
                                  tab: "supply_requests",
                                  approvalRequest: r,
                                })
                              }
                              style={{
                                backgroundColor: theme.primary,
                                color: theme.primaryText,
                              }}
                              className="text-[10px] font-medium px-2 py-1 rounded-md flex-shrink-0"
                            >
                              Details
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            <div
              style={{
                backgroundColor: theme.surface,
                borderColor: theme.border,
              }}
              className={`${activeMobileTab === "activity" ? "block" : "hidden"} md:block rounded-xl border p-4`}
            >
              <SectionHeader
                title="Recent activity"
                action={() => onNavigate?.("activity")}
                actionLabel="View all"
                theme={theme}
              />

              {recentActivity.length === 0 ? (
                <p
                  style={{ color: theme.subtext }}
                  className="text-xs text-center py-4"
                >
                  No activity yet.
                </p>
              ) : (
                <div className="divide-y" style={{ borderColor: theme.border }}>
                  {recentActivity.map((tx) => {
                    const cfg = ACTION_CONFIG[tx.type] ?? {
                      label: tx.type,
                      bg: "#f1f5f9",
                      text: "#475569",
                      icon: null,
                    };
                    return (
                      <div
                        key={tx.id}
                        className="flex items-start gap-3 py-3 px-1"
                      >
                        <div
                          style={{
                            backgroundColor: cfg.bg,
                            color: cfg.text,
                            width: 30,
                            height: 30,
                            flexShrink: 0,
                            marginTop: 1,
                          }}
                          className="rounded-full flex items-center justify-center"
                        >
                          {cfg.icon}
                        </div>

                        <div className="flex-1 min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p
                              style={{ color: theme.text }}
                              className="text-xs font-medium"
                            >
                              {cfg.label}
                            </p>
                            {tx.quantityChange !== 0 && (
                              <span
                                style={{
                                  backgroundColor:
                                    tx.quantityChange > 0
                                      ? "rgba(34,197,94,0.12)"
                                      : "rgba(239,68,68,0.12)",
                                  color:
                                    tx.quantityChange > 0
                                      ? "#16a34a"
                                      : "#dc2626",
                                }}
                                className="inline-block px-1.5 py-px rounded text-[11px] font-medium leading-tight"
                              >
                                {tx.quantityChange > 0 ? "+" : ""}
                                {tx.quantityChange}
                              </span>
                            )}
                          </div>

                          <p
                            style={{ color: theme.subtext }}
                            className="text-[11px] truncate"
                          >
                            {tx.itemName}
                            {tx.itemCode ? (
                              <span
                                style={{
                                  backgroundColor: theme.bgActive,
                                  color: theme.subtext,
                                  borderColor: theme.border,
                                }}
                                className="inline-block ml-1.5 px-1.5 py-px rounded border font-mono text-[10px]"
                              >
                                {tx.itemCode}
                              </span>
                            ) : null}
                          </p>

                          <p
                            style={{ color: theme.subtext }}
                            className="text-[10px]"
                          >
                            {formatDateTime(tx.createdAt)} ·{" "}
                            {tx.performedByName}
                          </p>
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
      <PartialApprovalModal
        visible={approvalRequest !== null}
        request={approvalRequest}
        onClose={() => setApprovalRequest(null)}
        onApproveAll={async (req) => {
          /* your handler */
        }}
        onApprovePartial={async (requestId, lines) => {
          /* your handler */
        }}
        onReject={async (requestId) => {
          /* your reject service call here */
        }}
        theme={theme}
      />
    </div>
  );
}
