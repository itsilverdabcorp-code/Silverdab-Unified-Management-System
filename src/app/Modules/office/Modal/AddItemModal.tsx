// Modal/AddItemModal.tsx
import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { OfficeCategory, OfficeUnit } from "../../../../../types";
import {
    createInventoryItem,
    getAllInventoryItems,
} from "../../../../services/Officeinventory";
import { useTheme } from "../../../../theme/ThemeContext";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_CHOICES: { value: OfficeCategory; label: string }[] = [
  { value: "office_supplies", label: "Office Supplies" },
  { value: "cleaning", label: "Cleaning" },
  { value: "ppe", label: "PPE" },
  { value: "medicine", label: "Medicine" },
];
const CATEGORY_LABEL_MAP: Record<string, OfficeCategory> = {
  "office supplies": "office_supplies",
  office_supplies: "office_supplies",
  cleaning: "cleaning",
  ppe: "ppe",
  medicine: "medicine",
};
const UNIT_CHOICES: OfficeUnit[] = [
  "piece",
  "ream",
  "box",
  "roll",
  "pack",
  "bottle",
  "gallon",
];

const HEADER_MAP: Record<string, string> = {
  "item code": "itemCode",
  itemcode: "itemCode",
  code: "itemCode",
  "item name": "name",
  itemname: "name",
  name: "name",
  brand: "brand",
  description: "brand",
  category: "category",
  unit: "unit",
  "price per unit": "pricePerUnit",
  priceperunit: "pricePerUnit",
  price: "pricePerUnit",
  "beginning inventory": "beginningInventory",
  beginninginventory: "beginningInventory",
  "beginning stock": "beginningInventory",
  stock: "beginningInventory",
};

const CATEGORY_PREFIX: Record<OfficeCategory, string> = {
  office_supplies: "OS",
  cleaning: "CS",
  ppe: "PPE",
  medicine: "MS",
};

function getNextCode(
  items: { itemCode: string }[],
  category: OfficeCategory,
): string {
  const prefix = CATEGORY_PREFIX[category];
  const nums = items
    .map((i) => i.itemCode)
    .filter((c) => c.toUpperCase().startsWith(prefix))
    .map((c) => parseInt(c.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  // PPE uses 3 digits, others use 3 digits too
  return `${prefix}${String(next).padStart(3, "0")}`;
}
// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

interface BulkRow {
  id: number;
  itemCode: string;
  name: string;
  brand: string;
  category: OfficeCategory;
  unit: OfficeUnit;
  pricePerUnit: string;
  beginningInventory: string;
}

const EMPTY_ROW = (id: number): BulkRow => ({
  id,
  itemCode: "",
  name: "",
  brand: "",
  category: "office_supplies",
  unit: "piece",
  pricePerUnit: "",
  beginningInventory: "",
});

const emptyForm = {
  itemCode: "",
  name: "",
  brand: "",
  category: "office_supplies" as OfficeCategory,
  unit: "piece" as OfficeUnit,
  pricePerUnit: "",
  beginningInventory: "",
};

// ─── Icons ────────────────────────────────────────────────────────────────────

const icons = {
  upload: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 8l-4-4-4 4M12 4v12"
      />
    </svg>
  ),
  download: (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M8 12l4 4 4-4M12 4v12"
      />
    </svg>
  ),
  plus: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16M4 12h16" />
    </svg>
  ),
  save: (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
      />
    </svg>
  ),
};

// ─── Themed cell input ────────────────────────────────────────────────────────

const CellInput: React.FC<{
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  invalid?: boolean;
  width?: number;
}> = ({
  value,
  onChange,
  placeholder,
  type = "text",
  invalid,
  width = 100,
}) => {
  const { theme } = useTheme();
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width,
        padding: "0 8px",
        height: 32,
        fontSize: 12,
        borderRadius: 6,
        border: `1px solid ${invalid ? "#fca5a5" : theme.inputBorder}`,
        backgroundColor: invalid ? "#fef2f2" : theme.inputBg,
        color: theme.inputText,
        outline: "none",
        boxSizing: "border-box" as const,
      }}
    />
  );
};

const CellSelect: React.FC<{
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
  width?: number;
}> = ({ value, onChange, children, width = 130 }) => {
  const { theme } = useTheme();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width,
        padding: "0 8px",
        height: 32,
        fontSize: 12,
        borderRadius: 6,
        border: `1px solid ${theme.inputBorder}`,
        backgroundColor: theme.inputBg,
        color: theme.inputText,
        outline: "none",
      }}
    >
      {children}
    </select>
  );
};

// ─── Main modal ───────────────────────────────────────────────────────────────

const AddItemModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const { theme } = useTheme();
  const [tab, setTab] = useState<"single" | "bulk">("single");

  // single
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // bulk
  const [rows, setRows] = useState<BulkRow[]>([EMPTY_ROW(1)]);
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkSuccess, setBulkSuccess] = useState(0);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [nextCodes, setNextCodes] = useState<Record<OfficeCategory, string>>({
    office_supplies: "OS001",
    cleaning: "CS001",
    ppe: "PPE001",
    medicine: "MS001",
  });
  const [codesLoading, setCodesLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!visible) return;
    setCodesLoading(true);
    getAllInventoryItems()
      .then((items) => {
        const categories: OfficeCategory[] = [
          "office_supplies",
          "cleaning",
          "ppe",
          "medicine",
        ];
        const codes = {} as Record<OfficeCategory, string>;
        categories.forEach((cat) => {
          codes[cat] = getNextCode(items, cat);
        });
        setNextCodes(codes);
        // Pre-fill single form with default category's code
        setForm((prev) => ({ ...prev, itemCode: codes[prev.category] }));
        // Pre-fill bulk rows
        setRows((prev) =>
          prev.map((r) => ({ ...r, itemCode: codes[r.category] })),
        );
      })
      .finally(() => setCodesLoading(false));
  }, [visible]);

  if (!visible) return null;

  const inputStyle = {
    backgroundColor: theme.inputBg,
    borderColor: theme.inputBorder,
    color: theme.inputText,
  };

  const handleClose = () => {
    setForm(emptyForm);
    setError(null);
    setRows([EMPTY_ROW(1)]);
    setBulkError(null);
    setBulkSuccess(0);
    setParseWarnings([]);
    setTab("single");
    onClose();
  };

  // ── Single submit ──────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setError(null);
    if (!form.itemCode.trim() || !form.name.trim()) {
      setError("Item code and item name are required.");
      return;
    }
    setSubmitting(true);
    try {
      await createInventoryItem({
        itemCode: form.itemCode.trim(),
        name: form.name.trim(),
        brand: form.brand.trim() || undefined,
        category: form.category,
        unit: form.unit,
        pricePerUnit: Number(form.pricePerUnit) || 0,
        beginningInventory: Number(form.beginningInventory) || 0,
      });
      setForm(emptyForm);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Unable to add item.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Bulk helpers ───────────────────────────────────────────────────────────

  const updateRow = (id: number, field: keyof BulkRow, value: string) =>
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, [field]: value };
        // When category changes, recalculate item code based on current rows
        if (field === "category") {
          const cat = value as OfficeCategory;
          const prefix = CATEGORY_PREFIX[cat];
          // Count how many rows already have this category (excluding current)
          const sameCategory = prev.filter(
            (other) => other.id !== id && other.category === cat,
          );
          // Find the highest existing suffix among nextCodes base + existing rows
          const baseNum = parseInt(nextCodes[cat].slice(prefix.length), 10);
          const rowNums = sameCategory
            .map((other) => parseInt(other.itemCode.slice(prefix.length), 10))
            .filter((n) => !isNaN(n));
          const maxNum =
            rowNums.length > 0 ? Math.max(...rowNums) : baseNum - 1;
          updated.itemCode = `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
        }
        return updated;
      }),
    );

  const addRow = () => {
    const cat: OfficeCategory = "office_supplies";
    const prefix = CATEGORY_PREFIX[cat];
    const existingNums = rows
      .filter((r) => r.category === cat)
      .map((r) => parseInt(r.itemCode.slice(prefix.length), 10))
      .filter((n) => !isNaN(n));
    const baseNum = parseInt(nextCodes[cat].slice(prefix.length), 10);
    const maxNum =
      existingNums.length > 0 ? Math.max(...existingNums) : baseNum - 1;
    const newCode = `${prefix}${String(maxNum + 1).padStart(3, "0")}`;
    setRows((prev) => [
      ...prev,
      { ...EMPTY_ROW(Date.now()), itemCode: newCode },
    ]);
  };

  const removeRow = (id: number) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkError(null);
    setParseWarnings([]);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
          sheet,
          { defval: "" },
        );

        if (json.length === 0) {
          setBulkError("The file appears to be empty.");
          return;
        }

        const warnings: string[] = [];
        // Remove the duplicate warning line too
        const parsed: BulkRow[] = json.reduce<BulkRow[]>((acc, raw, i) => {
          const norm: Record<string, string> = {};
          for (const key of Object.keys(raw)) {
            const mapped = HEADER_MAP[key.toLowerCase().trim()];
            if (mapped) norm[mapped] = String(raw[key]).trim();
          }
          if (!norm.name) warnings.push(`Row ${i + 2}: Missing item name`);

          const cat: OfficeCategory =
            CATEGORY_LABEL_MAP[norm.category?.toLowerCase().trim() ?? ""] ??
            "office_supplies";
          const prefix = CATEGORY_PREFIX[cat];
          const baseNum = parseInt(nextCodes[cat].slice(prefix.length), 10);
          const existingNums = acc
            .filter((r) => r.category === cat)
            .map((r) => parseInt(r.itemCode.slice(prefix.length), 10))
            .filter((n) => !isNaN(n));
          const maxNum =
            existingNums.length > 0 ? Math.max(...existingNums) : baseNum - 1;
          const autoCode = `${prefix}${String(maxNum + 1).padStart(3, "0")}`;

          acc.push({
            id: Date.now() + i,
            itemCode: autoCode,
            name: norm.name ?? "",
            brand: norm.brand ?? "",
            category: cat,
            unit: (norm.unit as OfficeUnit) ?? "piece",
            pricePerUnit: norm.pricePerUnit ?? "",
            beginningInventory: norm.beginningInventory ?? "",
          });
          return acc;
        }, []);

        setParseWarnings(warnings);
        setRows(parsed);
      } catch {
        setBulkError(
          "Could not read the file. Make sure it's a valid .xlsx or .csv.",
        );
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleBulkSubmit = async () => {
    const invalid = rows.find((r) => !r.itemCode.trim() || !r.name.trim());
    if (invalid) {
      setBulkError("Every row needs an item code and item name.");
      return;
    }

    setBulkSubmitting(true);
    setBulkError(null);
    setBulkSuccess(0);

    try {
      // Sequential to avoid duplicate-code race conditions
      for (const r of rows) {
        await createInventoryItem({
          itemCode: r.itemCode.trim(),
          name: r.name.trim(),
          brand: r.brand.trim() || undefined,
          category: r.category,
          unit: r.unit,
          pricePerUnit: Number(r.pricePerUnit) || 0,
          beginningInventory: Number(r.beginningInventory) || 0,
        });
      }
      setBulkSuccess(rows.length);
      setRows([EMPTY_ROW(1)]);
      onSuccess();
      setTimeout(handleClose, 900);
    } catch (err: any) {
      setBulkError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBulkSubmitting(false);
    }
  };

  // ── Shared styles ──────────────────────────────────────────────────────────

  const cancelBtn: React.CSSProperties = {
    padding: "7px 16px",
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
    border: `1px solid ${theme.border}`,
    backgroundColor: "transparent",
    color: theme.subtext,
  };

  const primaryBtn: React.CSSProperties = {
    padding: "7px 18px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    backgroundColor: theme.primary,
    color: theme.primaryText,
    display: "flex",
    alignItems: "center",
    gap: 6,
    opacity: submitting || bulkSubmitting ? 0.6 : 1,
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.35)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          width: tab === "bulk" ? "min(95vw, 980px)" : "min(95vw, 440px)",
          maxHeight: "90vh",
          transition: "width 0.2s ease",
          borderRadius: 16,
          border: `1px solid ${theme.border}`,
          boxShadow: `0 20px 60px ${theme.shadow}`,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{ borderBottom: `1px solid ${theme.border}` }}
          className="flex items-start justify-between px-5 pt-5 pb-4"
        >
          <div>
            <h2
              style={{
                color: theme.text,
                fontSize: 17,
                fontWeight: 600,
                margin: 0,
              }}
            >
              Add new item
            </h2>
            <p style={{ color: theme.subtext, fontSize: 11, marginTop: 2 }}>
              Fill in the details below to register a new office inventory item
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Tab switcher */}
            <div
              style={{
                display: "flex",
                gap: 2,
                backgroundColor: theme.inputBg,
                border: `1px solid ${theme.border}`,
                borderRadius: 8,
                padding: 3,
              }}
            >
              {(["single", "bulk"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 12,
                    fontWeight: 500,
                    borderRadius: 6,
                    cursor: "pointer",
                    border: "none",
                    backgroundColor: tab === t ? theme.primary : "transparent",
                    color: tab === t ? theme.primaryText : theme.subtext,
                    transition: "all 0.15s",
                  }}
                >
                  {t === "single" ? "Single" : "Bulk add"}
                </button>
              ))}
            </div>
            <button
              onClick={handleClose}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: theme.subtext,
                fontSize: 20,
                lineHeight: 1,
                padding: 4,
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* ══ SINGLE TAB ══════════════════════════════════════════════════════ */}
        {tab === "single" && (
          <>
            <div className="px-5 py-4 flex flex-col gap-3.5 overflow-y-auto flex-1">
              {error && (
                <div className="text-xs px-3 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
                  {error}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label
                    style={{ color: theme.subtext }}
                    className="text-xs font-medium"
                  >
                    Item code
                  </label>
                  <div
                    style={{
                      ...inputStyle,
                      padding: "0 10px",
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      borderRadius: 6,
                      border: `1px solid ${theme.inputBorder}`,
                      fontSize: 14,
                      fontFamily: "monospace",
                      opacity: codesLoading ? 0.5 : 1,
                      userSelect: "none" as const,
                    }}
                  >
                    {codesLoading ? "Loading…" : form.itemCode}
                  </div>
                  <span
                    style={{ color: theme.subtext }}
                    className="text-[11px]"
                  >
                    Auto-assigned · not editable
                  </span>
                </div>
                <div className="flex flex-col gap-1">
                  <label
                    style={{ color: theme.subtext }}
                    className="text-xs font-medium"
                  >
                    Category
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => {
                      const cat = e.target.value as OfficeCategory;
                      setForm({
                        ...form,
                        category: cat,
                        itemCode: nextCodes[cat],
                      });
                    }}
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
              </div>

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
                  placeholder="e.g. Bond Paper A4"
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
                  placeholder="Brand name or description"
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
                    placeholder="0.00"
                    style={inputStyle}
                    className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <label
                  style={{ color: theme.subtext }}
                  className="text-xs font-medium"
                >
                  Beginning inventory
                </label>
                <input
                  type="number"
                  min="0"
                  value={form.beginningInventory}
                  onChange={(e) =>
                    setForm({ ...form, beginningInventory: e.target.value })
                  }
                  placeholder="Starting stock count"
                  style={inputStyle}
                  className="px-2.5 py-2 text-sm border rounded-md focus:outline-none"
                />
              </div>
            </div>

            <div
              style={{ borderTop: `1px solid ${theme.border}` }}
              className="flex justify-end gap-2 px-5 py-3.5"
            >
              <button onClick={handleClose} style={cancelBtn}>
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                style={primaryBtn}
              >
                {icons.save}
                {submitting ? "Adding…" : "Add item"}
              </button>
            </div>
          </>
        )}

        {/* ══ BULK TAB ════════════════════════════════════════════════════════ */}
        {tab === "bulk" && (
          <>
            {/* Bulk toolbar */}
            <div
              className="px-5 pt-4 pb-3"
              style={{ borderBottom: `1px solid ${theme.border}` }}
            >
              <div className="flex items-center gap-3 flex-wrap">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    fontSize: 13,
                    fontWeight: 500,
                    borderRadius: 8,
                    cursor: "pointer",
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.inputBg,
                    color: theme.text,
                  }}
                >
                  {icons.upload} Upload Excel / CSV
                </button>

                <a
                  href={`data:text/csv;charset=utf-8,${encodeURIComponent(
                    "Item Code,Item Name,Brand,Category,Unit,Price Per Unit,Beginning Inventory\r\nOS017,Bond Paper A4,Hapee,office_supplies,ream,232,50",
                  )}`}
                  download="office_inventory_template.csv"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    fontSize: 12,
                    color: theme.primary,
                    textDecoration: "none",
                  }}
                >
                  {icons.download} Download template
                </a>
                <span
                  style={{
                    fontSize: 11,
                    color: theme.subtext,
                    marginLeft: "auto",
                  }}
                >
                  {rows.length} row{rows.length !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Parse warnings */}
              {parseWarnings.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    backgroundColor: "#fef3c7",
                    border: "1px solid #fcd34d",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#92400e",
                      margin: "0 0 4px",
                    }}
                  >
                    ⚠ Import warnings
                  </p>
                  {parseWarnings.slice(0, 5).map((w, i) => (
                    <p
                      key={i}
                      style={{ fontSize: 12, color: "#92400e", margin: 0 }}
                    >
                      {w}
                    </p>
                  ))}
                  {parseWarnings.length > 5 && (
                    <p
                      style={{
                        fontSize: 12,
                        color: theme.subtext,
                        marginTop: 4,
                      }}
                    >
                      …and {parseWarnings.length - 5} more
                    </p>
                  )}
                </div>
              )}

              {bulkError && (
                <div
                  style={{
                    marginTop: 10,
                    backgroundColor: "#fef2f2",
                    border: "1px solid #fca5a5",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p style={{ fontSize: 12, color: "#991b1b", margin: 0 }}>
                    ⚠ {bulkError}
                  </p>
                </div>
              )}

              {bulkSuccess > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    backgroundColor: "#f0fdf4",
                    border: "1px solid #bbf7d0",
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p style={{ fontSize: 12, color: "#16a34a", margin: 0 }}>
                    ✓ {bulkSuccess} item{bulkSuccess !== 1 ? "s" : ""} added
                    successfully!
                  </p>
                </div>
              )}
            </div>

            {/* Bulk table */}
            <div className="overflow-auto flex-1 px-5 py-3">
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 800,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "#",
                      "Item Code *",
                      "Item Name *",
                      "Brand",
                      "Category",
                      "Unit",
                      "Price/Unit (₱)",
                      "Beg. Inventory",
                      "",
                    ].map((h) => (
                      <th
                        key={h}
                        style={{
                          padding: "6px 8px",
                          textAlign: "left",
                          fontSize: 11,
                          fontWeight: 600,
                          color: theme.subtext,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          borderBottom: `1px solid ${theme.border}`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={row.id}
                      style={{
                        backgroundColor:
                          i % 2 === 0 ? "transparent" : theme.inputBg,
                      }}
                    >
                      <td
                        style={{
                          padding: "4px 8px",
                          fontSize: 11,
                          color: theme.subtext,
                          width: 28,
                        }}
                      >
                        {i + 1}
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <div
                          style={{
                            width: 80,
                            padding: "0 8px",
                            height: 32,
                            fontSize: 12,
                            borderRadius: 6,
                            border: `1px solid ${theme.border}`,
                            backgroundColor:
                              theme.surfaceRaised ?? theme.inputBg,
                            color: theme.subtext,
                            display: "flex",
                            alignItems: "center",
                            fontFamily: "monospace",
                            userSelect: "none" as const,
                          }}
                        >
                          {row.itemCode || "—"}
                        </div>
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <CellInput
                          value={row.name}
                          onChange={(v) => updateRow(row.id, "name", v)}
                          placeholder="Item name"
                          invalid={!row.name}
                          width={150}
                        />
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <CellInput
                          value={row.brand}
                          onChange={(v) => updateRow(row.id, "brand", v)}
                          placeholder="Brand"
                          width={100}
                        />
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <CellSelect
                          value={row.category}
                          onChange={(v) => updateRow(row.id, "category", v)}
                          width={140}
                        >
                          {CATEGORY_CHOICES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </CellSelect>
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <CellSelect
                          value={row.unit}
                          onChange={(v) => updateRow(row.id, "unit", v)}
                          width={90}
                        >
                          {UNIT_CHOICES.map((u) => (
                            <option key={u} value={u}>
                              {u}
                            </option>
                          ))}
                        </CellSelect>
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <CellInput
                          value={row.pricePerUnit}
                          onChange={(v) => updateRow(row.id, "pricePerUnit", v)}
                          placeholder="0.00"
                          type="number"
                          width={90}
                        />
                      </td>

                      <td style={{ padding: "4px 4px" }}>
                        <CellInput
                          value={row.beginningInventory}
                          onChange={(v) =>
                            updateRow(row.id, "beginningInventory", v)
                          }
                          placeholder="0"
                          type="number"
                          width={90}
                        />
                      </td>

                      <td style={{ padding: "4px 8px", textAlign: "center" }}>
                        {rows.length > 1 && (
                          <button
                            onClick={() => removeRow(row.id)}
                            style={{
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              color: theme.subtext,
                              fontSize: 16,
                              lineHeight: 1,
                              padding: 2,
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.color = "#ef4444")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.color = theme.subtext)
                            }
                          >
                            ×
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <button
                onClick={addRow}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 10,
                  fontSize: 13,
                  fontWeight: 500,
                  color: theme.primary,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "4px 0",
                }}
              >
                {icons.plus} Add row
              </button>
            </div>

            {/* Bulk footer */}
            <div
              style={{ borderTop: `1px solid ${theme.border}` }}
              className="flex items-center justify-between px-5 py-3"
            >
              <p style={{ fontSize: 11, color: theme.subtext, margin: 0 }}>
                {rows.length} row{rows.length !== 1 ? "s" : ""} · Required
                fields marked with *
              </p>
              <div className="flex gap-2">
                <button onClick={handleClose} style={cancelBtn}>
                  Cancel
                </button>
                <button
                  onClick={handleBulkSubmit}
                  disabled={bulkSubmitting}
                  style={primaryBtn}
                >
                  {icons.save}
                  {bulkSubmitting
                    ? "Saving…"
                    : `Save ${rows.length} item${rows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddItemModal;
