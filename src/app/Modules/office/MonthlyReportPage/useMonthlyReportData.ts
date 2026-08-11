// Shared data-fetching, aggregation, and export logic for the Monthly
// Report page — used by both MonthlyReportPage.web.tsx and
// MonthlyReportPage.native.tsx so the two platform UIs never drift out of
// sync on how numbers are computed.

import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { ADUser, OfficeInventoryItem, StockTransaction } from "../../../../../types";
import {
  getAllInventoryItems,
  getAllStockTransactions,
} from "../../../../services/Officeinventory";
import { exportMonthlyReportPdf } from "../../../../services/exportMonthlyReportPdf";
import {
  exportMonthlyReportExcel,
  ExcelExportCategory,
} from "../../../../services/exportMonthlyReportExcel";

// ─── Types ────────────────────────────────────────────────────────────────

export type CategoryTab = "office_supplies" | "cleaning" | "ppe" | "medicine" | "pantry";

export type ActivityDot = {
  type: "consumed" | "delivered" | "both" | "none";
  date: string;
  deliveredQty: number;
  deliveredAmount: number;
  consumedQty: number;
  consumedAmount: number;
};

export type MonthlyItemRow = {
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
  activityDots: ActivityDot[];
};

// ─── Constants ────────────────────────────────────────────────────────────

export const CATEGORY_TABS: {
  label: string;
  value: CategoryTab | "all";
}[] = [
  { label: "All", value: "all" },
  { label: "Office supplies", value: "office_supplies" },
  { label: "Cleaning", value: "cleaning" },
  { label: "PPE", value: "ppe" },
  { label: "Medicine", value: "medicine" },
  { label: "Pantry", value: "pantry" },
];

export const CATEGORY_MAP: Record<string, string> = {
  office_supplies: "Office Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
  pantry: "Pantry",
};

export const ACTIVITY_DOT_COLORS = {
  delivered: "#3b82f6",
  consumed: "#dc2626",
  both: "#8b5cf6",
  none: "#3f4a5c",
} as const;

const POLL_INTERVAL_MS = 30_000;

// ─── Helpers ──────────────────────────────────────────────────────────────

export function formatPeso(amount: number): string {
  return `₱${Math.abs(amount).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function getYYYYMM(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function parseYYYYMM(yyyymm: string): { year: number; month: number } {
  const [y, m] = yyyymm.split("-").map(Number);
  return { year: y, month: m };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatYearMonthDay(year: number, month: number, day: number): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function monthLabel(yyyymm: string): string {
  const { year, month } = parseYYYYMM(yyyymm);
  return new Date(year, month - 1, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function daysInMonth(yyyymm: string): number {
  const { year, month } = parseYYYYMM(yyyymm);
  return new Date(year, month, 0).getDate();
}

export function prevMonth(yyyymm: string): string {
  const { year, month } = parseYYYYMM(yyyymm);
  const d = new Date(year, month - 2, 1);
  return getYYYYMM(d);
}

export function nextMonth(yyyymm: string): string {
  const { year, month } = parseYYYYMM(yyyymm);
  const d = new Date(year, month, 1);
  return getYYYYMM(d);
}

export function isFutureMonth(yyyymm: string): boolean {
  return yyyymm > getYYYYMM(new Date());
}

export function normalizeDateString(value: string | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

export function formatDotDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function buildActivityDots(txs: StockTransaction[], yyyymm: string): ActivityDot[] {
  const { year, month } = parseYYYYMM(yyyymm);
  const numDays = new Date(year, month, 0).getDate();
  const dots: ActivityDot[] = [];

  for (let d = 1; d <= numDays; d++) {
    const dayStr = `${yyyymm}-${String(d).padStart(2, "0")}`;
    const dayTxs = txs.filter(
      (tx) => normalizeDateString(tx.transactionDate ?? tx.createdAt) === dayStr,
    );

    const deliveries = dayTxs.filter((tx) => tx.type === "delivery");
    const consumptions = dayTxs.filter(
      (tx) =>
        tx.type === "manual_adjustment" ||
        tx.type === "supply_request_fulfilled" ||
        tx.type === "ticket_deduction",
    );

    const deliveredQty = deliveries.reduce((s, tx) => s + tx.quantityChange, 0);
    const deliveredAmount = deliveries.reduce((s, tx) => s + tx.totalAmount, 0);
    const consumedQty = consumptions.reduce((s, tx) => s + Math.abs(tx.quantityChange), 0);
    const consumedAmount = consumptions.reduce((s, tx) => s + tx.totalAmount, 0);

    let type: ActivityDot["type"] = "none";
    if (deliveredQty > 0 && consumedQty > 0) type = "both";
    else if (deliveredQty > 0) type = "delivered";
    else if (consumedQty > 0) type = "consumed";

    dots.push({ type, date: dayStr, deliveredQty, deliveredAmount, consumedQty, consumedAmount });
  }
  return dots;
}

// ─── Export helpers ─────────────────────────────────────────────────────────

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

export function exportCsv(rows: MonthlyItemRow[], month: string) {
  const headers = [
    "Item Code", "Item Name", "Brand", "Category", "Unit", "Price/Unit",
    "Beg. Inventory", "Consumed", "Consumption Value", "Delivered",
    "Delivery Value", "Ending Inventory",
  ];
  const lines = rows.map((r) =>
    [
      r.itemCode, r.name, r.brand, CATEGORY_MAP[r.category] ?? r.category,
      r.unit, r.pricePerUnit, r.beginningInventory, r.totalConsumed,
      r.consumptionAmount, r.totalDelivered, r.deliveryAmount, r.endingInventory,
    ]
      .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`)
      .join(","),
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

export function exportPdfReport(rows: MonthlyItemRow[], month: string) {
  exportMonthlyReportPdf(rows, month);
}

export async function exportExcelReport(
  rows: MonthlyItemRow[],
  txs: StockTransaction[],
  month: string,
) {
  const categories = buildExcelCategories(rows, txs, month);
  await exportMonthlyReportExcel(categories, month);
}

// ─── The shared hook ────────────────────────────────────────────────────────

type Props = { user?: ADUser };

export function useMonthlyReportData({ user }: Props) {
  const [selectedMonth, setSelectedMonth] = useState<string>(getYYYYMM(new Date()));
  const [activeTab, setActiveTab] = useState<CategoryTab | "all">("all");
  const [items, setItems] = useState<OfficeInventoryItem[]>([]);
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

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

  useEffect(() => {
    loadData();
  }, [loadData, selectedMonth]);

  // Background polling + refetch on focus is a web-only concept (window
  // events), so it's guarded here rather than duplicated in each platform
  // file.
  useEffect(() => {
    const intervalId = setInterval(loadData, POLL_INTERVAL_MS);
    let removeFocusListener: (() => void) | undefined;
    if (typeof window !== "undefined" && window.addEventListener) {
      const onFocus = () => loadData();
      window.addEventListener("focus", onFocus);
      removeFocusListener = () => window.removeEventListener("focus", onFocus);
    }
    return () => {
      clearInterval(intervalId);
      removeFocusListener?.();
    };
  }, [loadData]);

  const monthlyRows = useMemo((): MonthlyItemRow[] => {
    const { year, month } = parseYYYYMM(selectedMonth);
    const startISO = formatYearMonthDay(year, month, 1);
    const endISO = formatYearMonthDay(year, month, new Date(year, month, 0).getDate());

    const normalizedTransactions = transactions.map((tx) => ({
      ...tx,
      transactionDate: normalizeDateString(tx.transactionDate ?? tx.createdAt),
      createdAt: normalizeDateString(tx.createdAt),
    }));

    const monthTxs = normalizedTransactions.filter((tx) => {
      const d = tx.transactionDate;
      return d >= startISO && d <= endISO;
    });

    return items
      .map((item) => {
        const monthForItem = monthTxs.filter((tx) => tx.itemId === item.id);

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

  const tabCounts = useMemo(() => {
    const counts: Record<string, number> = { all: monthlyRows.length };
    monthlyRows.forEach((r) => {
      counts[r.category] = (counts[r.category] ?? 0) + 1;
    });
    return counts;
  }, [monthlyRows]);

  const filteredRows = useMemo(() => {
    if (activeTab === "all") return monthlyRows;
    return monthlyRows.filter((r) => r.category === activeTab);
  }, [monthlyRows, activeTab]);

  const kpi = useMemo(() => {
    const totalConsumptionValue = monthlyRows.reduce((s, r) => s + r.consumptionAmount, 0);
    const totalDeliveryValue = monthlyRows.reduce((s, r) => s + r.deliveryAmount, 0);
    const itemsConsumed = monthlyRows.filter((r) => r.totalConsumed > 0).length;
    const netStockChange = totalDeliveryValue - totalConsumptionValue;
    return { totalConsumptionValue, totalDeliveryValue, itemsConsumed, netStockChange };
  }, [monthlyRows]);

  const tabTotals = useMemo(() => {
    const totalConsumedP = filteredRows.reduce((s, r) => s + r.consumptionAmount, 0);
    const totalDeliveredP = filteredRows.reduce((s, r) => s + r.deliveryAmount, 0);
    return { totalConsumedP, totalDeliveredP };
  }, [filteredRows]);

  return {
    user,
    selectedMonth,
    setSelectedMonth,
    activeTab,
    setActiveTab,
    transactions,
    loading,
    refreshing,
    error,
    loadData,
    monthlyRows,
    tabCounts,
    filteredRows,
    kpi,
    tabTotals,
  };
}