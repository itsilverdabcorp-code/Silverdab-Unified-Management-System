// app/Modules/office/MonthlyReportPage/MonthlyReportPage.web.tsx
//
// Web-only rendering for the Monthly Report page (DOM/table-based UI).
// All data-fetching, aggregation math, and export logic live in
// useMonthlyReportData.ts, shared with MonthlyReportPage.native.tsx, so the
// two platform UIs can never drift out of sync on how numbers are computed.

import React from "react";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser } from "../../../../../types";
import {
  useMonthlyReportData,
  CATEGORY_TABS,
  ACTIVITY_DOT_COLORS,
  formatPeso,
  monthLabel,
  prevMonth,
  nextMonth,
  isFutureMonth,
  getYYYYMM,
  formatDotDate,
  exportExcelReport,
  type ActivityDot,
  type MonthlyItemRow,
} from "./useMonthlyReportData";

// ─── Activity Sparkline ────────────────────────────────────────────────────

function ActivitySparkline({
  dots,
  theme,
}: {
  dots: ActivityDot[];
  theme: any;
}) {
  return (
    <div
      className="flex items-center gap-[2px] flex-wrap"
      style={{ maxWidth: 220 }}
    >
      {dots.map((dot, i) => (
        <div key={i} className="relative group" style={{ width: 5, height: 5 }}>
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              display: "block",
              backgroundColor:
                dot.type === "both"
                  ? ACTIVITY_DOT_COLORS.both
                  : dot.type === "delivered"
                    ? ACTIVITY_DOT_COLORS.delivered
                    : dot.type === "consumed"
                      ? ACTIVITY_DOT_COLORS.consumed
                      : ACTIVITY_DOT_COLORS.none,
              opacity: dot.type === "none" ? 0.6 : 1,
              cursor: dot.type === "none" ? "default" : "pointer",
            }}
          />

          {dot.type !== "none" && (
            <div
              className="absolute z-20 hidden group-hover:block"
              style={{
                bottom: "calc(100% + 6px)",
                left: "50%",
                transform: "translateX(-50%)",
                backgroundColor: theme.surfaceRaised ?? theme.surface,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: 6,
                padding: "6px 8px",
                fontSize: 11,
                lineHeight: 1.4,
                whiteSpace: "nowrap",
                boxShadow: "0 4px 12px rgba(0,0,0,0.18)",
                pointerEvents: "none",
              }}
            >
              <div
                style={{ fontWeight: 700, marginBottom: 2, color: theme.text }}
              >
                {formatDotDate(dot.date)}
              </div>
              {dot.deliveredQty > 0 && (
                <div style={{ color: "#3b82f6" }}>
                  +{dot.deliveredQty} delivered ·{" "}
                  {formatPeso(dot.deliveredAmount)}
                </div>
              )}
              {dot.consumedQty > 0 && (
                <div style={{ color: "#dc2626" }}>
                  -{dot.consumedQty} consumed · {formatPeso(dot.consumedAmount)}
                </div>
              )}
              <div
                style={{
                  position: "absolute",
                  top: "100%",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: `5px solid ${theme.surfaceRaised ?? theme.surface}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 1px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "4px solid transparent",
                  borderRight: "4px solid transparent",
                  borderTop: `4px solid ${theme.border}`,
                  zIndex: -1,
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Summary KPI cards ───────────────────────────────────────────────────────

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
      <p
        style={{ color: theme.subtext }}
        className="text-[10px] font-semibold uppercase tracking-wide mb-1 truncate"
      >
        {label}
      </p>
      <p
        style={{ color: valueColor ?? theme.text }}
        className="text-lg lg:text-2xl font-bold leading-none mb-1"
      >
        {value}
      </p>
      {sub && (
        <p
          style={{ color: theme.subtext }}
          className="text-[10px] lg:text-xs mt-1 truncate"
        >
          {sub}
        </p>
      )}
    </div>
  );
}

// ─── Month selector ──────────────────────────────────────────────────────────

function MonthSelector({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: any;
}) {
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

// ─── Mobile item card (used inside the web page's own small-viewport view) ──

function MonthlyItemCard({ row, theme }: { row: MonthlyItemRow; theme: any }) {
  return (
    <div
      style={{ backgroundColor: theme.surface, borderColor: theme.border }}
      className="rounded-lg border px-3 py-2.5 mb-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p
            style={{ color: theme.text }}
            className="text-sm font-medium truncate"
          >
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
        <span style={{ color: theme.subtext }}>
          Beg. {row.beginningInventory}
        </span>
        <span
          style={{ color: row.totalConsumed > 0 ? "#dc2626" : theme.subtext }}
        >
          {row.totalConsumed > 0
            ? `-${row.totalConsumed} (${formatPeso(row.consumptionAmount)})`
            : "No consumption"}
        </span>
        <span
          style={{ color: row.totalDelivered > 0 ? "#16a34a" : theme.subtext }}
        >
          {row.totalDelivered > 0 ? `+${row.totalDelivered}` : "Delivered 0"}
        </span>
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

type Props = { user?: ADUser };

export default function MonthlyReportPage({ user }: Props) {
  const { theme } = useTheme();
  const {
    selectedMonth,
    setSelectedMonth,
    activeTab,
    setActiveTab,
    transactions,
    loading,
    refreshing,
    error,
    loadData,
    tabCounts,
    filteredRows,
    kpi,
    tabTotals,
  } = useMonthlyReportData({ user });

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3 lg:gap-4 mb-4">
          <div>
            <h1
              style={{ color: theme.text }}
              className="text-xl lg:text-2xl font-bold leading-tight"
            >
              Monthly consumables report
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Generated{" "}
              {new Date().toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
              {user ? ` · ${user.displayName}` : ""}
              {refreshing ? " · Refreshing…" : ""}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 overflow-x-auto">
            <MonthSelector
              value={selectedMonth}
              onChange={setSelectedMonth}
              theme={theme}
            />

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
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.bgHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.surface)
              }
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
                  animation: refreshing
                    ? "spin 0.8s linear infinite"
                    : undefined,
                }}
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>

            <button
              onClick={() =>
                void exportExcelReport(
                  filteredRows,
                  transactions,
                  selectedMonth,
                )
              }
              disabled={filteredRows.length === 0}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="flex items-center gap-1.5 h-9 px-3 text-sm font-medium rounded-lg border disabled:opacity-50 whitespace-nowrap"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.bgHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.surface)
              }
            >
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
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Excel
            </button>
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
                  borderBottom: isActive
                    ? `2px solid ${theme.primary}`
                    : "2px solid transparent",
                  backgroundColor: "transparent",
                  flexShrink: 0,
                }}
                className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none"
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.color = theme.text;
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.color = theme.subtext;
                }}
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
                      backgroundColor:
                        index % 2 === 0 ? theme.surface : theme.background,
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <div>
                        <p
                          style={{ color: theme.text }}
                          className="text-sm font-medium"
                        >
                          {row.name}
                        </p>
                        <p
                          style={{ color: theme.subtext }}
                          className="text-[11px]"
                        >
                          {formatPeso(row.pricePerUnit)}
                        </p>
                      </div>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <span
                        style={{ color: theme.text }}
                        className="text-sm font-medium"
                      >
                        {row.beginningInventory}
                      </span>
                    </td>

                    <td className="px-3 py-2.5" style={{ minWidth: 220 }}>
                      <ActivitySparkline
                        dots={row.activityDots}
                        theme={theme}
                      />
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <span
                        style={{
                          color:
                            row.totalConsumed > 0 ? "#dc2626" : theme.subtext,
                        }}
                        className="text-sm font-semibold"
                      >
                        {row.totalConsumed > 0 ? `-${row.totalConsumed}` : "0"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <span
                        style={{
                          color:
                            row.consumptionAmount > 0
                              ? "#dc2626"
                              : theme.subtext,
                        }}
                        className="text-sm"
                      >
                        {row.consumptionAmount > 0
                          ? formatPeso(row.consumptionAmount)
                          : "—"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <span
                        style={{
                          color:
                            row.totalDelivered > 0 ? "#16a34a" : theme.subtext,
                        }}
                        className="text-sm font-semibold"
                      >
                        {row.totalDelivered > 0
                          ? `+${row.totalDelivered}`
                          : "0"}
                      </span>
                    </td>

                    <td className="px-3 py-2.5 whitespace-nowrap text-right">
                      <span
                        style={{
                          color:
                            row.deliveryAmount > 0 ? "#16a34a" : theme.subtext,
                        }}
                        className="text-sm"
                      >
                        {row.deliveryAmount > 0
                          ? formatPeso(row.deliveryAmount)
                          : "—"}
                      </span>
                    </td>

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
                  <td colSpan={3} className="px-3 py-2.5">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        style={{ color: theme.subtext }}
                        className="text-[10px] font-semibold uppercase tracking-wide"
                      >
                        Activity legend:
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            backgroundColor: ACTIVITY_DOT_COLORS.delivered,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: theme.subtext }} className="text-[11px]">
                          Delivery
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            backgroundColor: ACTIVITY_DOT_COLORS.consumed,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: theme.subtext }} className="text-[11px]">
                          Consumed
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            backgroundColor: ACTIVITY_DOT_COLORS.both,
                            display: "inline-block",
                          }}
                        />
                        <span style={{ color: theme.subtext }} className="text-[11px]">
                          Delivered + Consumed
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: "50%",
                            backgroundColor: ACTIVITY_DOT_COLORS.none,
                            display: "inline-block",
                            opacity: 0.6,
                          }}
                        />
                        <span style={{ color: theme.subtext }} className="text-[11px]">
                          No activity
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      style={{ color: "#dc2626" }}
                      className="text-sm font-bold"
                    >
                      -{filteredRows.reduce((s, r) => s + r.totalConsumed, 0)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      style={{ color: "#dc2626" }}
                      className="text-sm font-bold"
                    >
                      {formatPeso(tabTotals.totalConsumedP)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      style={{ color: "#16a34a" }}
                      className="text-sm font-bold"
                    >
                      +{filteredRows.reduce((s, r) => s + r.totalDelivered, 0)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <span
                      style={{ color: "#16a34a" }}
                      className="text-sm font-bold"
                    >
                      {tabTotals.totalDeliveredP > 0
                        ? formatPeso(tabTotals.totalDeliveredP)
                        : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right" />
                </tr>
              </tbody>
            </table>
          </div>

          {/* Mobile cards (small-viewport web, e.g. narrow browser window) */}
          <div className="lg:hidden flex-1 overflow-y-auto px-4 pb-4">
            {filteredRows.map((row) => (
              <MonthlyItemCard key={row.id} row={row} theme={theme} />
            ))}

            <div
              style={{
                backgroundColor: theme.surfaceRaised,
                borderColor: theme.border,
              }}
              className="rounded-lg border px-3 py-2.5 mt-1"
            >
              <div className="flex items-center justify-between text-xs font-bold">
                <span style={{ color: theme.text }}>Total</span>
                <span style={{ color: "#dc2626" }}>
                  -{filteredRows.reduce((s, r) => s + r.totalConsumed, 0)} (
                  {formatPeso(tabTotals.totalConsumedP)})
                </span>
              </div>
              <div className="flex items-center justify-between text-xs font-bold mt-1">
                <span style={{ color: theme.text }}>Delivered</span>
                <span style={{ color: "#16a34a" }}>
                  +{filteredRows.reduce((s, r) => s + r.totalDelivered, 0)}
                  {tabTotals.totalDeliveredP > 0
                    ? ` (${formatPeso(tabTotals.totalDeliveredP)})`
                    : ""}
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