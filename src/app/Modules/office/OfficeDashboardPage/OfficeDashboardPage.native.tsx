import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
  RefreshControl,
} from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser, SupplyRequest } from "../../../../../types";
import {
  useOfficeDashboardData,
  NavTarget,
  NavPayload,
  DashboardInventoryFilter,
  MobileTab,
  ATTENTION_FILTER_OPTIONS,
  CATEGORY_LABELS,
  CATEGORY_COLORS,
  CHART_CATEGORY_FILL,
  CHART_CATEGORY_LABELS,
  REQUEST_STATUS_STYLE,
  ACTIVITY_ACTION_STYLE,
  DASHBOARD_MAX_COMPARE_ITEMS,
  DASHBOARD_ITEM_COMPARE_COLORS,
  formatDateTime,
  getInitials,
  avatarColor,
  effectiveStatus,
  statusLabel,
} from "./useOfficeDashboardData";

// Plain-text glyphs instead of the web page's inline SVGs — swap for
// lucide-react-native or similar if you already depend on an icon lib.
const ACTIVITY_ACTION_GLYPH: Record<string, string> = {
  delivery: "✓",
  manual_adjustment: "±",
  supply_request_fulfilled: "✓",
  ticket_deduction: "−",
};

// ─── Small building blocks ──────────────────────────────────────────────

function KpiCard({
  label, value, sub, valueColor, onPress, theme,
}: {
  label: string;
  value: string | number;
  sub?: string;
  valueColor?: string;
  onPress?: () => void;
  theme: any;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 14,
        flex: 1,
        minWidth: "45%",
        gap: 6,
      }}
    >
      <Text style={{ color: theme.subtext, fontSize: 10.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text style={{ color: valueColor ?? theme.text, fontSize: 26, fontWeight: "700" }}>{value}</Text>
      {sub ? <Text style={{ color: theme.subtext, fontSize: 11 }}>{sub}</Text> : null}
    </TouchableOpacity>
  );
}

function SectionHeader({
  title, action, actionLabel, theme,
}: {
  title: string;
  action?: () => void;
  actionLabel?: string;
  theme: any;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>{title}</Text>
      {action && actionLabel && (
        <TouchableOpacity onPress={action}>
          <Text style={{ color: theme.primary, fontSize: 11, fontWeight: "600" }}>{actionLabel} →</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

function Avatar({ name, size = 28, theme }: { name: string; size?: number; theme: any }) {
  const colors = avatarColor(name);
  return (
    <View
      style={{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: colors.bg, alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}
    >
      <Text style={{ color: colors.text, fontSize: size * 0.36, fontWeight: "700" }}>{getInitials(name)}</Text>
    </View>
  );
}

function StockBadge({ status, theme }: { status: string; theme: any }) {
  const map: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    in_stock: { bg: "#dcfce7", text: "#166534", dot: "#22c55e", label: "In stock" },
    low_stock: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b", label: "Low stock" },
    out_of_stock: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444", label: "Out of stock" },
  };
  const s = map[status] ?? { bg: "#f1f5f9", text: "#475569", dot: "#94a3b8", label: status };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: s.bg, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999 }}>
      <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: s.dot }} />
      <Text style={{ color: s.text, fontSize: 10, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

function AlertBanner({
  outOfStockWithPending, onViewRequests, theme,
}: {
  outOfStockWithPending: { name: string; pendingCount: number }[];
  onViewRequests?: () => void;
  theme: any;
}) {
  if (outOfStockWithPending.length === 0) return null;
  const total = outOfStockWithPending.reduce((sum, e) => sum + e.pendingCount, 0);
  const firstName = outOfStockWithPending[0].name;
  const extra = outOfStockWithPending.length - 1;

  return (
    <View style={{ backgroundColor: "#fffbeb", borderColor: "#fde68a", borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <Text style={{ color: "#92400e", fontSize: 11.5, flex: 1, lineHeight: 16 }}>
        <Text style={{ fontWeight: "700" }}>{total} pending {total === 1 ? "request" : "requests"}</Text>
        {" "}for <Text style={{ fontWeight: "700" }}>{firstName}</Text>
        {extra > 0 ? ` and ${extra} other item${extra > 1 ? "s" : ""}` : ""} — stock now out.
      </Text>
      {onViewRequests && (
        <TouchableOpacity onPress={onViewRequests} style={{ borderWidth: 1, borderColor: "#fcd34d", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ color: "#92400e", fontSize: 11, fontWeight: "600" }}>View</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Chart replacements (View-based bars — no chart library assumed) ────

function HorizontalBarRow({
  label, value, max, unit, color, theme,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  color: string;
  theme: any;
}) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <View style={{ marginBottom: 10 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
        <Text style={{ color: theme.text, fontSize: 11.5, fontWeight: "500", flex: 1, marginRight: 8 }} numberOfLines={1}>
          {label}
        </Text>
        <Text style={{ color: theme.subtext, fontSize: 11 }}>
          {value}{unit ? ` ${unit}` : ""}
        </Text>
      </View>
      <View style={{ backgroundColor: theme.border, height: 7, borderRadius: 99, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: color, borderRadius: 99 }} />
      </View>
    </View>
  );
}

function MonthlyTrendChart({
  data, selectedItems, theme,
}: {
  data: { ym: string; label: string; qty: number; [key: string]: any }[];
  selectedItems: { id: string; name: string }[];
  theme: any;
}) {
  const CHART_HEIGHT = 110;

  if (selectedItems.length === 0) {
    const max = data.reduce((m, d) => Math.max(m, d.qty), 0) || 1;
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: CHART_HEIGHT + 24 }}>
        {data.map((d, idx) => (
          <View key={d.ym} style={{ alignItems: "center", flex: 1 }}>
            <Text style={{ color: theme.text, fontSize: 10, marginBottom: 3 }}>{d.qty}</Text>
            <View
              style={{
                width: "60%",
                height: Math.max(3, (d.qty / max) * CHART_HEIGHT),
                backgroundColor: idx === data.length - 1 ? (theme.primary ?? "#3b82f6") : "#94a3b8",
                borderRadius: 3,
              }}
            />
            <Text style={{ color: theme.subtext, fontSize: 10, marginTop: 4 }}>{d.label}</Text>
          </View>
        ))}
      </View>
    );
  }

  // Grouped mini-bars per month, one per selected item.
  const max = data.reduce(
    (m, d) => Math.max(m, ...selectedItems.map((it) => d[it.id] ?? 0)),
    0,
  ) || 1;

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10, height: CHART_HEIGHT + 8 }}>
        {data.map((d) => (
          <View key={d.ym} style={{ flex: 1, alignItems: "center" }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: CHART_HEIGHT }}>
              {selectedItems.map((it, idx) => (
                <View
                  key={it.id}
                  style={{
                    width: 6,
                    height: Math.max(2, ((d[it.id] ?? 0) / max) * CHART_HEIGHT),
                    backgroundColor: DASHBOARD_ITEM_COMPARE_COLORS[idx % DASHBOARD_ITEM_COMPARE_COLORS.length],
                    borderRadius: 2,
                  }}
                />
              ))}
            </View>
            <Text style={{ color: theme.subtext, fontSize: 10, marginTop: 4 }}>{d.label}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
        {selectedItems.map((it, idx) => (
          <View key={it.id} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: DASHBOARD_ITEM_COMPARE_COLORS[idx % DASHBOARD_ITEM_COMPARE_COLORS.length] }} />
            <Text style={{ color: theme.subtext, fontSize: 10.5 }} numberOfLines={1}>{it.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Attention filter sheet ─────────────────────────────────────────────

function AttentionFilterSheet({
  visible, filters, onToggle, onSelectAll, onClearAll, onClose, theme,
}: {
  visible: boolean;
  filters: Set<number>;
  onToggle: (priority: number) => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onClose: () => void;
  theme: any;
}) {
  const allOn = filters.size === ATTENTION_FILTER_OPTIONS.length;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>Show priority</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ paddingHorizontal: 18, paddingTop: 10 }}>
            <TouchableOpacity onPress={allOn ? onClearAll : onSelectAll} style={{ alignSelf: "flex-end", marginBottom: 8 }}>
              <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "600" }}>{allOn ? "Clear all" : "Select all"}</Text>
            </TouchableOpacity>
            {ATTENTION_FILTER_OPTIONS.map((opt) => {
              const checked = filters.has(opt.priority);
              return (
                <TouchableOpacity
                  key={opt.priority}
                  onPress={() => onToggle(opt.priority)}
                  style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 }}
                >
                  <View
                    style={{
                      width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
                      borderColor: checked ? theme.primary : theme.border,
                      backgroundColor: checked ? theme.primary : "transparent",
                      alignItems: "center", justifyContent: "center",
                    }}
                  >
                    {checked ? <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text> : null}
                  </View>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: opt.dot }} />
                  <Text style={{ color: theme.text, fontSize: 13, flex: 1 }}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Trend item comparison picker ────────────────────────────────────────

function TrendItemPickerSheet({
  visible, options, search, onSearchChange, selectedIds, onToggle, onClose, theme,
}: {
  visible: boolean;
  options: { id: string; name: string; itemCode: string }[];
  search: string;
  onSearchChange: (v: string) => void;
  selectedIds: string[];
  onToggle: (id: string) => void;
  onClose: () => void;
  theme: any;
}) {
  const results = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((i) => i.name.toLowerCase().includes(q) || i.itemCode.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "75%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: theme.border }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>
              Compare items (up to {DASHBOARD_MAX_COMPARE_ITEMS})
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={{ padding: 18, paddingBottom: 10 }}>
            <TextInput
              placeholder="Search items…"
              placeholderTextColor={theme.subtext}
              value={search}
              onChangeText={onSearchChange}
              style={{
                borderWidth: 1, borderColor: theme.inputBorder, backgroundColor: theme.inputBg, color: theme.inputText,
                borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13,
              }}
            />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 20 }}>
            {results.length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 12, paddingVertical: 8 }}>No items match "{search}"</Text>
            ) : (
              results.map((item) => {
                const checked = selectedIds.includes(item.id);
                const disabled = !checked && selectedIds.length >= DASHBOARD_MAX_COMPARE_ITEMS;
                return (
                  <TouchableOpacity
                    key={item.id}
                    onPress={() => onToggle(item.id)}
                    disabled={disabled}
                    style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9, opacity: disabled ? 0.4 : 1 }}
                  >
                    <View
                      style={{
                        width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
                        borderColor: checked ? theme.primary : theme.border,
                        backgroundColor: checked ? theme.primary : "transparent",
                        alignItems: "center", justifyContent: "center",
                      }}
                    >
                      {checked ? <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text> : null}
                    </View>
                    <Text style={{ color: theme.text, fontSize: 13, flex: 1 }} numberOfLines={1}>{item.name}</Text>
                  </TouchableOpacity>
                );
              })
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Approval stand-in ────────────────────────────────────────────────────
// Bare confirm/reject shell in place of the web-only PartialApprovalModal
// (built with <div>/<input>, can't run on native). No partial-line editing
// yet — wire up a real native form when you're ready; this keeps the
// action reachable in the meantime instead of leaving it dead on mobile.

function ApprovalSheet({
  request, onClose, onApproveAll, onReject, theme,
}: {
  request: SupplyRequest | null;
  onClose: () => void;
  onApproveAll: (req: SupplyRequest) => void;
  onReject: (requestId: string) => void;
  theme: any;
}) {
  if (!request) return null;
  return (
    <Modal visible={request !== null} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 18, width: "100%", maxWidth: 360 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 2 }}>
            Request from {request.requestedByName}
          </Text>
          <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 14 }}>
            {request.items.length} item{request.items.length > 1 ? "s" : ""} requested
          </Text>
          {request.items.map((li) => (
            <Text key={li.itemId} style={{ color: theme.text, fontSize: 12, marginBottom: 4 }}>
              • {li.itemName}
            </Text>
          ))}
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onReject(request.id)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: "#dc2626" }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Reject</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onApproveAll(request)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: theme.primary }}>
              <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 12, fontWeight: "600" }}>Approve all</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

type Props = {
  user?: ADUser;
  onNavigate?: (tab: NavTarget, filter?: DashboardInventoryFilter) => void;
  onNavigateWithPayload?: (payload: NavPayload) => void;
};

export default function OfficeDashboardPage({ user, onNavigate, onNavigateWithPayload }: Props) {
  const { theme } = useTheme();

  const {
    items, requests, loading, loadAll, today,
    kpi, categoryBreakdown, recentRequests, recentActivity,
    graphTopItemsAll,
    graphCategoryBreakdown,
    graphMonthlyTrend,
    trendItemOptions, trendItemSearch, setTrendItemSearch,
    trendItemIds, toggleTrendItem, selectedTrendItems,
    attentionFilters, setAttentionFilters, toggleAttentionFilter, allFiltersOn,
    inventoryPreview, filteredAttentionItems, visibleAttentionItems,
  } = useOfficeDashboardData();

  const [activeTab, setActiveTab] = useState<MobileTab>("attention");
  const [approvalRequest, setApprovalRequest] = useState<SupplyRequest | null>(null);
  const [attentionFilterOpen, setAttentionFilterOpen] = useState(false);
  const [trendPickerOpen, setTrendPickerOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadAll();
    setRefreshing(false);
  };

  const outOfStockWithPending = useMemo(() => {
    const openRequests = requests.filter((r) => r.status === "pending" || r.status === "awaiting_stock");
    return items
      .filter((i) => i.stockStatus === "out_of_stock")
      .map((item) => ({
        name: item.name,
        pendingCount: openRequests.filter((r) => r.items.some((li) => li.itemId === item.id)).length,
      }))
      .filter((e) => e.pendingCount > 0)
      .sort((a, b) => b.pendingCount - a.pendingCount);
  }, [items, requests]);

  const topItemsMax = useMemo(() => graphTopItemsAll.reduce((m, i) => Math.max(m, i.consumed), 0), [graphTopItemsAll]);
  const categoryMax = useMemo(() => graphCategoryBreakdown.reduce((m, c) => Math.max(m, c.consumed), 0), [graphCategoryBreakdown]);

  const TABS: { key: MobileTab; label: string; badge?: number }[] = [
    { key: "attention", label: "Needs attention" },
    { key: "requests", label: "Requests", badge: kpi.pendingReqs },
    { key: "activity", label: "Activity" },
  ];

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={theme.primary} />}
      >
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Dashboard</Text>
        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2, marginBottom: 14 }}>Overview for {today}</Text>

        <AlertBanner
          outOfStockWithPending={outOfStockWithPending}
          onViewRequests={() => onNavigate?.("supply_requests")}
          theme={theme}
        />

        {/* ── KPI grid ── */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          <KpiCard label="Total items" value={kpi.total} sub={`Across ${categoryBreakdown.length} categories`} onPress={() => onNavigate?.("inventory", null)} theme={theme} />
          <KpiCard label="In stock" value={kpi.inStock} sub="Available" valueColor="#16a34a" onPress={() => onNavigate?.("inventory", { field: "stockStatus", value: "in_stock" })} theme={theme} />
          <KpiCard label="Low stock" value={kpi.lowStock} sub="Needs restocking" valueColor="#d97706" onPress={() => onNavigate?.("inventory", { field: "stockStatus", value: "low_stock" })} theme={theme} />
          <KpiCard label="Out of stock" value={kpi.outOfStock} sub={kpi.pendingReqs > 0 ? `${kpi.pendingReqs} with pending requests` : undefined} valueColor="#dc2626" onPress={() => onNavigate?.("inventory", { field: "stockStatus", value: "out_of_stock" })} theme={theme} />
        </View>

        {/* ── Most consumed items ── */}
        <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 2 }}>Most consumed items</Text>
          <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 10 }}>This month</Text>
          {graphTopItemsAll.length === 0 ? (
            <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 16 }}>No consumption yet this month.</Text>
          ) : (
            graphTopItemsAll.slice(0, 8).map((it, idx) => (
              <HorizontalBarRow
                key={`${it.name}-${idx}`}
                label={it.name}
                value={it.consumed}
                max={topItemsMax}
                unit={it.unit}
                color={CHART_CATEGORY_FILL[it.category] ?? CHART_CATEGORY_FILL.other}
                theme={theme}
              />
            ))
          )}
        </View>

        {/* ── Consumption by category ── */}
        <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 2 }}>Consumption by category</Text>
          <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 10 }}>This month</Text>
          {graphCategoryBreakdown.length === 0 ? (
            <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 16 }}>No consumption yet this month.</Text>
          ) : (
            graphCategoryBreakdown.map((c) => (
              <HorizontalBarRow
                key={c.category}
                label={CHART_CATEGORY_LABELS[c.category] ?? c.category}
                value={c.consumed}
                max={categoryMax}
                unit="units"
                color={CHART_CATEGORY_FILL[c.category] ?? CHART_CATEGORY_FILL.other}
                theme={theme}
              />
            ))
          )}
        </View>

        {/* ── Consumption by month ── */}
        <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 16 }}>
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700", marginBottom: 2 }}>Consumption by month</Text>
          <Text style={{ color: theme.subtext, fontSize: 11, marginBottom: 10 }}>
            {selectedTrendItems.length > 0 ? `Comparing ${selectedTrendItems.length} item${selectedTrendItems.length > 1 ? "s" : ""}` : "All items · last 6 months"}
          </Text>

          <TouchableOpacity
            onPress={() => setTrendPickerOpen(true)}
            style={{ borderWidth: 1, borderColor: theme.border, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, marginBottom: 12 }}
          >
            <Text style={{ color: selectedTrendItems.length > 0 ? theme.text : theme.subtext, fontSize: 12 }}>
              {selectedTrendItems.length > 0
                ? `${selectedTrendItems.length} item${selectedTrendItems.length > 1 ? "s" : ""} selected`
                : `Add item to compare (up to ${DASHBOARD_MAX_COMPARE_ITEMS})…`}
            </Text>
          </TouchableOpacity>

          {graphMonthlyTrend.length === 0 ? (
            <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 16 }}>No historical data yet.</Text>
          ) : (
            <MonthlyTrendChart data={graphMonthlyTrend} selectedItems={selectedTrendItems} theme={theme} />
          )}
        </View>

        {/* ── Tab bar ── */}
        <View style={{ flexDirection: "row", gap: 4, backgroundColor: theme.surfaceRaised ?? theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 4, marginBottom: 14 }}>
          {TABS.map((t) => {
            const isActive = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setActiveTab(t.key)}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5,
                  paddingVertical: 8, borderRadius: 7,
                  backgroundColor: isActive ? theme.surface : "transparent",
                }}
              >
                <Text style={{ color: isActive ? theme.text : theme.subtext, fontSize: 11.5, fontWeight: "600" }}>{t.label}</Text>
                {!!t.badge && (
                  <View style={{ backgroundColor: "#ef4444", borderRadius: 999, paddingHorizontal: 5, paddingVertical: 1 }}>
                    <Text style={{ color: "#fff", fontSize: 9, fontWeight: "700" }}>{t.badge}</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ── Needs attention ── */}
        {activeTab === "attention" && (
          <>
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Needs attention</Text>
                <TouchableOpacity
                  onPress={() => setAttentionFilterOpen(true)}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderRadius: 8,
                    borderColor: theme.border, paddingHorizontal: 9, paddingVertical: 5,
                    backgroundColor: allFiltersOn ? "transparent" : `${theme.primary}1a`,
                  }}
                >
                  <Text style={{ color: allFiltersOn ? theme.subtext : theme.primary, fontSize: 11, fontWeight: "600" }}>Filter</Text>
                  {!allFiltersOn && (
                    <View style={{ backgroundColor: theme.primary, borderRadius: 999, width: 15, height: 15, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 9, fontWeight: "700" }}>{attentionFilters.size}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>
              <Text style={{ color: theme.subtext, fontSize: 10.5, marginBottom: 10 }}>Sorted by urgency</Text>

              {inventoryPreview.length === 0 ? (
                <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 12 }}>
                  All items are well-stocked. No action needed.
                </Text>
              ) : filteredAttentionItems.length === 0 ? (
                <View style={{ alignItems: "center", paddingVertical: 12 }}>
                  <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 4 }}>No items match the current filter.</Text>
                  <TouchableOpacity onPress={() => setAttentionFilters(new Set([0, 1, 2, 3, 4]))}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "600" }}>Reset filter</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  {visibleAttentionItems.map((item) => {
                    const catColor = CATEGORY_COLORS[item.category] ?? { bg: "#f1f5f9", text: "#475569" };
                    const priorityConfig =
                      item._priority === 0 ? { label: "Critical", bg: "#fee2e2", text: "#991b1b" }
                      : item._priority === 1 ? { label: "Out of stock", bg: "#fee2e2", text: "#991b1b" }
                      : item._priority === 2 ? { label: "Low + pending", bg: "#fef3c7", text: "#92400e" }
                      : item._priority === 3 ? { label: "Low stock", bg: "#fef3c7", text: "#92400e" }
                      : { label: "Recent activity", bg: "#dbeafe", text: "#1e40af" };

                    return (
                      <View key={item.id} style={{ backgroundColor: theme.surfaceRaised ?? theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 8 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                          <View style={{ flex: 1, marginRight: 8 }}>
                            <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{item.name}</Text>
                            <Text style={{ color: theme.subtext, fontSize: 10.5, fontFamily: "monospace" }}>{item.itemCode}</Text>
                          </View>
                          <View style={{ backgroundColor: priorityConfig.bg, borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3 }}>
                            <Text style={{ color: priorityConfig.text, fontSize: 9.5, fontWeight: "700" }}>{priorityConfig.label}</Text>
                          </View>
                        </View>

                        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                          <View style={{ backgroundColor: catColor.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                            <Text style={{ color: catColor.text, fontSize: 10 }}>{CATEGORY_LABELS[item.category] ?? item.category}</Text>
                          </View>
                          <StockBadge status={item.stockStatus} theme={theme} />
                          <Text style={{ color: theme.text, fontSize: 11, fontWeight: "600" }}>
                            {item.currentStock} <Text style={{ color: theme.subtext, fontWeight: "400" }}>{item.unit}</Text>
                          </Text>
                          <Text style={{ color: theme.text, fontSize: 11 }}>₱{item.pricePerUnit.toLocaleString("en-PH")}</Text>
                        </View>

                        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 8 }}>
                          {item._pendingCount > 0 ? (
                            <TouchableOpacity onPress={() => onNavigate?.("supply_requests")} style={{ backgroundColor: "#fee2e2", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 }}>
                              <Text style={{ color: "#991b1b", fontSize: 10.5, fontWeight: "700" }}>{item._pendingCount} pending</Text>
                            </TouchableOpacity>
                          ) : (
                            <Text style={{ color: theme.subtext, fontSize: 10.5 }}>No pending reqs</Text>
                          )}
                          <TouchableOpacity
                            onPress={() => onNavigateWithPayload?.({ tab: "inventory_deliver", deliverItem: item })}
                            style={{ backgroundColor: theme.primary, borderRadius: 7, paddingHorizontal: 10, paddingVertical: 5 }}
                          >
                            <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 10.5, fontWeight: "600" }}>+ Add stock</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}

                  <Text style={{ color: theme.subtext, fontSize: 10.5, marginBottom: 4 }}>
                    Showing {visibleAttentionItems.length} of {filteredAttentionItems.length}
                    {filteredAttentionItems.length !== inventoryPreview.length ? ` matching filter · ${inventoryPreview.length} total` : ""}
                  </Text>
                  <TouchableOpacity onPress={() => onNavigate?.("inventory")}>
                    <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "600" }}>View all {items.length} items →</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>

            {/* Category breakdown */}
            <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
              <SectionHeader title="Category breakdown" action={() => onNavigate?.("inventory")} actionLabel="Full inventory" theme={theme} />
              {categoryBreakdown.map((cat) => {
                const pct = cat.total > 0 ? Math.round((cat.inStock / cat.total) * 100) : 0;
                const color = CATEGORY_COLORS[cat.category] ?? { bg: "#f1f5f9", text: "#475569" };
                return (
                  <View key={cat.category} style={{ marginBottom: 12 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <View style={{ backgroundColor: color.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ color: color.text, fontSize: 10.5, fontWeight: "500" }}>{CATEGORY_LABELS[cat.category] ?? cat.category}</Text>
                      </View>
                      <Text style={{ color: theme.subtext, fontSize: 11 }}>{cat.total} items</Text>
                    </View>
                    <View style={{ backgroundColor: theme.border, height: 6, borderRadius: 99, overflow: "hidden" }}>
                      <View style={{ width: `${pct}%`, height: "100%", borderRadius: 99, backgroundColor: pct < 40 ? "#ef4444" : pct < 70 ? "#f59e0b" : "#22c55e" }} />
                    </View>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 5 }}>
                      {cat.lowStock > 0 && <Text style={{ color: "#d97706", fontSize: 10.5 }}>⚠ {cat.lowStock} low</Text>}
                      {cat.outOfStock > 0 && <Text style={{ color: "#dc2626", fontSize: 10.5 }}>✕ {cat.outOfStock} out</Text>}
                      <Text style={{ color: theme.subtext, fontSize: 10.5 }}>{pct}% in stock</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </>
        )}

        {/* ── Pending requests ── */}
        {activeTab === "requests" && (
          <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Pending requests</Text>
              <TouchableOpacity onPress={() => onNavigate?.("supply_requests")}>
                <Text style={{ color: theme.primary, fontSize: 11, fontWeight: "600" }}>All →</Text>
              </TouchableOpacity>
            </View>

            {recentRequests.filter((r) => r.status === "pending" || r.status === "awaiting_stock" || r.status === "out_for_delivery").length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 12 }}>No pending requests.</Text>
            ) : (
              recentRequests
                .filter((r) => r.status === "pending" || r.status === "awaiting_stock" || r.status === "out_for_delivery")
                .map((r) => {
                  const effStatus = effectiveStatus(r);
                  const firstItem = r.items[0];
                  const extra = r.items.length - 1;
                  const isOutForDelivery = r.status === "out_for_delivery";
                  const st = REQUEST_STATUS_STYLE[effStatus] ?? { bg: "#f1f5f9", text: "#374151" };
                  return (
                    <View key={r.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 12 }}>
                      <Avatar name={r.requestedByName} size={30} theme={theme} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: theme.text, fontSize: 12.5, fontWeight: "600" }}>{r.requestedByName}</Text>
                        <Text style={{ color: theme.subtext, fontSize: 11.5 }} numberOfLines={1}>
                          {firstItem?.itemName ?? "—"}{extra > 0 ? ` · +${extra} more` : ""}
                        </Text>
                        <View style={{ backgroundColor: st.bg, alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2, marginTop: 3 }}>
                          <Text style={{ color: st.text, fontSize: 10, fontWeight: "600" }}>{statusLabel(effStatus)}</Text>
                        </View>
                      </View>
                      {!isOutForDelivery && (
                        <TouchableOpacity
                          onPress={() => setApprovalRequest(r)}
                          style={{ backgroundColor: theme.primary, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 6 }}
                        >
                          <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 10.5, fontWeight: "600" }}>Details</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })
            )}
          </View>
        )}

        {/* ── Recent activity ── */}
        {activeTab === "activity" && (
          <View style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 }}>
            <SectionHeader title="Recent activity" action={() => onNavigate?.("activity")} actionLabel="View all" theme={theme} />

            {recentActivity.length === 0 ? (
              <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 12 }}>No activity yet.</Text>
            ) : (
              recentActivity.map((tx) => {
                const cfg = ACTIVITY_ACTION_STYLE[tx.type] ?? { label: tx.type, bg: "#f1f5f9", text: "#475569" };
                const glyph = ACTIVITY_ACTION_GLYPH[tx.type] ?? "•";
                return (
                  <View key={tx.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                    <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: cfg.bg, alignItems: "center", justifyContent: "center" }}>
                      <Text style={{ color: cfg.text, fontSize: 13, fontWeight: "700" }}>{glyph}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>{cfg.label}</Text>
                        {tx.quantityChange !== 0 && (
                          <Text style={{ color: tx.quantityChange > 0 ? "#16a34a" : "#dc2626", fontSize: 11, fontWeight: "600" }}>
                            {tx.quantityChange > 0 ? "+" : ""}{tx.quantityChange}
                          </Text>
                        )}
                      </View>
                      <Text style={{ color: theme.subtext, fontSize: 11 }} numberOfLines={1}>{tx.itemName}</Text>
                      <Text style={{ color: theme.subtext, fontSize: 10 }}>{formatDateTime(tx.createdAt)} · {tx.performedByName}</Text>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      <AttentionFilterSheet
        visible={attentionFilterOpen}
        filters={attentionFilters}
        onToggle={toggleAttentionFilter}
        onSelectAll={() => setAttentionFilters(new Set([0, 1, 2, 3, 4]))}
        onClearAll={() => setAttentionFilters(new Set())}
        onClose={() => setAttentionFilterOpen(false)}
        theme={theme}
      />

      <TrendItemPickerSheet
        visible={trendPickerOpen}
        options={trendItemOptions}
        search={trendItemSearch}
        onSearchChange={setTrendItemSearch}
        selectedIds={trendItemIds}
        onToggle={toggleTrendItem}
        onClose={() => setTrendPickerOpen(false)}
        theme={theme}
      />

      <ApprovalSheet
        request={approvalRequest}
        onClose={() => setApprovalRequest(null)}
        onApproveAll={(req) => {
          /* your handler */
          setApprovalRequest(null);
        }}
        onReject={(requestId) => {
          /* your reject service call here */
          setApprovalRequest(null);
        }}
        theme={theme}
      />
    </View>
  );
}
