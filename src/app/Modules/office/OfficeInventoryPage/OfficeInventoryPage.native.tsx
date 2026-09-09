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
} from "react-native";
import Svg, { Path } from "react-native-svg";
import { Lock, LockOpen, SquarePen, SlidersHorizontal } from "lucide-react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { OfficeInventoryItem } from "../../../../../types";
import {
  adjustStock,
  addDelivery,
  createInventoryItem,
  getAllInventoryItems,
  updateInventoryItem,
  archiveInventoryItem,
} from "../../../../services/Officeinventory";
import { OfficeCategory, OfficeUnit } from "../../../../../types";
import {
  useOfficeInventoryData,
  CATEGORY_TABS,
  formatPeso,
  STOCK_STATUS_STYLE,
  type InventoryFilter,
} from "./useOfficeInventoryData";

type Props = {
  initialFilter?: InventoryFilter;
  isSuperAdmin?: boolean;
  initialDeliverItem?: OfficeInventoryItem | null;
  onDeliverModalOpened?: () => void;
};

// ─── Small building blocks ──────────────────────────────────────────────

function StockBadge({ item, theme }: { item: OfficeInventoryItem; theme: any }) {
  const s = STOCK_STATUS_STYLE[item.stockStatus];
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        backgroundColor: s.bg,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
      }}
    >
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: s.dot }} />
      <Text style={{ color: s.text, fontSize: 10, fontWeight: "600" }}>{s.label}</Text>
    </View>
  );
}

function IconActionBtn({
  onPress,
  disabled,
  theme,
  children,
}: {
  onPress: () => void;
  disabled?: boolean;
  theme: any;
  children: React.ReactNode;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        width: 34,
        height: 34,
        borderRadius: 9,
        borderWidth: 1,
        borderColor: theme.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : 1,
      }}
    >
      {children}
    </TouchableOpacity>
  );
}

// Plain-text glyphs instead of pulling in an icon lib — swap for
// lucide-react-native or similar if you already depend on one elsewhere.
const Glyph = ({ children, theme }: { children: React.ReactNode; theme: any }) => (
  <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", lineHeight: 16 }}>{children}</Text>
);

const CATEGORY_COLORS: Record<string, string> = {
  office_supplies: "#8B7FD6",
  cleaning: "#F5A623",
  ppe: "#4FA8E8",
  medicine: "#D65FB8",
  pantry: "#3FBF7F",
};
const DEFAULT_CATEGORY_COLOR = "#94A3B8";

function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? DEFAULT_CATEGORY_COLOR;
}
const CATEGORY_PREFIX: Record<OfficeCategory, string> = {
  office_supplies: "OS",
  cleaning: "CS",
  ppe: "PPE",
  medicine: "MS",
  pantry: "PT",
};

function getNextCode(items: { itemCode: string }[], category: OfficeCategory): string {
  const prefix = CATEGORY_PREFIX[category];
  const nums = items
    .map((i) => i.itemCode)
    .filter((c) => c.toUpperCase().startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}${String(next).padStart(3, "0")}`;
}

function ManageStockSheet({
  visible,
  item,
  onClose,
  onAdjust,
  onDeliver,
  onEdit,
  theme,
}: {
  visible: boolean;
  item: OfficeInventoryItem | null;
  onClose: () => void;
  onAdjust: (item: OfficeInventoryItem) => void;
  onDeliver: (item: OfficeInventoryItem) => void;
  onEdit: (item: OfficeInventoryItem) => void;
  theme: any;
}) {
  if (!item) return null;

  const options: { label: string; onPress: () => void; disabled?: boolean; color?: string }[] = [
    { label: "Add delivery (+)", onPress: () => onDeliver(item) },
    { label: "Deduct stock (−)", onPress: () => onAdjust(item), disabled: item.currentStock === 0 },
    { label: "Edit item", onPress: () => onEdit(item) },
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 24 }}>
          <View style={{ alignItems: "center", paddingVertical: 10 }}>
            <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: theme.border }} />
          </View>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", paddingHorizontal: 18, marginBottom: 4 }}>
            {item.name}
          </Text>
          <Text style={{ color: theme.subtext, fontSize: 12, paddingHorizontal: 18, marginBottom: 12 }}>
            {item.currentStock} {item.unit} in stock
          </Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.label}
              onPress={() => {
                if (opt.disabled) return;
                onClose();
                opt.onPress();
              }}
              disabled={opt.disabled}
              style={{
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                opacity: opt.disabled ? 0.4 : 1,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "600" }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const ItemCard = React.memo(function ItemCard({
  item,
  viewMode,
  onManageStock,
  onToggleRestriction,
  onRestore,
  onDelete,
  theme,
}: {
  item: OfficeInventoryItem;
  viewMode: "active" | "archived";
  onManageStock: (item: OfficeInventoryItem) => void;
  onToggleRestriction: (item: OfficeInventoryItem) => void;
  onRestore: (id: string) => void;
  onDelete: (item: OfficeInventoryItem) => void;
  theme: any;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 24,
              height: 24,
              borderRadius: 7,
              backgroundColor: categoryColor(item.category),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M22 7.7c0-.6-.4-1.2-.8-1.5l-6.3-3.9a1.72 1.72 0 0 0-1.7 0l-10.3 6c-.5.2-.9.8-.9 1.4v6.6c0 .5.4 1.2.8 1.5l6.3 3.9a1.72 1.72 0 0 0 1.7 0l10.3-6c.5-.3.9-1 .9-1.5Z" />
              <Path d="M10 21.9V14L2.1 9.1" />
              <Path d="m10 14 11.9-6.9" />
              <Path d="M14 19.8v-8.1" />
              <Path d="M18 17.5V9.4" />
            </Svg>
          </View>
          <Text style={{ color: theme.primary, fontSize: 12, fontWeight: "700" }}>
            #{item.itemCode}
          </Text>
        </View>
        <StockBadge item={item} theme={theme} />
      </View>

      <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }} numberOfLines={1}>
        {item.name}
      </Text>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 13 }} numberOfLines={1}>
          <Text style={{ color: theme.primary, fontWeight: "700" }}>{item.currentStock}</Text>
          <Text style={{ color: theme.subtext }}> {item.unit}(s) · {formatPeso(item.pricePerUnit)}</Text>
        </Text>

        <View style={{ flexDirection: "row", gap: 8 }}>
          {viewMode === "archived" ? (
            <>
              <IconActionBtn onPress={() => onRestore(item.id)} theme={theme}>
                <Glyph theme={theme}>↺</Glyph>
              </IconActionBtn>
              <IconActionBtn onPress={() => onDelete(item)} theme={theme}>
                <Glyph theme={theme}>🗑</Glyph>
              </IconActionBtn>
            </>
          ) : (
            <>
              <IconActionBtn onPress={() => onManageStock(item)} theme={theme}>
                <SquarePen color={theme.text} size={16} />
              </IconActionBtn>
              <IconActionBtn onPress={() => onToggleRestriction(item)} theme={theme}>
                {item.isRestricted ? (
                  <LockOpen color={theme.text} size={16} />
                ) : (
                  <Lock color={theme.text} size={16} />
                )}
              </IconActionBtn>
            </>
          )}
        </View>
      </View>
    </View>
  );
});

// ─── Minimal native modal shells ────────────────────────────────────────
// These stand in for the web-only AddItemModal / EditItemModal /
// AdjustStockModal / AddDeliveryModal / DeleteConfirmModal /
// RestrictConfirmModal, which are built with <div>/<input> and can't run
// on native. They're intentionally bare (confirm/cancel only, no form
// fields yet) — replace with real native forms when you're ready to build
// those out; wiring them here just keeps the page functional in the
// meantime instead of leaving these actions dead on mobile.

function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  confirmColor = "#dc2626",
  submitting,
  onCancel,
  onConfirm,
  theme,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  confirmColor?: string;
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  theme: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 18, width: "100%", maxWidth: 340 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 6 }}>{title}</Text>
          <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 16, lineHeight: 18 }}>{message}</Text>
          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <TouchableOpacity onPress={onCancel} disabled={submitting} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onConfirm} disabled={submitting} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: confirmColor, opacity: submitting ? 0.6 : 1 }}>
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const todayStr = () => new Date().toISOString().split("T")[0];

const CATEGORY_CHOICES: { value: OfficeCategory; label: string }[] = [
  { value: "office_supplies", label: "Office Supplies" },
  { value: "cleaning", label: "Cleaning" },
  { value: "ppe", label: "PPE" },
  { value: "medicine", label: "Medicine" },
  { value: "pantry", label: "Pantry" },
];

const UNIT_CHOICES: OfficeUnit[] = [
  "bottle", "box", "bundle", "can", "dozen", "gallon", "liter",
  "pack", "pad", "pair", "piece", "ream", "refill", "roll", "set", "unit",
];

const STOCK_STATUS_CHOICES: { value: OfficeInventoryItem["stockStatus"]; label: string }[] = [
  { value: "in_stock", label: "In Stock" },
  { value: "low_stock", label: "Low Stock" },
  { value: "out_of_stock", label: "Out of Stock" },
];

function PillSelect<T extends string>({
  options,
  value,
  onChange,
  theme,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  theme: any;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
      <View style={{ flexDirection: "row", gap: 6 }}>
        {options.map((opt) => {
          const active = opt.value === value;
          return (
            <TouchableOpacity
              key={opt.value}
              onPress={() => onChange(opt.value)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: active ? theme.primary : theme.surface,
                borderWidth: 1,
                borderColor: active ? theme.primary : theme.border,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: active ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
}
function StockStatusFilterSheet({
  visible,
  value,
  onChange,
  onClose,
  theme,
}: {
  visible: boolean;
  value: OfficeInventoryItem["stockStatus"] | null;
  onChange: (v: OfficeInventoryItem["stockStatus"] | null) => void;
  onClose: () => void;
  theme: any;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-start", alignItems: "flex-end", paddingTop: 170, paddingRight: 16 }}
      >
        <View
          style={{
            backgroundColor: theme.surface,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: theme.border,
            paddingVertical: 8,
            width: 200,
          }}
        >
          {STOCK_STATUS_CHOICES.map((opt) => {
            const active = value === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                onPress={() => {
                  onChange(active ? null : opt.value);
                  onClose();
                }}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  backgroundColor: active ? (theme.primarySubtle ?? theme.background) : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: active ? "700" : "500",
                    color: active ? theme.primary : theme.text,
                  }}
                >
                  {opt.label}
                </Text>
                {active && <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>✓</Text>}
              </TouchableOpacity>
            );
          })}
        </View>
      </TouchableOpacity>
    </Modal>
  );
}
function AdjustStockNativeModal({
  visible,
  item,
  onCancel,
  onSuccess,
  theme,
}: {
  visible: boolean;
  item: OfficeInventoryItem | null;
  onCancel: () => void;
  onSuccess: () => void;
  theme: any;
}) {
  const [qty, setQty] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setQty("");
      setReason("");
      setError(null);
    }
  }, [visible, item]);

  if (!item) return null;

  const handleSubmit = async () => {
    setError(null);
    const n = parseInt(qty, 10);
    if (!n || n <= 0) return setError("Enter a quantity greater than 0.");
    if (n > item.currentStock)
      return setError(`Cannot deduct more than current stock (${item.currentStock} ${item.unit}).`);
    if (!reason.trim()) return setError("A reason or note is required.");

    setSubmitting(true);
    try {
      await adjustStock(item.id, n, todayStr(), reason.trim());
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Unable to adjust stock.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 18, width: "100%", maxWidth: 360 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 2 }}>Adjust stock</Text>
          <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 14 }}>
            {item.name} · {item.currentStock} {item.unit} in stock
          </Text>

          {error && (
            <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 8, marginBottom: 10 }}>
              <Text style={{ color: "#b91c1c", fontSize: 11 }}>{error}</Text>
            </View>
          )}

          <TextInput
            placeholder="Quantity to deduct"
            placeholderTextColor={theme.subtext}
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
            style={{
              borderWidth: 1,
              borderColor: theme.inputBorder,
              backgroundColor: theme.inputBg,
              color: theme.inputText,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              fontSize: 13,
              marginBottom: 10,
            }}
          />
          <TextInput
            placeholder="Reason / note (required)"
            placeholderTextColor={theme.subtext}
            value={reason}
            onChangeText={setReason}
            multiline
            style={{
              borderWidth: 1,
              borderColor: theme.inputBorder,
              backgroundColor: theme.inputBg,
              color: theme.inputText,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              fontSize: 13,
              minHeight: 60,
              textAlignVertical: "top",
              marginBottom: 16,
            }}
          />

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <TouchableOpacity onPress={onCancel} disabled={submitting} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: "#dc2626", opacity: submitting ? 0.6 : 1 }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                {submitting ? "Saving…" : "Save adjustment"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddDeliveryNativeModal({
  visible,
  item,
  items,
  onSelectItem,
  onCancel,
  onSuccess,
  theme,
}: {
  visible: boolean;
  item: OfficeInventoryItem | null;
  items: OfficeInventoryItem[];
  onSelectItem: (item: OfficeInventoryItem) => void;
  onCancel: () => void;
  onSuccess: () => void;
  theme: any;
}) {
  const [qty, setQty] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = React.useState("");

  React.useEffect(() => {
    if (visible) {
      setQty("");
      setNotes("");
      setError(null);
      setPickerSearch("");
    }
  }, [visible, item]);

  if (!visible) return null;

  if (!item) {
    const filtered = items.filter((it) =>
      `${it.name} ${it.itemCode} ${it.brand ?? ""}`.toLowerCase().includes(pickerSearch.toLowerCase())
    );
    return (
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
          <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "80%" }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>Select an item</Text>
              <TouchableOpacity onPress={onCancel}>
                <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={{ padding: 14 }}>
              <TextInput
                placeholder="Search item code, name, brand..."
                placeholderTextColor={theme.subtext}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                style={{
                  borderWidth: 1,
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.inputBg,
                  color: theme.inputText,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 9,
                  fontSize: 13,
                }}
              />
            </View>
            <FlatList
              data={filtered}
              keyExtractor={(it) => it.id}
              style={{ maxHeight: 360 }}
              contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14 }}
              renderItem={({ item: it }) => (
                <TouchableOpacity
                  onPress={() => onSelectItem(it)}
                  style={{ paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.border }}
                >
                  <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600" }}>{it.name}</Text>
                  <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
                    #{it.itemCode} · {it.currentStock} {it.unit} in stock
                  </Text>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={{ color: theme.subtext, fontSize: 12, textAlign: "center", paddingVertical: 20 }}>
                  No items match your search.
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    );
  }

  const total = Number(qty) > 0 ? (item.pricePerUnit * Number(qty)).toFixed(2) : "0.00";

  const handleSubmit = async () => {
    setError(null);
    const n = parseInt(qty, 10);
    if (!n || n <= 0) return setError("Enter a quantity greater than 0.");

    setSubmitting(true);
    try {
      await addDelivery(item.id, n, todayStr(), item.pricePerUnit, notes.trim());
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Unable to record delivery.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <View style={{ backgroundColor: theme.surface, borderRadius: 12, padding: 18, width: "100%", maxWidth: 360 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginBottom: 2 }}>Record delivery</Text>
          <Text style={{ color: theme.subtext, fontSize: 12, marginBottom: 14 }}>{item.name}</Text>

          {error && (
            <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 8, marginBottom: 10 }}>
              <Text style={{ color: "#b91c1c", fontSize: 11 }}>{error}</Text>
            </View>
          )}

          <TextInput
            placeholder="Quantity delivered"
            placeholderTextColor={theme.subtext}
            keyboardType="numeric"
            value={qty}
            onChangeText={setQty}
            style={{
              borderWidth: 1,
              borderColor: theme.inputBorder,
              backgroundColor: theme.inputBg,
              color: theme.inputText,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              fontSize: 13,
              marginBottom: 10,
            }}
          />

          {Number(qty) > 0 && (
            <View
              style={{
                backgroundColor: theme.inputBg,
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 9,
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text style={{ color: theme.subtext, fontSize: 12 }}>
                ₱{item.pricePerUnit.toFixed(2)} × {qty}
              </Text>
              <Text style={{ color: theme.text, fontSize: 13, fontWeight: "700" }}>Total: ₱{total}</Text>
            </View>
          )}

          <TextInput
            placeholder="Notes (supplier, reference, etc.)"
            placeholderTextColor={theme.subtext}
            value={notes}
            onChangeText={setNotes}
            multiline
            style={{
              borderWidth: 1,
              borderColor: theme.inputBorder,
              backgroundColor: theme.inputBg,
              color: theme.inputText,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              fontSize: 13,
              minHeight: 60,
              textAlignVertical: "top",
              marginBottom: 16,
            }}
          />

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
            <TouchableOpacity onPress={onCancel} disabled={submitting} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: "#16a34a", opacity: submitting ? 0.6 : 1 }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>
                {submitting ? "Saving…" : "Save delivery"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EditItemNativeModal({
  visible,
  item,
  onClose,
  onSuccess,
  theme,
}: {
  visible: boolean;
  item: OfficeInventoryItem | null;
  onClose: () => void;
  onSuccess: () => void;
  theme: any;
}) {
  const [form, setForm] = React.useState({
    name: "",
    brand: "",
    category: "office_supplies" as OfficeCategory,
    unit: "piece" as OfficeUnit,
    pricePerUnit: "",
    lowStockThreshold: "",
    inStockThreshold: "",
  });
  const [submitting, setSubmitting] = React.useState(false);
  const [confirmArchive, setConfirmArchive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (item) {
      setForm({
        name: item.name,
        brand: item.brand ?? "",
        category: item.category,
        unit: item.unit,
        pricePerUnit: String(item.pricePerUnit),
        lowStockThreshold: String(item.lowStockThreshold),
        inStockThreshold: String(item.inStockThreshold),
      });
      setConfirmArchive(false);
      setError(null);
    }
  }, [item, visible]);

  if (!item) return null;

  const fieldStyle = {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    color: theme.inputText,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Item name is required.");

    setSubmitting(true);
    try {
      await updateInventoryItem(item.id, {
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        category: form.category,
        unit: form.unit,
        pricePerUnit: Number(form.pricePerUnit) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
        inStockThreshold: Number(form.inStockThreshold) || 10,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Unable to update item.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    setSubmitting(true);
    try {
      await archiveInventoryItem(item.id);
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Unable to archive item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View
          style={{
            backgroundColor: theme.surface,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            maxHeight: "88%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View>
              <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>Edit item</Text>
              <Text style={{ color: theme.subtext, fontSize: 11 }}>{item.itemCode}</Text>
            </View>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            {error && (
              <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10 }}>
                <Text style={{ color: "#b91c1c", fontSize: 11 }}>{error}</Text>
              </View>
            )}

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Item name</Text>
              <TextInput
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                style={fieldStyle}
              />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Brand / Description</Text>
              <TextInput
                value={form.brand}
                onChangeText={(v) => setForm((f) => ({ ...f, brand: v }))}
                style={fieldStyle}
              />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Category</Text>
              <PillSelect
                options={CATEGORY_CHOICES}
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                theme={theme}
              />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Unit</Text>
              <PillSelect
                options={UNIT_CHOICES.map((u) => ({ value: u, label: u }))}
                value={form.unit}
                onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                theme={theme}
              />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Price per unit (₱)</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={form.pricePerUnit}
                onChangeText={(v) => setForm((f) => ({ ...f, pricePerUnit: v }))}
                style={fieldStyle}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Low stock threshold</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.lowStockThreshold}
                  onChangeText={(v) => setForm((f) => ({ ...f, lowStockThreshold: v }))}
                  style={fieldStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>In stock threshold</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.inStockThreshold}
                  onChangeText={(v) => setForm((f) => ({ ...f, inStockThreshold: v }))}
                  style={fieldStyle}
                />
              </View>
            </View>
            <Text style={{ color: theme.subtext, fontSize: 10, marginTop: -8 }}>
              Stock at or below the in-stock threshold shows as Low Stock; 0 always shows as Out of Stock.
            </Text>

            {confirmArchive ? (
              <View
                style={{
                  backgroundColor: "#fef2f2",
                  borderRadius: 8,
                  padding: 10,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <Text style={{ color: "#b91c1c", fontSize: 11, flex: 1 }}>
                  Archive this item? It will be hidden from the catalog.
                </Text>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity onPress={() => setConfirmArchive(false)}>
                    <Text style={{ color: "#b91c1c", fontSize: 11, fontWeight: "600", textDecorationLine: "underline" }}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={handleArchive} disabled={submitting}>
                    <Text style={{ color: "#b91c1c", fontSize: 11, fontWeight: "700" }}>Confirm</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setConfirmArchive(true)}>
                <Text style={{ color: "#dc2626", fontSize: 13, fontWeight: "600" }}>Archive item</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              gap: 8,
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderTopWidth: 1,
              borderTopColor: theme.border,
            }}
          >
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: theme.primary, opacity: submitting ? 0.6 : 1 }}
            >
              <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 12, fontWeight: "600" }}>
                {submitting ? "Saving…" : "Save changes"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddItemNativeModal({
  visible,
  onClose,
  onSuccess,
  theme,
}: {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  theme: any;
}) {
  const [form, setForm] = React.useState({
    name: "",
    brand: "",
    category: "office_supplies" as OfficeCategory,
    unit: "piece" as OfficeUnit,
    pricePerUnit: "",
    beginningInventory: "",
    lowStockThreshold: "",
    inStockThreshold: "",
    isRestricted: false,
  });
  const [nextCodes, setNextCodes] = React.useState<Record<OfficeCategory, string>>({
    office_supplies: "OS001",
    cleaning: "CS001",
    ppe: "PPE001",
    medicine: "MS001",
    pantry: "PT001",
  });
  const [codesLoading, setCodesLoading] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!visible) return;
    setForm({
      name: "",
      brand: "",
      category: "office_supplies",
      unit: "piece",
      pricePerUnit: "",
      beginningInventory: "",
      lowStockThreshold: "",
      inStockThreshold: "",
      isRestricted: false,
    });
    setError(null);
    setCodesLoading(true);
    getAllInventoryItems(true) // include archived so codes stay globally unique
      .then((items) => {
        const categories: OfficeCategory[] = ["office_supplies", "cleaning", "ppe", "medicine", "pantry"];
        const codes = {} as Record<OfficeCategory, string>;
        categories.forEach((cat) => {
          codes[cat] = getNextCode(items, cat);
        });
        setNextCodes(codes);
      })
      .finally(() => setCodesLoading(false));
  }, [visible]);

  const fieldStyle = {
    borderWidth: 1,
    borderColor: theme.inputBorder,
    backgroundColor: theme.inputBg,
    color: theme.inputText,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
  };

  const currentCode = nextCodes[form.category];

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) return setError("Item name is required.");
    if (codesLoading) return setError("Still assigning an item code — try again in a moment.");

    setSubmitting(true);
    try {
      await createInventoryItem({
        itemCode: currentCode,
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        category: form.category,
        unit: form.unit,
        pricePerUnit: Number(form.pricePerUnit) || 0,
        beginningInventory: Number(form.beginningInventory) || 0,
        lowStockThreshold: Number(form.lowStockThreshold) || 5,
        inStockThreshold: Number(form.inStockThreshold) || 10,
        isRestricted: form.isRestricted,
      });
      onSuccess();
    } catch (err: any) {
      setError(err?.message ?? "Unable to add item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: theme.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "88%" }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingHorizontal: 18,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }}>Add item</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: theme.subtext, fontSize: 18 }}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ padding: 18, gap: 14 }}>
            {error && (
              <View style={{ backgroundColor: "#fef2f2", borderRadius: 8, padding: 10 }}>
                <Text style={{ color: "#b91c1c", fontSize: 11 }}>{error}</Text>
              </View>
            )}

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Item code</Text>
              <View style={{ ...fieldStyle, opacity: codesLoading ? 0.5 : 1 }}>
                <Text style={{ color: theme.text, fontFamily: "monospace", fontSize: 13 }}>
                  {codesLoading ? "Loading…" : currentCode}
                </Text>
              </View>
              <Text style={{ color: theme.subtext, fontSize: 10, marginTop: 4 }}>
                Auto-assigned · not editable
              </Text>
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Item name</Text>
              <TextInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} style={fieldStyle} />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Brand / Description</Text>
              <TextInput value={form.brand} onChangeText={(v) => setForm((f) => ({ ...f, brand: v }))} style={fieldStyle} />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Category</Text>
              <PillSelect
                options={CATEGORY_CHOICES}
                value={form.category}
                onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                theme={theme}
              />
            </View>

            <View>
              <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Unit</Text>
              <PillSelect
                options={UNIT_CHOICES.map((u) => ({ value: u, label: u }))}
                value={form.unit}
                onChange={(v) => setForm((f) => ({ ...f, unit: v }))}
                theme={theme}
              />
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Price per unit (₱)</Text>
                <TextInput
                  keyboardType="decimal-pad"
                  value={form.pricePerUnit}
                  onChangeText={(v) => setForm((f) => ({ ...f, pricePerUnit: v }))}
                  style={fieldStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Beginning inventory</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.beginningInventory}
                  onChangeText={(v) => setForm((f) => ({ ...f, beginningInventory: v }))}
                  placeholder="0"
                  style={fieldStyle}
                />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>Low stock threshold</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.lowStockThreshold}
                  onChangeText={(v) => setForm((f) => ({ ...f, lowStockThreshold: v }))}
                  style={fieldStyle}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.subtext, fontSize: 11, fontWeight: "600", marginBottom: 5 }}>In stock threshold</Text>
                <TextInput
                  keyboardType="numeric"
                  value={form.inStockThreshold}
                  onChangeText={(v) => setForm((f) => ({ ...f, inStockThreshold: v }))}
                  style={fieldStyle}
                />
              </View>
            </View>
            <Text style={{ color: theme.subtext, fontSize: 10, marginTop: -8 }}>
              Stock at or below the in-stock threshold shows as Low Stock; 0 always shows as Out of Stock.
            </Text>

            <TouchableOpacity
              onPress={() => setForm((f) => ({ ...f, isRestricted: !f.isRestricted }))}
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <View
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: theme.border,
                  backgroundColor: form.isRestricted ? theme.primary : "transparent",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {form.isRestricted && <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 12 }}>✓</Text>}
              </View>
              <Text style={{ color: theme.text, fontSize: 12 }}>Restrict to admin/superadmin only</Text>
            </TouchableOpacity>
          </ScrollView>

          <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8, paddingHorizontal: 18, paddingVertical: 14, borderTopWidth: 1, borderTopColor: theme.border }}>
            <TouchableOpacity onPress={onClose} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border }}>
              <Text style={{ color: theme.text, fontSize: 12, fontWeight: "600" }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleSubmit} disabled={submitting || codesLoading} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, backgroundColor: theme.primary, opacity: submitting || codesLoading ? 0.6 : 1 }}>
              <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 12, fontWeight: "600" }}>
                {submitting ? "Saving…" : "Add item"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function OfficeInventoryPage({
  initialFilter = null,
  isSuperAdmin = false,
  initialDeliverItem = null,
  onDeliverModalOpened,
}: Props) {
  const { theme } = useTheme();
  const {
    data, viewMode, setViewMode,
    loading, archivedLoading,
    search, setSearch,
    activeFilter, setActiveFilter,
    activeTab, setActiveTab,
    addVisible, setAddVisible,
    adjustTarget, setAdjustTarget,
    deliverTarget, setDeliverTarget,
    adjustModalOpen, setAdjustModalOpen,
    deliverModalOpen, setDeliverModalOpen,
    deleteTarget, setDeleteTarget,
    deleting,
    restrictTarget, setRestrictTarget,
    restricting,
    fetchData,
    handleRestore, handleConfirmDelete,
    handleToggleRestriction, handleConfirmRestrict,
    tabCounts, sortedFiltered,
  } = useOfficeInventoryData({ initialFilter, initialDeliverItem, onDeliverModalOpened });

  const [editTarget, setEditTarget] = React.useState<OfficeInventoryItem | null>(null);
  const [stockStatusFilter, setStockStatusFilter] = React.useState<OfficeInventoryItem["stockStatus"] | null>(null);
  const [statusFilterSheetOpen, setStatusFilterSheetOpen] = React.useState(false);

  const isLoading = viewMode === "archived" ? archivedLoading : loading;

  const displayedItems = React.useMemo(
    () => (stockStatusFilter ? sortedFiltered.filter((it) => it.stockStatus === stockStatusFilter) : sortedFiltered),
    [sortedFiltered, stockStatusFilter]
  );

  const [manageStockTarget, setManageStockTarget] = React.useState<OfficeInventoryItem | null>(null);

  const handleManageStock = React.useCallback((it: OfficeInventoryItem) => setManageStockTarget(it), []);

  const handleAdjust = React.useCallback((it: OfficeInventoryItem) => {
    setAdjustTarget(it);
    setAdjustModalOpen(true);
  }, [setAdjustTarget, setAdjustModalOpen]);

  const handleDeliver = React.useCallback((it: OfficeInventoryItem) => {
    setDeliverTarget(it);
    setDeliverModalOpen(true);
  }, [setDeliverTarget, setDeliverModalOpen]);

  const handleEdit = React.useCallback((it: OfficeInventoryItem) => setEditTarget(it), [setEditTarget]);
  const handleDeleteTarget = React.useCallback((it: OfficeInventoryItem) => setDeleteTarget(it), [setDeleteTarget]);

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
              Office Inventory{viewMode === "archived" ? " · Archived" : ""}
            </Text>
            <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>
              {displayedItems.length} of {data.length} items
            </Text>
          </View>

          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => {
                setDeliverTarget(null);
                setDeliverModalOpen(true);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                borderWidth: 1.5,
                borderColor: theme.primary,
              }}
            >
              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>+</Text>
              <Text style={{ color: theme.primary, fontSize: 13, fontWeight: "700" }}>Add Delivery</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setAddVisible(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 999,
                backgroundColor: theme.primary,
              }}
            >
              <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>+</Text>
              <Text style={{ color: theme.primaryText ?? "#fff", fontSize: 13, fontWeight: "700" }}>Add Item</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12, marginBottom: 10 }}>
          <TextInput
            placeholder="Search item code, name, brand..."
            placeholderTextColor={theme.subtext}
            value={search}
            onChangeText={setSearch}
            style={{
              flex: 1,
              backgroundColor: theme.inputBg,
              borderColor: theme.inputBorder,
              borderWidth: 1,
              color: theme.inputText,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: 9,
              fontSize: 13,
            }}
          />

          <TouchableOpacity
            onPress={() => setStatusFilterSheetOpen(true)}
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.inputBorder,
              backgroundColor: theme.inputBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <SlidersHorizontal color={theme.primary} size={18} />
            {stockStatusFilter && (
              <View
                style={{
                  position: "absolute",
                  top: -3,
                  right: -3,
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: theme.primary,
                }}
              />
            )}
          </TouchableOpacity>
        </View>

        {activeFilter && (
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: theme.primarySubtle ?? theme.surface,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
              }}
            >
              <Text style={{ color: theme.primarySubtleText ?? theme.text, fontSize: 11, fontWeight: "600" }}>
                {String(activeFilter.field)}: {activeFilter.value}
              </Text>
              <TouchableOpacity onPress={() => setActiveFilter(null)}>
                <Text style={{ color: theme.primarySubtleText ?? theme.text, fontSize: 11, fontWeight: "700" }}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <TouchableOpacity
              onPress={() => {
                setViewMode("active");
                setActiveTab("all" as any);
              }}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: viewMode === "active" && activeTab === ("all" as any) ? theme.primary : (theme.primarySubtle ?? theme.surface),
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: viewMode === "active" && activeTab === ("all" as any) ? (theme.primaryText ?? "#fff") : theme.text }}>
                All
              </Text>
            </TouchableOpacity>

            {CATEGORY_TABS.filter((tab) => tab.value !== ("all" as any)).map((tab) => {
              const color = categoryColor(tab.value as string);
              const isActive = viewMode === "active" && activeTab === tab.value;
              return (
                <TouchableOpacity
                  key={tab.value}
                  onPress={() => {
                    setViewMode("active");
                    setActiveTab(tab.value);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: isActive ? (theme.primarySubtle ?? theme.surface) : "transparent",
                    borderWidth: 1,
                    borderColor: isActive ? color : "transparent",
                  }}
                >
                  <View
                    style={{
                      minWidth: 26,
                      height: 26,
                      paddingHorizontal: 6,
                      borderRadius: 13,
                      backgroundColor: color,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>{tabCounts[tab.value]}</Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: isActive ? "700" : "600",
                      color: isActive ? color : theme.text,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              onPress={() => setViewMode("archived")}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 999,
                backgroundColor: viewMode === "archived" ? theme.primary : theme.surface,
                borderWidth: 1,
                borderColor: viewMode === "archived" ? theme.primary : theme.border,
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: viewMode === "archived" ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                Archive
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      {isLoading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color={theme.primary ?? "#4169E1"} />
        </View>
      ) : (
        <FlatList
          data={displayedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <ItemCard
              item={item}
              viewMode={viewMode}
              onManageStock={handleManageStock}
              onToggleRestriction={handleToggleRestriction}
              onRestore={handleRestore}
              onDelete={handleDeleteTarget}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            <View style={{ alignItems: "center", justifyContent: "center", padding: 24 }}>
              <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center" }}>
                {viewMode === "archived" ? "No archived items." : "No inventory items found."}
              </Text>
            </View>
          }
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews
        />
      )}

      <StockStatusFilterSheet
        visible={statusFilterSheetOpen}
        value={stockStatusFilter}
        onChange={setStockStatusFilter}
        onClose={() => setStatusFilterSheetOpen(false)}
        theme={theme}
      />

      <ManageStockSheet
        visible={manageStockTarget !== null}
        item={manageStockTarget}
        onClose={() => setManageStockTarget(null)}
        onAdjust={handleAdjust}
        onDeliver={handleDeliver}
        onEdit={handleEdit}
        theme={theme}
      />

      {/* ── Stock actions (adjust / deliver) ── */}
      <AdjustStockNativeModal
        visible={adjustModalOpen}
        item={adjustTarget}
        onCancel={() => {
          setAdjustModalOpen(false);
          setAdjustTarget(null);
        }}
        onSuccess={() => {
          setAdjustModalOpen(false);
          setAdjustTarget(null);
          fetchData();
        }}
        theme={theme}
      />

      <AddDeliveryNativeModal
        visible={deliverModalOpen}
        item={deliverTarget}
        items={data}
        onSelectItem={setDeliverTarget}
        onCancel={() => {
          setDeliverModalOpen(false);
          setDeliverTarget(null);
        }}
        onSuccess={() => {
          setDeliverModalOpen(false);
          setDeliverTarget(null);
          fetchData();
        }}
        theme={theme}
      />

      <AddItemNativeModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSuccess={() => {
          setAddVisible(false);
          fetchData();
        }}
        theme={theme}
      />

      {/* ── Confirm modals ── */}
      <ConfirmModal
        visible={deleteTarget !== null}
        title={`Permanently delete "${deleteTarget?.name ?? ""}"?`}
        message="This cannot be undone. Its transaction history stays in the Activity log, but the item can no longer be restored."
        confirmLabel={deleting ? "Deleting…" : "Delete permanently"}
        confirmColor="#dc2626"
        submitting={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        theme={theme}
      />

      <ConfirmModal
        visible={restrictTarget !== null}
        title={`Restrict "${restrictTarget?.name ?? ""}"?`}
        message="This item will be hidden from employees — only admins and superadmins will be able to see or request it."
        confirmLabel={restricting ? "Restricting…" : "Restrict item"}
        confirmColor="#D97706"
        submitting={restricting}
        onCancel={() => setRestrictTarget(null)}
        onConfirm={handleConfirmRestrict}
        theme={theme}
      />

      <EditItemNativeModal
        visible={editTarget !== null}
        item={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={() => {
          setEditTarget(null);
          fetchData();
        }}
        theme={theme}
      />
    </View>
  );
}