import React from "react";
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser } from "../../../../../types";
import {
  useMonthlyReportData,
  CATEGORY_TABS,
  formatPeso,
  monthLabel,
  prevMonth,
  nextMonth,
  isFutureMonth,
  type MonthlyItemRow,
} from "./useMonthlyReportData";

type Props = { user?: ADUser };

function MonthlyItemCard({ row, theme }: { row: MonthlyItemRow; theme: any }) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>
            {row.name}
          </Text>
          <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
            {formatPeso(row.pricePerUnit)} per unit
          </Text>
        </View>
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color:
              row.endingInventory === 0
                ? "#dc2626"
                : row.endingInventory <= 5
                  ? "#d97706"
                  : theme.text,
          }}
        >
          {row.endingInventory}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 8,
          paddingTop: 8,
          borderTopWidth: 1,
          borderTopColor: theme.border,
        }}
      >
        <Text style={{ color: theme.subtext, fontSize: 11 }}>
          Beg. {row.beginningInventory}
        </Text>
        <Text style={{ color: row.totalConsumed > 0 ? "#dc2626" : theme.subtext, fontSize: 11 }}>
          {row.totalConsumed > 0
            ? `-${row.totalConsumed} (${formatPeso(row.consumptionAmount)})`
            : "No consumption"}
        </Text>
        <Text style={{ color: row.totalDelivered > 0 ? "#16a34a" : theme.subtext, fontSize: 11 }}>
          {row.totalDelivered > 0 ? `+${row.totalDelivered}` : "Delivered 0"}
        </Text>
      </View>
    </View>
  );
}

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
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        flexBasis: "48%",
        marginBottom: 8,
      }}
    >
      <Text style={{ color: theme.subtext, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase", marginBottom: 4 }}>
        {label}
      </Text>
      <Text style={{ color: valueColor ?? theme.text, fontSize: 18, fontWeight: "700" }}>
        {value}
      </Text>
      {sub && (
        <Text style={{ color: theme.subtext, fontSize: 10, marginTop: 2 }}>{sub}</Text>
      )}
    </View>
  );
}

export default function MonthlyReportPage({ user }: Props) {
  const { theme } = useTheme();
  const {
    selectedMonth,
    setSelectedMonth,
    activeTab,
    setActiveTab,
    loading,
    refreshing,
    error,
    tabCounts,
    filteredRows,
    kpi,
    tabTotals,
  } = useMonthlyReportData({ user });

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.background }}>
        <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
        Monthly consumables report
      </Text>
      <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2, marginBottom: 14 }}>
        {monthLabel(selectedMonth)}
        {refreshing ? " · Refreshing…" : ""}
      </Text>

      {/* Month selector */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <TouchableOpacity
          onPress={() => setSelectedMonth(prevMonth(selectedMonth))}
          style={{
            width: 36, height: 36, borderRadius: 8,
            borderWidth: 1, borderColor: theme.border,
            alignItems: "center", justifyContent: "center",
            backgroundColor: theme.surface,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 16 }}>‹</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600", flex: 1, textAlign: "center" }}>
          {monthLabel(selectedMonth)}
        </Text>
        <TouchableOpacity
          onPress={() => !isFutureMonth(nextMonth(selectedMonth)) && setSelectedMonth(nextMonth(selectedMonth))}
          disabled={isFutureMonth(nextMonth(selectedMonth))}
          style={{
            width: 36, height: 36, borderRadius: 8,
            borderWidth: 1, borderColor: theme.border,
            alignItems: "center", justifyContent: "center",
            backgroundColor: theme.surface,
            opacity: isFutureMonth(nextMonth(selectedMonth)) ? 0.4 : 1,
          }}
        >
          <Text style={{ color: theme.text, fontSize: 16 }}>›</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10, marginBottom: 12 }}>
          <Text style={{ color: "#b91c1c", fontSize: 12 }}>⚠ {error}</Text>
        </View>
      ) : null}

      {/* KPI cards */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginBottom: 6 }}>
        <KpiCard label="Consumption Value" value={formatPeso(kpi.totalConsumptionValue)} theme={theme} />
        <KpiCard label="Delivery Value" value={formatPeso(kpi.totalDeliveryValue)} valueColor="#16a34a" theme={theme} />
        <KpiCard label="Items Consumed" value={String(kpi.itemsConsumed)} theme={theme} />
        <KpiCard
          label="Net Stock Change"
          value={`${kpi.netStockChange >= 0 ? "+" : "−"}${formatPeso(kpi.netStockChange)}`}
          valueColor={kpi.netStockChange >= 0 ? "#16a34a" : "#dc2626"}
          theme={theme}
        />
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {CATEGORY_TABS.map((tab) => {
            const active = activeTab === tab.value;
            return (
              <TouchableOpacity
                key={tab.value}
                onPress={() => setActiveTab(tab.value)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  backgroundColor: active ? theme.primary : theme.surface,
                  borderWidth: 1,
                  borderColor: active ? theme.primary : theme.border,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "600",
                    color: active ? (theme.primaryText ?? "#fff") : theme.subtext,
                  }}
                >
                  {tab.label} ({tabCounts[tab.value] ?? 0})
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Item cards */}
      {filteredRows.length === 0 ? (
        <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center", paddingVertical: 32 }}>
          No data for this period.
        </Text>
      ) : (
        <>
          {filteredRows.map((row) => (
            <MonthlyItemCard key={row.id} row={row} theme={theme} />
          ))}

          <View
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
              borderRadius: 10,
              padding: 12,
              marginTop: 4,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>Total consumed</Text>
              <Text style={{ color: "#dc2626", fontSize: 12, fontWeight: "700" }}>
                -{filteredRows.reduce((s, r) => s + r.totalConsumed, 0)} ({formatPeso(tabTotals.totalConsumedP)})
              </Text>
            </View>
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>Total delivered</Text>
              <Text style={{ color: "#16a34a", fontSize: 12, fontWeight: "700" }}>
                +{filteredRows.reduce((s, r) => s + r.totalDelivered, 0)}
                {tabTotals.totalDeliveredP > 0 ? ` (${formatPeso(tabTotals.totalDeliveredP)})` : ""}
              </Text>
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}