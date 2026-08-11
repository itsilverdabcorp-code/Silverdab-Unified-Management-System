import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  TextInput,
  Modal,
} from "react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { OfficeInventoryItem } from "../../../../../types";
import {
  adjustStock,
  addDelivery,
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
        width: 30,
        height: 30,
        borderRadius: 7,
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

function ItemCard({
  item,
  viewMode,
  onAdjust,
  onDeliver,
  onEdit,
  onToggleRestriction,
  onRestore,
  onDelete,
  theme,
}: {
  item: OfficeInventoryItem;
  viewMode: "active" | "archived";
  onAdjust: (item: OfficeInventoryItem) => void;
  onDeliver: (item: OfficeInventoryItem) => void;
  onEdit: (item: OfficeInventoryItem) => void;
  onToggleRestriction: (item: OfficeInventoryItem) => void;
  onRestore: (id: string) => void;
  onDelete: (item: OfficeInventoryItem) => void;
  theme: any;
}) {
  const stockColor =
    item.stockStatus === "out_of_stock"
      ? "#ef4444"
      : item.stockStatus === "low_stock"
        ? "#f59e0b"
        : theme.text;

  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderColor: theme.border,
        borderWidth: 1,
        borderRadius: 12,
        padding: 12,
        marginBottom: 10,
      }}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700" }} numberOfLines={1}>
              {item.name}
            </Text>
            {item.isRestricted && <Text style={{ fontSize: 11 }}>🔒</Text>}
          </View>
          <Text style={{ color: theme.subtext, fontSize: 11, marginTop: 1 }}>
            {item.itemCode}
            {item.brand ? ` · ${item.brand}` : ""}
          </Text>
        </View>
        <StockBadge item={item} theme={theme} />
      </View>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6, marginBottom: 12 }}>
        <Text style={{ color: stockColor, fontSize: 20, fontWeight: "700" }}>{item.currentStock}</Text>
        <Text style={{ color: theme.subtext, fontSize: 12 }}>
          {item.unit} · {formatPeso(item.pricePerUnit)}
        </Text>
      </View>

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
            <IconActionBtn onPress={() => onAdjust(item)} disabled={item.currentStock === 0} theme={theme}>
              <Glyph theme={theme}>−</Glyph>
            </IconActionBtn>
            <IconActionBtn onPress={() => onDeliver(item)} theme={theme}>
              <Glyph theme={theme}>+</Glyph>
            </IconActionBtn>
            <IconActionBtn onPress={() => onEdit(item)} theme={theme}>
              <Glyph theme={theme}>✎</Glyph>
            </IconActionBtn>
            <IconActionBtn onPress={() => onToggleRestriction(item)} theme={theme}>
              <Glyph theme={theme}>{item.isRestricted ? "🔓" : "🔒"}</Glyph>
            </IconActionBtn>
          </>
        )}
      </View>
    </View>
  );
}

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
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (visible) {
      setQty("");
      setNotes("");
      setError(null);
    }
  }, [visible, item]);

  if (!item) return null;

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

  const isLoading = viewMode === "archived" ? archivedLoading : loading;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ padding: 16, paddingBottom: 0 }}>
        <Text style={{ color: theme.text, fontSize: 20, fontWeight: "700" }}>
          Office Inventory{viewMode === "archived" ? " · Archived" : ""}
        </Text>
        <Text style={{ color: theme.subtext, fontSize: 12, marginTop: 2 }}>
          {sortedFiltered.length} of {data.length} items
        </Text>

        <TextInput
          placeholder="Search item code, name, brand..."
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
          <View style={{ flexDirection: "row", gap: 6 }}>
            {CATEGORY_TABS.map((tab) => {
              const active = viewMode === "active" && activeTab === tab.value;
              return (
                <TouchableOpacity
                  key={tab.value}
                  onPress={() => {
                    setViewMode("active");
                    setActiveTab(tab.value);
                  }}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 999,
                    backgroundColor: active ? theme.primary : theme.surface,
                    borderWidth: 1,
                    borderColor: active ? theme.primary : theme.border,
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: "600", color: active ? (theme.primaryText ?? "#fff") : theme.subtext }}>
                    {tab.label} ({tabCounts[tab.value]})
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
      ) : sortedFiltered.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ color: theme.subtext, fontSize: 13, textAlign: "center" }}>
            {viewMode === "archived" ? "No archived items." : "No inventory items found."}
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, paddingBottom: 40 }}>
          {sortedFiltered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              viewMode={viewMode}
              onAdjust={(it) => {
                setAdjustTarget(it);
                setAdjustModalOpen(true);
              }}
              onDeliver={(it) => {
                setDeliverTarget(it);
                setDeliverModalOpen(true);
              }}
              onEdit={(it) => setEditTarget(it)}
              onToggleRestriction={handleToggleRestriction}
              onRestore={handleRestore}
              onDelete={(it) => setDeleteTarget(it)}
              theme={theme}
            />
          ))}
        </ScrollView>
      )}

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