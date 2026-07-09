import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import {
  X,
  Search,
  Plus,
  Trash2,
  Package,
  ChevronRight,
  CheckCircle,
} from "lucide-react-native";
import { useTheme } from "../../../../theme/ThemeContext";
import { ADUser, OfficeInventoryItem } from "../../../../../types";
import { getAllInventoryItems } from "../../../../services/Officeinventory";
import { submitSupplyRequest  } from "../../../../services/supplyRequest";

// ─── Types ────────────────────────────────────────────────────────────────────

type StockStatus = "available" | "low" | "out_of_stock";

type CartItem = {
  uid: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  category: string;
  quantityRequested: number;
  stockStatusAtRequest: StockStatus;
  pricePerUnit: number;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  user: ADUser;
  onSuccess?: (ticketNumber: string) => void;
};

type ModalStep = "cart" | "picker" | "confirm" | "done";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2, 9);

function resolveStockStatus(item: OfficeInventoryItem): StockStatus {
  if (item.stockStatus === "out_of_stock") return "out_of_stock";
  if (item.stockStatus === "low_stock") return "low";
  return "available";
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const MODAL_W = Math.min(SCREEN_W * 0.92, 520);

// ─── Stock Badge ──────────────────────────────────────────────────────────────

function StockBadge({ status }: { status: StockStatus }) {
  const config: Record<
    StockStatus,
    { bg: string; border: string; text: string; label: string }
  > = {
    available: {
      bg: "#DCFCE7",
      border: "#BBF7D0",
      text: "#15803D",
      label: "In Stock",
    },
    low: {
      bg: "#FEF9C3",
      border: "#FDE047",
      text: "#A16207",
      label: "Low Stock",
    },
    out_of_stock: {
      bg: "#FEE2E2",
      border: "#FECACA",
      text: "#DC2626",
      label: "Out of Stock",
    },
  };
  const c = config[status];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 100,
        paddingHorizontal: 7,
        paddingVertical: 2,
      }}
    >
      <Text
        style={{ fontFamily: "Outfit-SemiBold", fontSize: 10, color: c.text }}
      >
        {c.label}
      </Text>
    </View>
  );
}

// ─── Item Picker Sheet ────────────────────────────────────────────────────────

type PickerProps = {
  items: OfficeInventoryItem[];
  alreadyAdded: string[];
  onSelect: (item: OfficeInventoryItem) => void;
  onClose: () => void;
  theme: any;
  primary: string;
};

function ItemPickerSheet({
  items,
  alreadyAdded,
  onSelect,
  onClose,
  theme,
  primary,
}: PickerProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");

  useEffect(() => {
    setSearch("");
    setActiveCategory("All");
  }, []);

  const categories = [
    "All",
    ...Array.from(new Set(items.map((i) => i.category))).sort(),
  ];

  const filtered = items.filter((i) => {
    const matchSearch =
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.itemCode.toLowerCase().includes(search.toLowerCase());
    const matchCat = activeCategory === "All" || i.category === activeCategory;
    return matchSearch && matchCat && !alreadyAdded.includes(i.id);
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 20,
          paddingTop: 18,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: theme.border,
          flexShrink: 0, // ← don't compress
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: "Outfit-SemiBold",
              fontSize: 15,
              color: theme.textActive,
            }}
          >
            Add Item
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 11,
              color: theme.subtext,
              marginTop: 1,
            }}
          >
            {filtered.length} available
          </Text>
        </View>
        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.7}
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            backgroundColor: theme.background,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <X size={15} color={theme.subtext} />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 0,
          flexShrink: 0,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: theme.background,
            borderWidth: 1.5,
            borderColor: theme.border,
            borderRadius: 10,
            paddingHorizontal: 11,
            paddingVertical: 8,
          }}
        >
          <Search size={14} color={theme.subtext} />
          <TextInput
            placeholder="Search by name or code…"
            placeholderTextColor={theme.subtext}
            value={search}
            onChangeText={setSearch}
            autoFocus
            style={{
              flex: 1,
              fontFamily: "Outfit",
              fontSize: 13,
              color: theme.textActive,
              padding: 0,
            }}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <X size={13} color={theme.subtext} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Category pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexShrink: 0, flexGrow: 0 }} // ← key fix: don't let this grow
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 10,
          gap: 7,
          alignItems: "center",
        }}
      >
        {categories.map((cat) => (
          <TouchableOpacity
            key={cat}
            onPress={() => setActiveCategory(cat)}
            activeOpacity={0.7}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 100,
              backgroundColor:
                activeCategory === cat ? primary : theme.background,
              borderWidth: 1.5,
              borderColor: activeCategory === cat ? primary : theme.border,
              alignSelf: "center",
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-SemiBold",
                fontSize: 11,
                color: activeCategory === cat ? "#fff" : theme.subtext,
              }}
            >
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Item list — takes all remaining space */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 20 }}
      >
        {filtered.length === 0 ? (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <Text style={{ fontSize: 32, marginBottom: 8 }}>🔍</Text>
            <Text
              style={{
                fontFamily: "Outfit-SemiBold",
                fontSize: 13,
                color: theme.textActive,
              }}
            >
              No items found
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 12,
                color: theme.subtext,
                marginTop: 3,
              }}
            >
              Try a different search or category
            </Text>
          </View>
        ) : (
          filtered.map((item) => {
            const status = resolveStockStatus(item);
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => onSelect(item)}
                activeOpacity={0.7}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: theme.border,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 9,
                    backgroundColor: theme.background,
                    borderWidth: 1,
                    borderColor: theme.border,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 11,
                  }}
                >
                  <Package size={16} color={theme.subtext} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Outfit-SemiBold",
                      fontSize: 13,
                      color: theme.textActive,
                    }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 3,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 11,
                        color: theme.subtext,
                      }}
                    >
                      {item.itemCode}
                    </Text>
                    <Text style={{ color: theme.border, fontSize: 10 }}>·</Text>
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 11,
                        color: theme.subtext,
                      }}
                    >
                      {item.category}
                    </Text>
                    <Text style={{ color: theme.border, fontSize: 10 }}>·</Text>
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 11,
                        color: theme.subtext,
                      }}
                    >
                      {item.currentStock} {item.unit}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontFamily: "Outfit-SemiBold",
                      fontSize: 12,
                      color: primary,
                      marginTop: 3,
                    }}
                  >
                    ₱{item.pricePerUnit.toFixed(2)}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 5 }}>
                  <StockBadge status={status} />
                  <ChevronRight size={13} color={theme.subtext} />
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Cart Row ─────────────────────────────────────────────────────────────────

type CartRowProps = {
  row: CartItem;
  index: number;
  onUpdateQty: (uid: string, qty: number) => void;
  onUpdateNotes: (uid: string, notes: string) => void;
  onRemove: (uid: string) => void;
  showError: boolean;
  theme: any;
  primary: string;
};

function CartRow({
  row,
  index,
  onUpdateQty,
  onRemove,
  theme,
  primary,
}: {
  row: CartItem;
  index: number;
  onUpdateQty: (uid: string, qty: number) => void;
  onRemove: (uid: string) => void;
  theme: any;
  primary: string;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.surface,
        borderWidth: 1.5,
        borderColor: theme.border,
        borderRadius: 12,
        marginBottom: 10,
        overflow: "hidden",
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          padding: 13,
          gap: 10,
        }}
      >
        {/* Index badge */}
        <View
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            backgroundColor: primary + "20",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit-SemiBold",
              fontSize: 11,
              color: primary,
            }}
          >
            {index + 1}
          </Text>
        </View>

        {/* Name + code */}
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: "Outfit-SemiBold",
              fontSize: 13,
              color: theme.textActive,
            }}
            numberOfLines={1}
          >
            {row.itemName}
          </Text>
         <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              marginTop: 2,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 11,
                color: theme.subtext,
              }}
            >
              {row.itemCode}
            </Text>
            <Text style={{ color: theme.border, fontSize: 10 }}>·</Text>
            <StockBadge status={row.stockStatusAtRequest} />
          </View>
          <Text
            style={{
              fontFamily: "Outfit-SemiBold",
              fontSize: 12,
              color: primary,
              marginTop: 4,
            }}
          >
            ₱{row.pricePerUnit.toFixed(2)} × {row.quantityRequested} = ₱
            {(row.pricePerUnit * row.quantityRequested).toFixed(2)}
          </Text>
        </View>

        {/* Qty stepper */}
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <TouchableOpacity
            onPress={() =>
              onUpdateQty(row.uid, Math.max(1, row.quantityRequested - 1))
            }
            activeOpacity={0.7}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text
              style={{ fontSize: 16, color: theme.textActive, lineHeight: 19 }}
            >
              −
            </Text>
          </TouchableOpacity>

          <TextInput
            value={String(row.quantityRequested)}
            onChangeText={(v) => {
              const n = parseInt(v, 10);
              if (!isNaN(n) && n > 0) onUpdateQty(row.uid, n);
            }}
            keyboardType="numeric"
            style={{
              width: 40,
              textAlign: "center",
              fontFamily: "Outfit-SemiBold",
              fontSize: 14,
              color: theme.textActive,
              padding: 0,
            }}
          />

          <TouchableOpacity
            onPress={() => onUpdateQty(row.uid, row.quantityRequested + 1)}
            activeOpacity={0.7}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              backgroundColor: primary,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Text style={{ fontSize: 16, color: "#fff", lineHeight: 19 }}>
              +
            </Text>
          </TouchableOpacity>
        </View>

        {/* Remove */}
        <TouchableOpacity
          onPress={() => onRemove(row.uid)}
          activeOpacity={0.7}
          style={{ marginLeft: 2 }}
        >
          <Trash2 size={15} color="#F87171" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

export default function SupplyRequestModal({
  visible,
  onClose,
  user,
  onSuccess,
}: Props) {
  const { theme } = useTheme();
  const primary = theme.primary ?? "#4169E1";

  const [step, setStep] = useState<ModalStep>("cart");
  const [inventory, setInventory] = useState<OfficeInventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState(false);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [generalNotes, setGeneralNotes] = useState("");
  const [generalNotesError, setGeneralNotesError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [ticketNumber, setTicketNumber] = useState("");
  const [showRowErrors, setShowRowErrors] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setLoadingInventory(true);
    getAllInventoryItems()
      .then(setInventory)
      .catch(() => setError("Failed to load inventory."))
      .finally(() => setLoadingInventory(false));
  }, [visible]);

  useEffect(() => {
    if (!visible) {
      setStep("cart");
      setCart([]);
      setGeneralNotes("");
      setGeneralNotesError(false);
      setError("");
      setTicketNumber("");
      setShowRowErrors(false);
    }
  }, [visible]);

  // ── Cart helpers ────────────────────────────────────────────────────────────

const addToCart = useCallback((item: OfficeInventoryItem) => {
    setCart((prev) => [
      ...prev,
      {
        uid: uid(),
        itemId: item.id,
        itemName: item.name,
        itemCode: item.itemCode,
        category: item.category,
        quantityRequested: 1,
        stockStatusAtRequest: resolveStockStatus(item),
        pricePerUnit: item.pricePerUnit,
      },
    ]);
    setStep("cart");
  }, []);

  const updateQty = useCallback((rowUid: string, qty: number) => {
    setCart((prev) =>
      prev.map((r) =>
        r.uid === rowUid ? { ...r, quantityRequested: qty } : r,
      ),
    );
  }, []);

  const updateNotes = useCallback((rowUid: string, notes: string) => {
    setCart((prev) =>
      prev.map((r) => (r.uid === rowUid ? { ...r, notes } : r)),
    );
  }, []);

  const removeFromCart = useCallback((rowUid: string) => {
    setCart((prev) => prev.filter((r) => r.uid !== rowUid));
  }, []);

  // ── Validate & proceed to confirm ──────────────────────────────────────────

  const handleReview = () => {
    setError("");
    setShowRowErrors(false);
    setStep("confirm");
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (cart.length === 0) {
      setError("Add at least one item.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const ticket = await submitSupplyRequest({
        requestedById: user.username,
        requestedByName: user.displayName ?? user.username,
     items: cart.map(
          ({
            itemId,
            itemName,
            itemCode,
            category,
            quantityRequested,
            stockStatusAtRequest,
            pricePerUnit,
          }) => ({
            itemId,
            itemName,
            itemCode,
            category,
            quantityRequested,
            stockStatusAtRequest,
            pricePerUnit,
          }),
        ),
        notes: generalNotes.trim(),
      });
      setTicketNumber(ticket);
      setStep("done");
      onSuccess?.(ticket);
    } catch (err: any) {
      setError(err?.message ?? "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const alreadyAddedIds = cart.map((r) => r.itemId);
  const MODAL_H = SCREEN_H * 0.88;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        {/* Backdrop */}
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          {/* Modal card */}
          <View
            style={{
              width: MODAL_W,
              maxHeight: MODAL_H,
              backgroundColor: theme.surface,
              borderRadius: 20,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.25,
              shadowRadius: 24,
              elevation: 16,
            }}
          >
            {/* ════════ PICKER STEP ════════ */}
            {step === "picker" && (
              <View style={{ height: MODAL_H }}>
                <ItemPickerSheet
                  items={inventory}
                  alreadyAdded={alreadyAddedIds}
                  onSelect={addToCart}
                  onClose={() => setStep("cart")}
                  theme={theme}
                  primary={primary}
                />
              </View>
            )}

            {/* ════════ CONFIRM STEP ════════ */}
            {step === "confirm" && (
              <View style={{ height: MODAL_H }}>
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingTop: 18,
                    paddingBottom: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setStep("cart")}
                    activeOpacity={0.7}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 18,
                        color: theme.subtext,
                        lineHeight: 20,
                      }}
                    >
                      ‹
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Outfit-SemiBold",
                        fontSize: 13,
                        color: theme.subtext,
                      }}
                    >
                      Back
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      fontFamily: "Outfit-SemiBold",
                      fontSize: 15,
                      color: theme.textActive,
                    }}
                  >
                    Review Request
                  </Text>
                  <TouchableOpacity
                    onPress={onClose}
                    activeOpacity={0.7}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: theme.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={15} color={theme.subtext} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 20 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Request info card */}
                  <View
                    style={{
                      backgroundColor: theme.background,
                      borderWidth: 1.5,
                      borderColor: theme.border,
                      borderRadius: 12,
                      padding: 15,
                      marginBottom: 18,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-SemiBold",
                        fontSize: 10,
                        color: theme.subtext,
                        textTransform: "uppercase",
                        letterSpacing: 0.7,
                        marginBottom: 10,
                      }}
                    >
                      Request Summary
                    </Text>
                    {[
                      {
                        label: "Requested by",
                        value: user.displayName ?? user.username,
                      },
                      {
                        label: "Date",
                        value: new Date().toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        }),
                      },
                      {
                        label: "Total items",
                        value: `${cart.length} item${cart.length !== 1 ? "s" : ""}`,
                      },
                      {
                        label: "Total qty",
                        value: String(
                          cart.reduce((s, r) => s + r.quantityRequested, 0),
                        ),
                      },
                      {
                        label: "Estimated total",
                        value: `₱${cart
                          .reduce(
                            (s, r) => s + r.pricePerUnit * r.quantityRequested,
                            0,
                          )
                          .toFixed(2)}`,
                      },
                    ].map((row, i, arr) => (
                      <View
                        key={row.label}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingVertical: 7,
                          borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                          borderBottomColor: theme.border,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Outfit",
                            fontSize: 13,
                            color: theme.subtext,
                          }}
                        >
                          {row.label}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "Outfit-SemiBold",
                            fontSize: 13,
                            color: theme.textActive,
                          }}
                        >
                          {row.value}
                        </Text>
                      </View>
                    ))}
                  </View>

                  {/* Items */}
                  <Text
                    style={{
                      fontFamily: "Outfit-SemiBold",
                      fontSize: 13,
                      color: theme.textActive,
                      marginBottom: 10,
                    }}
                  >
                    Items ({cart.length})
                  </Text>
                  {cart.map((row, i) => (
                    <View
                      key={row.uid}
                      style={{
                        backgroundColor: theme.background,
                        borderWidth: 1,
                        borderColor: theme.border,
                        borderRadius: 10,
                        padding: 13,
                        marginBottom: 8,
                      }}
                    >
                      <View
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <View
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: 11,
                            backgroundColor: primary + "20",
                            alignItems: "center",
                            justifyContent: "center",
                            marginRight: 10,
                          }}
                        >
                          <Text
                            style={{
                              fontFamily: "Outfit-SemiBold",
                              fontSize: 10,
                              color: primary,
                            }}
                          >
                            {i + 1}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "Outfit-SemiBold",
                                fontSize: 13,
                                color: theme.textActive,
                                flex: 1,
                              }}
                              numberOfLines={1}
                            >
                              {row.itemName}
                            </Text>
                         <Text
                              style={{
                                fontFamily: "Outfit-SemiBold",
                                fontSize: 14,
                                color: primary,
                                marginLeft: 8,
                              }}
                            >
                              ×{row.quantityRequested}
                            </Text>
                          </View>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 5,
                              marginTop: 3,
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: "Outfit",
                                fontSize: 11,
                                color: theme.subtext,
                              }}
                            >
                              {row.itemCode}
                            </Text>
                            <Text style={{ color: theme.border, fontSize: 10 }}>
                              ·
                            </Text>
                            <StockBadge status={row.stockStatusAtRequest} />
                          </View>
                          <Text
                            style={{
                              fontFamily: "Outfit-SemiBold",
                              fontSize: 12,
                              color: primary,
                              marginTop: 5,
                            }}
                          >
                            ₱{row.pricePerUnit.toFixed(2)} × {row.quantityRequested} = ₱
                            {(row.pricePerUnit * row.quantityRequested).toFixed(2)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  ))}

                  {/* General notes */}
                  {generalNotes.trim() ? (
                    <View
                      style={{
                        marginTop: 6,
                        backgroundColor: theme.background,
                        borderWidth: 1.5,
                        borderColor: theme.border,
                        borderRadius: 10,
                        padding: 13,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-SemiBold",
                          fontSize: 10,
                          color: theme.subtext,
                          marginBottom: 5,
                          textTransform: "uppercase",
                          letterSpacing: 0.5,
                        }}
                      >
                        General Notes
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 13,
                          color: theme.textActive,
                        }}
                      >
                        {generalNotes}
                      </Text>
                    </View>
                  ) : null}

                  {error ? (
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        color: "#EF4444",
                        fontSize: 12,
                        marginTop: 12,
                      }}
                    >
                      {error}
                    </Text>
                  ) : null}
                </ScrollView>

                {/* Footer */}
                <View
                  style={{
                    padding: 16,
                    borderTopWidth: 1,
                    borderTopColor: theme.border,
                    flexDirection: "row",
                    gap: 10,
                  }}
                >
                  <TouchableOpacity
                    onPress={() => setStep("cart")}
                    activeOpacity={0.8}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: theme.border,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-SemiBold",
                        fontSize: 13,
                        color: theme.subtext,
                      }}
                    >
                      Edit
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSubmit}
                    disabled={submitting}
                    activeOpacity={0.8}
                    style={{
                      flex: 2,
                      paddingVertical: 12,
                      borderRadius: 10,
                      backgroundColor: primary,
                      alignItems: "center",
                      justifyContent: "center",
                      flexDirection: "row",
                      gap: 8,
                      opacity: submitting ? 0.6 : 1,
                    }}
                  >
                    {submitting ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <CheckCircle size={15} color="#fff" />
                    )}
                    <Text
                      style={{
                        fontFamily: "Outfit-SemiBold",
                        fontSize: 13,
                        color: "#fff",
                      }}
                    >
                      {submitting ? "Submitting…" : "Confirm & Submit"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ════════ DONE STEP ════════ */}
            {step === "done" && (
              <View
                style={{
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 40,
                }}
              >
                <Text style={{ fontSize: 56, marginBottom: 16 }}>🎉</Text>
                <Text
                  style={{
                    fontFamily: "Outfit-SemiBold",
                    fontSize: 20,
                    color: theme.textActive,
                    marginBottom: 8,
                    textAlign: "center",
                  }}
                >
                  Request Submitted!
                </Text>
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 13,
                    color: theme.subtext,
                    textAlign: "center",
                    lineHeight: 21,
                    marginBottom: 24,
                  }}
                >
                  Your supply request has been received.{"\n"}The admin team
                  will review it shortly.
                </Text>
                <View
                  style={{
                    backgroundColor: theme.background,
                    borderWidth: 1.5,
                    borderColor: primary,
                    borderRadius: 12,
                    paddingHorizontal: 24,
                    paddingVertical: 14,
                    marginBottom: 28,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Outfit",
                      fontSize: 10,
                      color: theme.subtext,
                      textAlign: "center",
                      marginBottom: 4,
                      textTransform: "uppercase",
                      letterSpacing: 0.7,
                    }}
                  >
                    Ticket Number
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Outfit-SemiBold",
                      fontSize: 20,
                      color: primary,
                      letterSpacing: 1.5,
                      textAlign: "center",
                    }}
                  >
                    {ticketNumber}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.8}
                  style={{
                    backgroundColor: primary,
                    borderRadius: 10,
                    paddingHorizontal: 32,
                    paddingVertical: 12,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Outfit-SemiBold",
                      fontSize: 14,
                      color: "#fff",
                    }}
                  >
                    Done
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* ════════ CART STEP ════════ */}
            {step === "cart" && (
              <View style={{ height: MODAL_H }}>
                {/* Header */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 20,
                    paddingTop: 18,
                    paddingBottom: 14,
                    borderBottomWidth: 1,
                    borderBottomColor: theme.border,
                  }}
                >
                  <View>
                    <Text
                      style={{
                        fontFamily: "Outfit-SemiBold",
                        fontSize: 16,
                        color: theme.textActive,
                      }}
                    >
                      📦 Supply Request
                    </Text>
                    <Text
                      style={{
                        fontFamily: "Outfit",
                        fontSize: 11,
                        color: theme.subtext,
                        marginTop: 2,
                      }}
                    >
                      {cart.length === 0
                        ? "Add items from the inventory"
                        : `${cart.length} item${cart.length !== 1 ? "s" : ""} · qty ${cart.reduce((s, r) => s + r.quantityRequested, 0)}`}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={onClose}
                    activeOpacity={0.7}
                    style={{
                      width: 30,
                      height: 30,
                      borderRadius: 15,
                      backgroundColor: theme.background,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <X size={15} color={theme.subtext} />
                  </TouchableOpacity>
                </View>

                <ScrollView
                  style={{ flex: 1 }}
                  contentContainerStyle={{ padding: 16 }}
                  showsVerticalScrollIndicator={false}
                >
                  {/* Loading */}
                  {loadingInventory && (
                    <View style={{ alignItems: "center", paddingVertical: 40 }}>
                      <ActivityIndicator size="small" color={primary} />
                      <Text
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 12,
                          color: theme.subtext,
                          marginTop: 10,
                        }}
                      >
                        Loading inventory…
                      </Text>
                    </View>
                  )}

                  {/* Empty state */}
                  {!loadingInventory && cart.length === 0 && (
                    <TouchableOpacity
                      onPress={() => setStep("picker")}
                      activeOpacity={0.8}
                      style={{
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 2,
                        borderColor: theme.border,
                        borderStyle: "dashed",
                        borderRadius: 16,
                        paddingVertical: 44,
                        marginBottom: 16,
                      }}
                    >
                      <Text style={{ fontSize: 38, marginBottom: 10 }}>📦</Text>
                      <Text
                        style={{
                          fontFamily: "Outfit-SemiBold",
                          fontSize: 14,
                          color: theme.textActive,
                          marginBottom: 4,
                        }}
                      >
                        No items added yet
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 12,
                          color: theme.subtext,
                          marginBottom: 16,
                        }}
                      >
                        Tap to browse available supplies
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          backgroundColor: primary,
                          borderRadius: 8,
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                        }}
                      >
                        <Plus size={13} color="#fff" />
                        <Text
                          style={{
                            fontFamily: "Outfit-SemiBold",
                            fontSize: 13,
                            color: "#fff",
                          }}
                        >
                          Browse Items
                        </Text>
                      </View>
                    </TouchableOpacity>
                  )}

                  {/* Cart rows */}
                  {cart.map((row, i) => (
                    <CartRow
                      key={row.uid}
                      row={row}
                      index={i}
                      onUpdateQty={updateQty}
                      onRemove={removeFromCart}
                      theme={theme}
                      primary={primary}
                    />
                  ))}

                  {/* Add more */}
                  {cart.length > 0 && (
                    <TouchableOpacity
                      onPress={() => setStep("picker")}
                      activeOpacity={0.7}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 6,
                        paddingVertical: 11,
                        borderWidth: 1.5,
                        borderColor: primary,
                        borderStyle: "dashed",
                        borderRadius: 10,
                        marginBottom: 18,
                      }}
                    >
                      <Plus size={13} color={primary} />
                      <Text
                        style={{
                          fontFamily: "Outfit-SemiBold",
                          fontSize: 13,
                          color: primary,
                        }}
                      >
                        Add another item
                      </Text>
                    </TouchableOpacity>
                  )}

                  {/* General notes — required */}
                  {cart.length > 0 && (
                    <View
                      style={{
                        backgroundColor: theme.background,
                        borderWidth: 1.5,
                        borderColor: generalNotesError
                          ? "#FCA5A5"
                          : theme.border,
                        borderRadius: 12,
                        padding: 13,
                        marginBottom: 6,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginBottom: 7,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "Outfit-SemiBold",
                            fontSize: 13,
                            color: theme.textActive,
                            flex: 1,
                          }}
                        >
                          Notes
                        </Text>
                        {generalNotesError && (
                          <Text
                            style={{
                              fontFamily: "Outfit",
                              fontSize: 11,
                              color: "#EF4444",
                            }}
                          >
                            Required
                          </Text>
                        )}
                      </View>
                      <TextInput
                        value={generalNotes}
                        onChangeText={(v) => {
                          setGeneralNotes(v);
                          if (v.trim()) setGeneralNotesError(false);
                        }}
                        placeholder="Purpose of request, urgency, or any info for the admin team…"
                        placeholderTextColor={theme.subtext}
                        multiline
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 13,
                          color: theme.textActive,
                          minHeight: 72,
                          textAlignVertical: "top",
                          padding: 0,
                        }}
                      />
                    </View>
                  )}

                  {error ? (
                    <View
                      style={{
                        backgroundColor: "#FEF2F2",
                        borderWidth: 1,
                        borderColor: "#FECACA",
                        borderRadius: 8,
                        padding: 11,
                        marginTop: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 12,
                          color: "#DC2626",
                        }}
                      >
                        ⚠ {error}
                      </Text>
                    </View>
                  ) : null}
                </ScrollView>

             {/* Footer */}
                {cart.length > 0 && (
                  <View
                    style={{
                      paddingHorizontal: 16,
                      paddingVertical: 14,
                      borderTopWidth: 1,
                      borderTopColor: theme.border,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 10,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit",
                          fontSize: 12,
                          color: theme.subtext,
                        }}
                      >
                        Estimated total
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Outfit-SemiBold",
                          fontSize: 15,
                          color: primary,
                        }}
                      >
                        ₱
                        {cart
                          .reduce(
                            (sum, r) => sum + r.pricePerUnit * r.quantityRequested,
                            0,
                          )
                          .toFixed(2)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={handleReview}
                      activeOpacity={0.8}
                      style={{
                        backgroundColor: primary,
                        borderRadius: 10,
                        paddingVertical: 13,
                        alignItems: "center",
                        justifyContent: "center",
                        flexDirection: "row",
                        gap: 8,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-SemiBold",
                          fontSize: 14,
                          color: "#fff",
                        }}
                      >
                        Review Request
                      </Text>
                      <ChevronRight size={15} color="#fff" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
