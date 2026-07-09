import React, { useEffect, useState } from "react";
import {
    OfficeCategory,
    OfficeInventoryItem,
    OfficeUnit,
} from "../../../../../types";
import {
    archiveInventoryItem,
    updateInventoryItem,
} from "../../../../services/Officeinventory";
import { useTheme } from "../../../../theme/ThemeContext";

const CATEGORY_CHOICES: { value: OfficeCategory; label: string }[] = [
  { value: "office_supplies", label: "Office Supplies" },
  { value: "cleaning", label: "Cleaning" },
  { value: "ppe", label: "PPE" },
  { value: "medicine", label: "Medicine" },
];

const UNIT_CHOICES: OfficeUnit[] = [
  "piece",
  "ream",
  "box",
  "roll",
  "pack",
  "bottle",
  "gallon",
];

type Props = {
  visible: boolean;
  item: OfficeInventoryItem | null;
  onClose: () => void;
  onSuccess: () => void;
};

const EditItemModal: React.FC<Props> = ({
  visible,
  item,
  onClose,
  onSuccess,
}) => {
  const { theme } = useTheme();
  const [form, setForm] = useState({
    name: "",
    brand: "",
    category: "office_supplies" as OfficeCategory,
    unit: "piece" as OfficeUnit,
    pricePerUnit: "",
    lowStockThreshold: "",
    inStockThreshold: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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
  }, [item]);

  if (!visible || !item) return null;

  const inputStyle = {
    backgroundColor: theme.inputBg,
    borderColor: theme.inputBorder,
    color: theme.inputText,
  };

  const handleSubmit = async () => {
    setError(null);
    if (!form.name.trim()) {
      setError("Item name is required.");
      return;
    }
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
      onClose();
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
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Unable to archive item.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      className="fixed inset-0 z-[100] flex items-center justify-center"
    >
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="w-[440px] max-w-[95vw] rounded-xl border shadow-xl"
      >
        <div
          style={{ borderColor: theme.border }}
          className="flex items-center justify-between px-5 py-4 border-b"
        >
          <div>
            <span
              style={{ color: theme.text }}
              className="text-sm font-semibold"
            >
              Edit item
            </span>
            <span style={{ color: theme.subtext }} className="text-xs ml-2">
              {item.itemCode}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ color: theme.subtext }}
            className="text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-3.5">
          {error && (
            <div className="text-xs px-3 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label
              style={{ color: theme.subtext }}
              className="text-xs font-medium"
            >
              Item name
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
              className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              style={{ color: theme.subtext }}
              className="text-xs font-medium"
            >
              Brand / Description
            </label>
            <input
              value={form.brand}
              onChange={(e) => setForm({ ...form, brand: e.target.value })}
              style={inputStyle}
              className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                style={{ color: theme.subtext }}
                className="text-xs font-medium"
              >
                Category
              </label>
              <select
                value={form.category}
                onChange={(e) =>
                  setForm({
                    ...form,
                    category: e.target.value as OfficeCategory,
                  })
                }
                style={inputStyle}
                className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
              >
                {CATEGORY_CHOICES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label
                style={{ color: theme.subtext }}
                className="text-xs font-medium"
              >
                Unit
              </label>
              <select
                value={form.unit}
                onChange={(e) =>
                  setForm({ ...form, unit: e.target.value as OfficeUnit })
                }
                style={inputStyle}
                className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
              >
                {UNIT_CHOICES.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label
              style={{ color: theme.subtext }}
              className="text-xs font-medium"
            >
              Price per unit (₱)
            </label>
            <input
              type="number"
              step="0.01"
              value={form.pricePerUnit}
              onChange={(e) =>
                setForm({ ...form, pricePerUnit: e.target.value })
              }
              style={inputStyle}
              className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label
                style={{ color: theme.subtext }}
                className="text-xs font-medium"
              >
                Low stock threshold
              </label>
              <input
                type="number"
                min="0"
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm({ ...form, lowStockThreshold: e.target.value })
                }
                style={inputStyle}
                className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label
                style={{ color: theme.subtext }}
                className="text-xs font-medium"
              >
                In stock threshold
              </label>
              <input
                type="number"
                min="0"
                value={form.inStockThreshold}
                onChange={(e) =>
                  setForm({ ...form, inStockThreshold: e.target.value })
                }
                style={inputStyle}
                className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
              />
            </div>
          </div>
          <span style={{ color: theme.subtext }} className="text-[11px] -mt-2">
            Stock at or below the in-stock threshold shows as Low Stock; 0
            always shows as Out of Stock.
          </span>

          {confirmArchive && (
            <div className="text-xs px-3 py-2.5 rounded-md bg-red-50 text-red-700 border border-red-200 flex items-center justify-between gap-3">
              <span>
                Archive this item? It will be hidden from the catalog.
              </span>
              <div className="flex gap-2 flex-shrink-0">
                <button
                  onClick={() => setConfirmArchive(false)}
                  className="font-medium underline"
                >
                  Cancel
                </button>
                <button onClick={handleArchive} className="font-semibold">
                  Confirm
                </button>
              </div>
            </div>
          )}
        </div>

        <div
          style={{ borderColor: theme.border }}
          className="flex justify-between items-center px-5 py-3.5 border-t"
        >
          <button
            onClick={() => setConfirmArchive(true)}
            style={{ color: "#dc2626" }}
            className="text-sm font-medium"
          >
            Archive item
          </button>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg border"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryText,
                opacity: submitting ? 0.6 : 1,
              }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg"
            >
              {submitting ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditItemModal;
