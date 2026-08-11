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
  Share,
} from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { StockTransaction } from "../../../../../types";
import {
  useActivityData,
  getActionConfig,
  ACTION_FILTER_OPTIONS,
  formatDateTime,
  formatDateTimeFull,
  formatQty,
  deriveRef,
  formatPeso,
  getInitials,
  avatarColor,
  buildActivityCsv,
} from "./useActivityData";

// ─── Small building blocks ──────────────────────────────────────────────

function ActionBadge({ type, theme }: { type: string; theme: any }) {
  const action = getActionConfig(type);
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: action.bg,
        borderWidth: 1,
        borderColor: action.border,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}
    >
      <Text style={{ color: action.text, fontSize: 10, fontWeight: "600" }}>
        {action.label}
      </Text>
    </View>
  );
}

function Avatar({ name, size = 22, theme }: { name: string; size?: number; theme: any }) {
  const colors = avatarColor(name);
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.bg,
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Text style={{ color: colors.text, fontSize: size * 0.4, fontWeight: "700" }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

// Horizontal pill filter — mirrors the PillSelect pattern used for
// category/unit pickers on the inventory page.
function ActionFilterPills({
  value,
  onChange,
  theme,
}: {
  value: string;
  onChange: (v: string) => void;
  theme: any;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {ACTION_FILTER_OPTIONS.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
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
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}

function ActivityCard({
  tx,
  unitMap,
  onSelect,
  theme,
}: {
  tx: StockTransaction;
  unitMap: Record<string, string>;
  onSelect: () => void;
  theme: any;
}) {
  return (
    <TouchableOpacity
      onPress={onSelect}
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <ActionBadge type={tx.type} theme={theme} />
        <Text style={{ color: theme.subtext, fontSize: 11 }}>
          {formatDateTime(tx.createdAt)}
        </Text>
      </View>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <Text
          style={{ color: theme.text, fontSize: 14, fontWeight: "600", flex: 1, marginRight: 8 }}
          numberOfLines={1}
        >
          {tx.itemName}
        </Text>
        <Text
          style={{
            color: tx.quantityChange < 0 ? "#dc2626" : "#15803d",
            fontSize: 14,
            fontWeight: "700",
          }}
        >
          {formatQty(tx, unitMap)}
        </Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Avatar name={tx.performedByName} size={18} theme={theme} />
        <Text style={{ color: theme.subtext, fontSize: 11 }} numberOfLines={1}>
          {tx.performedByName}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Detail sheet ─────────────────────────────────────────────────────────
// Bottom-sheet Modal, mirroring EditItemNativeModal's slide-up pattern —
// stands in for the web page's ReactDOM-portal side drawer, which can't
// run on native.

function DetailSection({
  label,
  children,
  theme,
}: {
  label: string;
  children: React.ReactNode;
  theme: any;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.background,
        borderWidth: 1.5,
        borderColor: theme.border,
        borderRadius: 12,
        padding: 16,
      }}
    >
      <Text
        style={{
          color: theme.subtext,
          fontSize: 10,
          fontWeight: "700",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          marginBottom: 10,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function ActivityDetailSheet({
  tx,
  unitMap,
  onClose,
  theme,
}: {
  tx: StockTransaction | null;
  unitMap: Record<string, string>;
  onClose: () => void;
  theme: any;
}) {
  if (!tx) return null;

  const action = getActionConfig(tx.type);
  const ref = deriveRef(tx);
  const unit = unitMap[tx.itemId] ?? "";
  const isPositive = tx.quantityChange > 0;
  const qtyDisplay = `${isPositive ? "+" : ""}${tx.quantityChange}${unit ? " " + unit : ""}`;

  return (
    <Modal visible={tx !== null} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "88%",
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  color: theme.subtext,
                  fontSize: 11,
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Transaction detail
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>{ref}</Text>
                <ActionBadge type={tx.type} theme={theme} />
              </View>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            {/* Item */}
            <DetailSection label="Item" theme={theme}>
              <Text style={{ color: theme.text, fontSize: 15, fontWeight: "600", marginBottom: 3 }}>
                {tx.itemName}
              </Text>
              <Text style={{ color: theme.subtext, fontSize: 12, fontFamily: "monospace" }}>
                {tx.itemCode}
              </Text>
            </DetailSection>

            {/* Stock movement */}
            <DetailSection label="Stock movement" theme={theme}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ color: theme.subtext, fontSize: 10, textTransform: "uppercase", marginBottom: 2 }}>
                    Before
                  </Text>
                  <Text style={{ color: theme.text, fontSize: 24, fontWeight: "700" }}>{tx.stockBefore}</Text>
                  {unit ? <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>{unit}</Text> : null}
                </View>

                <View style={{ alignItems: "center" }}>
                  <View
                    style={{
                      backgroundColor: isPositive ? "#dcfce7" : "#fee2e2",
                      borderWidth: 1.5,
                      borderColor: isPositive ? "#bbf7d0" : "#fecaca",
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      marginBottom: 4,
                    }}
                  >
                    <Text style={{ color: isPositive ? "#15803d" : "#dc2626", fontSize: 14, fontWeight: "700" }}>
                      {qtyDisplay}
                    </Text>
                  </View>
                  <Text style={{ color: theme.subtext, fontSize: 16 }}>→</Text>
                </View>

                <View style={{ alignItems: "center", flex: 1 }}>
                  <Text style={{ color: theme.subtext, fontSize: 10, textTransform: "uppercase", marginBottom: 2 }}>
                    After
                  </Text>
                  <Text
                    style={{
                      fontSize: 24,
                      fontWeight: "700",
                      color:
                        tx.stockAfter === 0 ? "#dc2626" : tx.stockAfter <= 5 ? "#d97706" : theme.text,
                    }}
                  >
                    {tx.stockAfter}
                  </Text>
                  {unit ? <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>{unit}</Text> : null}
                </View>
              </View>
            </DetailSection>

            {/* Value */}
            <DetailSection label="Value" theme={theme}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingBottom: 8,
                  marginBottom: 8,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <Text style={{ color: theme.subtext, fontSize: 13 }}>Price / unit</Text>
                <Text style={{ color: theme.text, fontSize: 13, fontWeight: "500" }}>
                  {formatPeso(tx.pricePerUnit)}
                </Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: theme.subtext, fontSize: 13 }}>Total amount</Text>
                <Text style={{ color: theme.text, fontSize: 15, fontWeight: "700" }}>
                  {formatPeso(tx.totalAmount)}
                </Text>
              </View>
            </DetailSection>

            {/* Meta */}
            <DetailSection label="Performed by" theme={theme}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <Avatar name={tx.performedByName} size={34} theme={theme} />
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>
                  {tx.performedByName}
                </Text>
              </View>

              <View style={{ height: 1, backgroundColor: theme.border, marginBottom: 14 }} />

              <Text
                style={{
                  color: theme.subtext,
                  fontSize: 10,
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  marginBottom: 4,
                }}
              >
                Date & time
              </Text>
              <Text style={{ color: theme.text, fontSize: 13, lineHeight: 18 }}>
                {formatDateTimeFull(tx.createdAt)}
              </Text>
              {tx.transactionDate && tx.transactionDate !== tx.createdAt?.split("T")[0] && (
                <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 3 }}>
                  Transaction date: {tx.transactionDate}
                </Text>
              )}

              {tx.reason ? (
                <>
                  <View style={{ height: 1, backgroundColor: theme.border, marginVertical: 14 }} />
                  <Text
                    style={{
                      color: theme.subtext,
                      fontSize: 10,
                      fontWeight: "700",
                      textTransform: "uppercase",
                      letterSpacing: 0.5,
                      marginBottom: 6,
                    }}
                  >
                    Reason / Note
                  </Text>
                  <Text style={{ color: theme.text, fontSize: 13, lineHeight: 19 }}>{tx.reason}</Text>
                </>
              ) : null}
            </DetailSection>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const { theme } = useTheme();
  const {
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
  } = useActivityData();

  const handleExport = async () => {
    if (filtered.length === 0) return;
    const csv = buildActivityCsv(filtered, unitMap);
    try {
      // No Blob/filesystem write here — Share surfaces the CSV text through
      // the native share sheet (Mail, Drive, Files, etc). Swap for
      // react-native-fs / expo-sharing if you'd rather save an actual file.
      await Share.share({ message: csv, title: "Activity log" });
    } catch (err) {
      console.error("Unable to share activity log:", err);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>Activity</Text>
            <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>
              {filtered.length} of {transactions.length} transactions
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleExport}
            disabled={filtered.length === 0}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: theme.border,
              opacity: filtered.length === 0 ? 0.4 : 1,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Export</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          placeholder="Search item, performer, reason…"
          placeholderTextColor={theme.subtext}
          value={search}
          onChangeText={setSearch}
          style={{
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            borderWidth: 1,
            color: theme.inputText,
            borderRadius: 8,
            paddingHorizontal: 12,
            paddingVertical: 9,
            fontSize: 13,
            marginTop: 12,
            marginBottom: 10,
          }}
        />

        <View style={{ marginBottom: 10 }}>
          <ActionFilterPills value={actionFilter} onChange={setActionFilter} theme={theme} />
        </View>

        {error ? (
          <View
            style={{
              backgroundColor: "#fef2f2",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 8,
              marginBottom: 10,
            }}
          >
            <Text style={{ color: "#b91c1c", fontSize: 12 }}>⚠ {error}</Text>
          </View>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center" }}>
            No activity found.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(tx) => tx.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <ActivityCard
              tx={item}
              unitMap={unitMap}
              onSelect={() => setSelectedTx(item)}
              theme={theme}
            />
          )}
        />
      )}

      <ActivityDetailSheet
        tx={selectedTx}
        unitMap={unitMap}
        onClose={() => setSelectedTx(null)}
        theme={theme}
      />
    </View>
  );
}
