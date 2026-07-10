// app/Admin/OfficeInventory/MonthlyReportPage.tsx
//
// MySQL version. The Firestore original used onSnapshot-based subscriptions
// (subscribeToInventoryItems / subscribeToStockTransactions) for live
// updates. Your MySQL Services/officeInventory.ts instead exposes one-shot
// fetches (getAllInventoryItems / getAllStockTransactions), matching the
// same pattern as supplyRequests.ts and ticketService.ts.
//
// To keep the report reasonably fresh without a WebSocket layer, this
// version fetches once on mount / month change, and again on:
//   - a manual "Refresh" button
//   - window regaining focus (user tabs back in)
//   - a 30s background interval
// All the aggregation math, KPIs, table, and exports are unchanged from
// the original component.

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import { ADUser } from "../../../../types";
import {
  getAllInventoryItems,
  getAllStockTransactions,
} from "../../../services/Officeinventory";
import { exportMonthlyReportPdf } from "../../../services/exportMonthlyReportPdf";
import {
  exportMonthlyReportExcel,
  ExcelExportCategory,
} from "../../../services/exportMonthlyReportExcel";
import { OfficeInventoryItem, StockTransaction } from "../../../../types";

// ─── Types ────────────────────────────────────────────────────────────────────

type CategoryTab = "office_supplies" | "cleaning" | "ppe" | "medicine";

type MonthlyItemRow = {
  id: string;
  itemCode: string;
  name: string;
  brand: string;
  category: string;
  unit: string;
  pricePerUnit: number;
  beginningInventory: number;
  totalConsumed: number;
  consumptionAmount: number;
  totalDelivered: number;
  deliveryAmount: number;
  endingInventory: number;
  activityDots: { type: "consumed" | "delivered" | "none"; date: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_TABS: { label: string; value: CategoryTab | "all"; count?: number }[] = [
  { label: "All", value: "all" },
  { label: "Office supplies", value: "office_supplies" },
  { label: "Cleaning", value: "cleaning" },
  { label: "PPE", value: "ppe" },
  { label: "Medicine", value: "medicine" },
];

const CATEGORY_MAP: Record<string, string> = {
  office_supplies: "Office Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
};

const POLL_INTERVAL_MS = 30_000;

function formatPeso(amount: number): string {
  return `₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function getYYYYMM(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function parseYYYYMM(yyyymm: string): { year: number; month: number } {
  const [y, m] = yyyymm.split("-").map(Number);
  return { year: y, month: m };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatYearMonthDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function monthLabel(yyyymm: string): string {
  const { year, month } = parseYYYYMM(yyyymm);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function daysInMonth(yyyymm: string): number {
  const { year, month } = parseYYYYMM(yyyymm);
  return new Date(year, month, 0).getDate();
}

function prevMonth(yyyymm: string): string {
  const { year, month } = parseYYYYMM(yyyymm);
  const d = new Date(year, month - 2, 1);
  return getYYYYMM(d);
}

function nextMonth(yyyymm: string): string {
  const { year, month } = parseYYYYMM(yyyymm);
  const d = new Date(year, month, 1);
  return getYYYYMM(d);
}

function isFutureMonth(yyyymm: string): boolean {
  return yyyymm > getYYYYMM(new Date());
}

// Build activity sparkline dots (up to ~30 slots representing days of the month)
function normalizeDateString(value: string | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

function buildActivityDots(
  txs: StockTransaction[],
  yyyymm: string,
): { type: "consumed" | "delivered" | "none"; date: string }[] {
  const { year, month } = parseYYYYMM(yyyymm);
  const numDays = new Date(year, month, 0).getDate();
  const dots: { type: "consumed" | "delivered" | "none"; date: string }[] = [];

  for (let d = 1; d <= numDays; d++) {
    const dayStr = `${yyyymm}-${String(d).padStart(2, "0")}`;
    const dayTxs = txs.filter(
      (tx) => normalizeDateString(tx.transactionDate ?? tx.createdAt) === dayStr,
    );
    const hasDelivery = dayTxs.some((tx) => tx.type === "delivery");
    const hasConsumed = dayTxs.some(
      (tx) =>
        tx.type === "manual_adjustment" ||
        tx.type === "supply_request_fulfilled" ||
        tx.type === "ticket_deduction",
    );
    if (hasDelivery) dots.push({ type: "delivered", date: dayStr });
    else if (hasConsumed) dots.push({ type: "consumed", date: dayStr });
    else dots.push({ type: "none", date: dayStr });
  }
  return dots;
}

// ─── Activity Sparkline ────────────────────────────────────────────────────────

function ActivitySparkline({
  dots,
  theme,
}: {
  dots: { type: "consumed" | "delivered" | "none"; date: string }[];
  theme: any;
}) {
  return (
    <div className="flex items-center gap-[2px] flex-wrap" style={{ maxWidth: 220 }}>
      {dots.map((dot, i) => (
        <span
          key={i}
          title={dot.date}
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            flexShrink: 0,
            backgroundColor:
              dot.type === "delivered"
                ? "#3b82f6"
                : dot.type === "consumed"
                  ? "#94a3b8"
                  : theme.border,
            opacity: dot.type === "none" ? 0.4 : 1,
          }}
        />
      ))}
    </div>
  );
}

// ─── Summary KPI cards ────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  valueColor,
  theme,
}: {
  label: string;
  value: string;
  sub?: string;
  valueColor?: string;
  theme: any;
}) {
  return (
    <div
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
      }}
      className="rounded-xl border p-3 lg:p-4 lg:flex-1 lg:min-w-[160px]"
    >
      <p style={{ color: theme.subtext }} className="text-[10px] font-semibold uppercase tracking-wide mb-1 truncate">
        {label}
      </p>
      <p
        style={{ color: valueColor ?? theme.text }}
        className="text-lg lg:text-2xl font-bold leading-none mb-1"
      >
        {value}
      </p>
      {sub && (
        <p style={{ color: theme.subtext }} className="text-[10px] lg:text-xs mt-1 truncate">
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Export helpers ────────────────────────────────────────────────────────────

function exportCsv(rows: MonthlyItemRow[], month: string) {
  const headers = [
    "Item Code", "Item Name", "Brand", "Category", "Unit",
    "Price/Unit", "Beg. Inventory", "Consumed", "Consumption Value",
    "Delivered", "Delivery Value", "Ending Inventory",
  ];
  const lines = rows.map((r) =>
    [
      r.itemCode, r.name, r.brand, CATEGORY_MAP[r.category] ?? r.category,
      r.unit, r.pricePerUnit, r.beginningInventory, r.totalConsumed,
      r.consumptionAmount, r.totalDelivered, r.deliveryAmount, r.endingInventory,
    ].map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `monthly_report_${month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportPdfReport(rows: MonthlyItemRow[], month: string) {
  exportMonthlyReportPdf(rows, month);
}

async function exportExcelReport(
  rows: MonthlyItemRow[],
  txs: StockTransaction[],
  month: string,
) {
  const categories = buildExcelCategories(rows, txs, month);
  await exportMonthlyReportExcel(categories, month);
}

function buildExcelCategories(
  rows: MonthlyItemRow[],
  txs: StockTransaction[],
  yyyymm: string,
): ExcelExportCategory[] {
  const numDays = daysInMonth(yyyymm);
  const { year, month } = parseYYYYMM(yyyymm);
  const startISO = formatYearMonthDay(year, month, 1);
  const endISO = formatYearMonthDay(year, month, numDays);

  const normalizedTxs = txs.map((tx) => ({
    ...tx,
    transactionDate: normalizeDateString(tx.transactionDate ?? tx.createdAt),
    createdAt: normalizeDateString(tx.createdAt),
  }));

  const categories: ExcelExportCategory[] = [
    "office_supplies",
    "cleaning",
    "ppe",
    "medicine",
  ].map((categoryKey) => {
    const rowsForCategory = rows.filter((row) => row.category === categoryKey);
    return {
      categoryKey,
      rows: rowsForCategory.map((row) => {
        const dailyConsumption = Array(numDays).fill(0);
        normalizedTxs
          .filter(
            (tx) =>
              tx.itemId === row.id &&
              tx.transactionDate >= startISO &&
              tx.transactionDate <= endISO &&
              [
                "manual_adjustment",
                "supply_request_fulfilled",
                "ticket_deduction",
              ].includes(tx.type),
          )
          .forEach((tx) => {
            const day = Number(tx.transactionDate.slice(-2));
            if (day >= 1 && day <= numDays) {
              dailyConsumption[day - 1] += Math.abs(tx.quantityChange);
            }
          });

        return {
          id: row.id,
          itemCode: row.itemCode,
          name: row.name,
          brand: row.brand,
          unit: row.unit,
          pricePerUnit: row.pricePerUnit,
          beginningInventory: row.beginningInventory,
          dailyConsumption,
          totalConsumed: row.totalConsumed,
          totalDelivered: row.totalDelivered,
          endingInventory: row.endingInventory,
        };
      }),
    };
  });

  return categories.filter((category) => category.rows.length > 0);
}

// ─── Month selector ────────────────────────────────────────────────────────────

function MonthSelector({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: any;
}) {
  // Build last 24 months
  const options: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push(getYYYYMM(d));
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => onChange(prevMonth(value))}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          color: theme.text,
        }}
        className="w-8 h-9 flex items-center justify-center rounded-lg border text-sm"
      >
        ‹
      </button>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          color: theme.text,
        }}
        className="h-9 px-3 text-sm font-medium border rounded-lg focus:outline-none"
      >
        {options.map((m) => (
          <option key={m} value={m}>
            {monthLabel(m)}
          </option>
        ))}
      </select>
      <button
        onClick={() => onChange(nextMonth(value))}
        disabled={isFutureMonth(nextMonth(value))}
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          color: theme.text,
          opacity: isFutureMonth(nextMonth(value)) ? 0.35 : 1,
        }}
        className="w-8 h-9 flex items-center justify-center rounded-lg border text-sm"
      >
        ›
      </button>
    </div>
  );
}

// ─── Mobile item card ────────────────────────────────────────────────────────

function MonthlyItemCard({ row, theme }: { row: MonthlyItemRow; theme: any }) {
  return (
    <div
      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      className="rounded-lg border px-3 py-2.5 mb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p style={{ color: theme.text }} className="text-sm font-medium truncate">
            {row.name}
          </p>
          <p style={{ color: theme.subtext }} className="text-[11px]">
            {formatPeso(row.pricePerUnit)} per unit
          </p>
        </div>
        <span
          style={{
            color:
              row.endingInventory === 0
                ? "#dc2626"
                : row.endingInventory <= 5
                  ? "#d97706"
                  : theme.text,
          }}
          className="text-base font-bold flex-shrink-0"
        >
          {row.endingInventory}
        </span>
      </div>

      <div
        style={{ borderColor: theme.border }}
        className="flex items-center justify-between gap-2 mt-2 pt-2 border-t text-[11px]"
      >
        <span style={{ color: theme.subtext }}>Beg. {row.beginningInventory}</span>
        <span style={{ color: row.totalConsumed > 0 ? "#dc2626" : theme.subtext }}>
          {row.totalConsumed > 0
            ? `-${row.totalConsumed} (${formatPeso(row.consumptionAmount)})`
            : "No consumption"}
        </span>
        <span style={{ color: row.totalDelivered > 0 ? "#16a34a" : theme.subtext }}>
          {row.totalDelivered > 0 ? `+${row.totalDelivered}` : "Delivered 0"}
        </span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { user?: ADUser };

export default function MonthlyReportPage({ user }: Props) {
  const { theme } = useTheme();

  const [selectedMonth, setSelectedMonth] = useState<string>(getYYYYMM(new Date()));
  const [activeTab, setActiveTab] = useState<CategoryTab | "all">("all");
  const [items, setItems] = useState<OfficeInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  // ── Data loading (MySQL: one-shot fetch, not a live subscription) ──────────
  // getAllInventoryItems / getAllStockTransactions pull everything active /
  // everything logged respectively — same shape the Firestore version's
  // listeners produced, just fetched on demand instead of pushed.
  const isFirstLoad = useRef(true);

  const loadData = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    else setRefreshing(true);
    setError("");

    try {
      const [inv, txs] = await Promise.all([
        getAllInventoryItems(),
        getAllStockTransactions(),
      ]);
      setItems(inv);
      setTransactions(txs);
    } catch (err) {
      console.error("MonthlyReportPage loadData failed:", err);
      setError("Couldn't load the latest data. Showing last known values.");
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load + reload whenever the selected month changes
  useEffect(() => {
    loadData();
  }, [loadData, selectedMonth]);

  // Background refresh: poll + refetch when the tab regains focus
  useEffect(() => {
    const intervalId = setInterval(loadData, POLL_INTERVAL_MS);
    const onFocus = () => loadData();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadData]);

  // ── Compute monthly rows ─────────────────────────────────────────────────────
  const monthlyRows = useMemo((): MonthlyItemRow[] => {
    const { year, month } = parseYYYYMM(selectedMonth);
    const startISO = formatYearMonthDay(year, month, 1);
    const endISO = formatYearMonthDay(year, month, new Date(year, month, 0).getDate());

    const normalizedTransactions = transactions.map((tx) => ({
      ...tx,
      transactionDate: normalizeDateString(tx.transactionDate ?? tx.createdAt),
      createdAt: normalizeDateString(tx.createdAt),
    }));

    // Transactions in selected month
    const monthTxs = normalizedTransactions.filter((tx) => {
      const d = tx.transactionDate;
      return d >= startISO && d <= endISO;
    });

    return items
      .map((item) => {
        const monthForItem = monthTxs.filter((tx) => tx.itemId === item.id);

        // Beginning inventory = current stock minus net of all changes from
        // the start of this month onward (i.e. roll back to month start).
        const sumFromStart = normalizedTransactions
          .filter((tx) => tx.transactionDate >= startISO && tx.itemId === item.id)
          .reduce((acc, tx) => acc + tx.quantityChange, 0);

        const beginningInventory = Math.max(0, item.currentStock - sumFromStart);

        const totalConsumed = monthForItem
          .filter(
            (tx) =>
              tx.type === "manual_adjustment" ||
              tx.type === "supply_request_fulfilled" ||
              tx.type === "ticket_deduction",
          )
          .reduce((acc, tx) => acc + Math.abs(tx.quantityChange), 0);

        const consumptionAmount = monthForItem
          .filter(
            (tx) =>
              tx.type === "manual_adjustment" ||
              tx.type === "supply_request_fulfilled" ||
              tx.type === "ticket_deduction",
          )
          .reduce((acc, tx) => acc + tx.totalAmount, 0);

        const totalDelivered = monthForItem
          .filter((tx) => tx.type === "delivery")
          .reduce((acc, tx) => acc + tx.quantityChange, 0);

        const deliveryAmount = monthForItem
          .filter((tx) => tx.type === "delivery")
          .reduce((acc, tx) => acc + tx.totalAmount, 0);

        const endingInventory = beginningInventory - totalConsumed + totalDelivered;

        const activityDots = buildActivityDots(monthForItem, selectedMonth);

        return {
          id: item.id,
          itemCode: item.itemCode,
          name: item.name,
          brand: item.brand ?? "",
          category: item.category,
          unit: item.unit,
          pricePerUnit: item.pricePerUnit,
          beginningInventory,
          totalConsumed,
          consumptionAmount,
          totalDelivered,
          deliveryAmount,
          endingInventory,
          activityDots,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, transactions, selectedMonth]);

  // ── Tab counts ────────────────────────────────────────────────────────────────
  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: monthlyRows.length };
    monthlyRows.forEach((r) => {
      counts[r.category] = (counts[r.category] ?? 0) + 1;
    });
    return counts;
  }, [monthlyRows]);

  // ── Filtered rows ─────────────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (activeTab === "all") return monthlyRows;
    return monthlyRows.filter((r) => r.category === activeTab);
  }, [monthlyRows, activeTab]);

  // ── KPI summary ───────────────────────────────────────────────────────────────
  const kpi = useMemo(() => {
    const totalConsumptionValue = monthlyRows.reduce((s, r) => s + r.consumptionAmount, 0);
    const totalDeliveryValue = monthlyRows.reduce((s, r) => s + r.deliveryAmount, 0);
    const itemsConsumed = monthlyRows.filter((r) => r.totalConsumed > 0).length;
    const netStockChange = totalDeliveryValue - totalConsumptionValue;
    return { totalConsumptionValue, totalDeliveryValue, itemsConsumed, netStockChange };
  }, [monthlyRows]);

  // ── Tab totals (consumed + delivered) for footer ──────────────────────────────
  const tabTotals = useMemo(() => {
    const totalConsumedP = filteredRows.reduce((s, r) => s + r.consumptionAmount, 0);
    const totalDeliveredP = filteredRows.reduce((s, r) => s + r.deliveryAmount, 0);
    return { totalConsumedP, totalDeliveredP };
  }, [filteredRows]);

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 lg:gap-4 mb-4">
          <div>
            <h1 style={{ color: theme.text }} className="text-xl lg:text-2xl font-bold leading-tight">
              Monthly consumables report
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Generated {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              {user ? ` · ${user.displayName}` : ""}
              {refreshing ? " · Refreshing…" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto">
            <MonthSelector value={selectedMonth} onChange={setSelectedMonth} theme={theme} />

            {/* Manual refresh — MySQL has no live push, so give users a way
                to pull the latest data on demand (e.g. right after logging
                a delivery in another tab). */}
            <button
              onClick={() => void loadData()}
              disabled={refreshing}
              title="Refresh"
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="flex items-center justify-center w-9 h-9 rounded-lg border disabled:opacity-50"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.surface)}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  animation: refreshing ? "spin 0.8s linear infinite" : undefined,
                }}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>

            <button
              onClick={() => void exportExcelReport(filteredRows, transactions, selectedMonth)}
              disabled={filteredRows.length === 0}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border disabled:opacity-50 whitespace-nowrap"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.surface)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </button>

            {/* <button
              onClick={() => exportPdfReport(filteredRows, selectedMonth)}
              disabled={filteredRows.length === 0}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border whitespace-nowrap"
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.surface)}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              PDF
            </button> */}
          </div>
        </div>

        {/* ── KPI Cards ── */}
        {!loading && (
          <div className="grid grid-cols-2 lg:flex gap-2 lg:gap-3 mb-4">
            <KpiCard
              label="Total Consumption Value"
              value={formatPeso(kpi.totalConsumptionValue)}
              sub="Office + Cleaning + PPE + Medicine"
              theme={theme}
            />
            <KpiCard
              label="Total Delivery Value"
              value={formatPeso(kpi.totalDeliveryValue)}
              sub="Restocked this month"
              valueColor="#16a34a"
              theme={theme}
            />
            <KpiCard
              label="Items Consumed"
              value={String(kpi.itemsConsumed)}
              sub="Unique items moved"
              theme={theme}
            />
            <KpiCard
              label="Net Stock Change"
              value={`${kpi.netStockChange >= 0 ? "+" : "−"}${formatPeso(kpi.netStockChange)}`}
              sub="Consumed minus restocked"
              valueColor={kpi.netStockChange >= 0 ? "#16a34a" : "#dc2626"}
              theme={theme}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs px-3 py-2 mb-3">
            ⚠ {error}
          </div>
        )}

        {/* ── Category tabs ── */}
        <div
          style={{ borderBottom: `1px solid ${theme.border}` }}
          className="flex items-end gap-0 -mb-px overflow-x-auto"
        >
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeTab === tab.value;
            const count = tabCounts[tab.value] ?? 0;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                style={{
                  color: isActive ? theme.primary : theme.subtext,
                  borderBottom: isActive ? `2px solid ${theme.primary}` : "2px solid transparent",
                  backgroundColor: "transparent",
                  flexShrink: 0,
                }}
                className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none"
                onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = theme.text; }}
                onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = theme.subtext; }}
              >
                {tab.label}
                <span
                  style={{
                    backgroundColor: isActive ? theme.primary : theme.inputBg,
                    color: isActive ? theme.primaryText : theme.subtext,
                  }}
                  className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div
            style={{ borderColor: theme.primary }}
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          />
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p style={{ color: theme.subtext }} className="text-sm">
            No data for this period.
          </p>
        </div>
      ) : (
        <>
        {/* Desktop table */}
        <div className="hidden lg:block flex-1 overflow-y-auto overflow-x-auto px-4 pb-4">
          <table
            className="min-w-full text-sm"
            style={{ borderCollapse: "separate", borderSpacing: 0 }}
          >
            <thead>
              <tr>
                {[
                  { label: "ITEM", align: "left" },
                  { label: "BEG. INVTY", align: "right" },
                  { label: "ACTIVITY", align: "left" },
                  { label: "CONSUMED", align: "right" },
                  { label: "CONSUMED ₱", align: "right" },
                  { label: "DELIVERED", align: "right" },
                  { label: "DELIVERY ₱", align: "right" },
                  { label: "END INVTY", align: "right" },
                ].map(({ label, align }) => (
                  <th
                    key={label}
                    style={{
                      color: theme.subtext,
                      borderBottom: `1px solid ${theme.border}`,
                      backgroundColor: theme.surfaceRaised,
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      textAlign: align as any,
                    }}
                    className="px-3 py-2 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row, index) => (
                <tr
                  key={row.id}
                  style={{
                    backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
                    borderBottom: `1px solid ${theme.border}`,
                  }}
                >
                  {/* Item */}
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    <div>
                      <p style={{ color: theme.text }} className="text-sm font-medium">
                        {row.name}
                      </p>
                      <p style={{ color: theme.subtext }} className="text-[11px]">
                        {formatPeso(row.pricePerUnit)}
                      </p>
                    </div>
                  </td>

                  {/* Beginning inventory */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <span style={{ color: theme.text }} className="text-sm font-medium">
                      {row.beginningInventory}
                    </span>
                  </td>

                  {/* Activity dots */}
                  <td className="px-3 py-2.5" style={{ minWidth: 220 }}>
                    <ActivitySparkline dots={row.activityDots} theme={theme} />
                  </td>

                  {/* Consumed qty */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <span
                      style={{ color: row.totalConsumed > 0 ? "#dc2626" : theme.subtext }}
                      className="text-sm font-semibold"
                    >
                      {row.totalConsumed > 0 ? `-${row.totalConsumed}` : "0"}
                    </span>
                  </td>

                  {/* Consumed ₱ */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <span
                      style={{ color: row.consumptionAmount > 0 ? "#dc2626" : theme.subtext }}
                      className="text-sm"
                    >
                      {row.consumptionAmount > 0 ? formatPeso(row.consumptionAmount) : "—"}
                    </span>
                  </td>

                  {/* Delivered qty */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <span
                      style={{ color: row.totalDelivered > 0 ? "#16a34a" : theme.subtext }}
                      className="text-sm font-semibold"
                    >
                      {row.totalDelivered > 0 ? `+${row.totalDelivered}` : "0"}
                    </span>
                  </td>

                  {/* Delivery ₱ */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <span
                      style={{ color: row.deliveryAmount > 0 ? "#16a34a" : theme.subtext }}
                      className="text-sm"
                    >
                      {row.deliveryAmount > 0 ? formatPeso(row.deliveryAmount) : "—"}
                    </span>
                  </td>

                  {/* Ending inventory */}
                  <td className="px-3 py-2.5 whitespace-nowrap text-right">
                    <span
                      style={{
                        color:
                          row.endingInventory === 0
                            ? "#dc2626"
                            : row.endingInventory <= 5
                              ? "#d97706"
                              : theme.text,
                      }}
                      className="text-sm font-semibold"
                    >
                      {row.endingInventory}
                    </span>
                  </td>
                </tr>
              ))}

              {/* ── Footer totals row ── */}
              <tr
                style={{
                  backgroundColor: theme.surfaceRaised,
                  borderTop: `2px solid ${theme.border}`,
                  position: "sticky",
                  bottom: 0,
                }}
              >
                <td colSpan={3} className="px-3 py-2.5" />
                <td className="px-3 py-2.5 text-right">
                  <span style={{ color: "#dc2626" }} className="text-sm font-bold">
                    -{filteredRows.reduce((s, r) => s + r.totalConsumed, 0)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span style={{ color: "#dc2626" }} className="text-sm font-bold">
                    {formatPeso(tabTotals.totalConsumedP)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span style={{ color: "#16a34a" }} className="text-sm font-bold">
                    +{filteredRows.reduce((s, r) => s + r.totalDelivered, 0)}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span style={{ color: "#16a34a" }} className="text-sm font-bold">
                    {tabTotals.totalDeliveredP > 0 ? formatPeso(tabTotals.totalDeliveredP) : "—"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right" />
              </tr>
            </tbody>
          </table>

          {/* ── Legend ── */}
          <div className="flex items-center gap-4 mt-3 px-1">
            <span style={{ color: theme.subtext }} className="text-[11px] font-medium uppercase tracking-wide">
              Activity legend:
            </span>
            <div className="flex items-center gap-1.5">
              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#3b82f6", display: "inline-block" }} />
              <span style={{ color: theme.subtext }} className="text-[11px]">Delivery</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#94a3b8", display: "inline-block" }} />
              <span style={{ color: theme.subtext }} className="text-[11px]">Consumed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: "#e2e8f0", display: "inline-block" }} />
              <span style={{ color: theme.subtext }} className="text-[11px]">No activity</span>
            </div>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="lg:hidden flex-1 overflow-y-auto px-4 pb-4">
          {filteredRows.map((row) => (
            <MonthlyItemCard key={row.id} row={row} theme={theme} />
          ))}

          <div
            style={{ backgroundColor: theme.surfaceRaised, borderColor: theme.border }}
            className="rounded-lg border px-3 py-2.5 mt-1"
          >
            <div className="flex items-center justify-between text-xs font-bold">
              <span style={{ color: theme.text }}>Total</span>
              <span style={{ color: "#dc2626" }}>
                -{filteredRows.reduce((s, r) => s + r.totalConsumed, 0)} ({formatPeso(tabTotals.totalConsumedP)})
              </span>
            </div>
            <div className="flex items-center justify-between text-xs font-bold mt-1">
              <span style={{ color: theme.text }}>Delivered</span>
              <span style={{ color: "#16a34a" }}>
                +{filteredRows.reduce((s, r) => s + r.totalDelivered, 0)}
                {tabTotals.totalDeliveredP > 0 ? ` (${formatPeso(tabTotals.totalDeliveredP)})` : ""}
              </span>
            </div>
          </div>
        </div>
        </>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
