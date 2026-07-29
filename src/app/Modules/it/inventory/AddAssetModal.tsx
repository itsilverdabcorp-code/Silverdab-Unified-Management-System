import React, { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { ITInventory, NewAssetInput } from "../../../../../types";
import BadgeSelect from "../../../../components/common/BadgeSelect";
import { useEmployees } from "../../../../hooks/useEmployees";
import { addAsset } from "../../../../services/itInventory";
import { useTheme } from "../../../../theme/ThemeContext";
import { DropdownOption } from "./ITInventoryPage";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  dropdownOptions: {
    category: DropdownOption[];
    status: DropdownOption[];
    company: DropdownOption[];
    location: DropdownOption[];
  };
}

const EMPTY_SINGLE = {
  assetTag: "",
  company: "",
  serialNumber: "",
  model: "",
  brand: "",
  status: "Spare" as ITInventory["status"],
  assigneeId: "",
  assigneeName: "",
  category: "Laptop" as ITInventory["category"],
  location: "Unit 1 & 2" as ITInventory["location"],
  datePurchased: "",
  notes: "",
};

interface BulkRow {
  id: number;
  assetTag: string;
  company: string;
  serialNumber: string;
  model: string;
  brand: string;
  category: ITInventory["category"];
  status: ITInventory["status"];
  assigneeId: string;
  assigneeName: string;
  location: ITInventory["location"];
  datePurchased: string;
  notes: string;
}

const EMPTY_ROW = (id: number): BulkRow => ({
  id,
  assetTag: "",
  company: "",
  serialNumber: "",
  model: "",
  brand: "",
  category: "Laptop",
  status: "Spare",
  assigneeId: "",
  assigneeName: "",
  location: "Unit 1 & 2",
  datePurchased: "",
  notes: "",
});

const HEADER_MAP: Record<string, keyof BulkRow> = {
  "asset tag": "assetTag",
  assettag: "assetTag",
  tag: "assetTag",
  asset: "assetTag",
  company: "company",
  "serial number": "serialNumber",
  serialnumber: "serialNumber",
  serial: "serialNumber",
  model: "model",
  brand: "brand",
  category: "category",
  type: "category",
  status: "status",
  assignee: "assigneeName",
  assigneename: "assigneeName",
  location: "location",
  "date purchased": "datePurchased",
  datepurchased: "datePurchased",
  purchased: "datePurchased",
  notes: "notes",
};

const VALID_CATEGORIES = [
  "Laptop",
  "Monitor",
  "Desktop",
  "UPS",
  "Network Device",
  "Server",
];
const VALID_COMPANIES = ["OCG", "SDB"];

const normalizeCategory = (val: string): ITInventory["category"] => {
  const match = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === val?.toString().toLowerCase().trim(),
  );
  return (match as ITInventory["category"]) ?? "Laptop";
};
const normalizeCompany = (val: string): string => {
  const match = VALID_COMPANIES.find(
    (c) => c.toLowerCase() === val?.toString().toLowerCase().trim(),
  );
  return match ?? val?.toString().trim() ?? "";
};

const ThemedInput: React.FC<{
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}> = ({ name, value, onChange, placeholder, type = "text" }) => {
  const { theme } = useTheme();
  return (
    <input
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={{
        width: "100%",
        padding: "0 10px",
        height: 38,
        fontSize: 13,
        borderRadius: 8,
        border: `1px solid ${theme.inputBorder}`,
        backgroundColor: theme.inputBg,
        color: theme.inputText,
        outline: "none",
        boxSizing: "border-box",
      }}
    />
  );
};

const ThemedTextarea: React.FC<{
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
}> = ({ name, value, onChange, placeholder, rows = 3 }) => {
  const { theme } = useTheme();
  return (
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: "100%",
        padding: "8px 10px",
        fontSize: 13,
        borderRadius: 8,
        border: `1px solid ${theme.inputBorder}`,
        backgroundColor: theme.inputBg,
        color: theme.inputText,
        outline: "none",
        resize: "none",
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    />
  );
};

const ThemedSelect: React.FC<{
  value: string;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ value, onChange, children, style }) => {
  const { theme } = useTheme();
  return (
    <select
      value={value}
      onChange={onChange}
      style={{
        padding: "0 8px",
        height: 32,
        fontSize: 12,
        borderRadius: 6,
        border: `1px solid ${theme.inputBorder}`,
        backgroundColor: theme.inputBg,
        color: theme.inputText,
        outline: "none",
        ...style,
      }}
    >
      {children}
    </select>
  );
};

const AssigneeSearchSelect: React.FC<{
  value: string;
  displayName: string;
  options: { label: string; value: string }[];
  onChange: (value: string, label: string) => void;
}> = ({ value, displayName, options, onChange }) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const allOptions = [{ label: "—", value: "" }, ...options];
  const filtered = query
    ? allOptions.filter((o) =>
        o.label.toLowerCase().includes(query.toLowerCase()),
      )
    : allOptions;

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const dropdownH = Math.min(200, filtered.length * 28 + 40);
      const showAbove = spaceBelow < dropdownH && rect.top > dropdownH;
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: Math.max(rect.width, 140),
        zIndex: 9999,
        ...(showAbove
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    }
    setQuery("");
    setOpen(true);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        style={{
          width: "100%",
          textAlign: "left",
          padding: "0 8px",
          height: 32,
          fontSize: 12,
          borderRadius: 6,
          border: `1px solid ${theme.inputBorder}`,
          backgroundColor: theme.inputBg,
          color: value ? theme.inputText : theme.subtext,
          cursor: "pointer",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value ? displayName : "Unassigned"}
      </button>

      {open && (
        <div
          style={{
            ...dropdownStyle,
            backgroundColor: theme.surface,
            border: `1px solid ${theme.border}`,
            borderRadius: 8,
            boxShadow: `0 8px 24px ${theme.shadow}`,
          }}
        >
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search..."
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: "8px 10px",
              fontSize: 12,
              border: "none",
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: theme.surface,
              color: theme.text,
              outline: "none",
            }}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
              }
            }}
          />
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: "4px 0",
              maxHeight: 176,
              overflowY: "auto",
            }}
          >
            {filtered.length === 0 ? (
              <li
                style={{ padding: "6px 10px", fontSize: 12, color: theme.subtext }}
              >
                No results
              </li>
            ) : (
              filtered.map((o) => (
                <li
                  key={o.value}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.value, o.label);
                    setOpen(false);
                    setQuery("");
                  }}
                  style={{
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                    color: o.value === value ? theme.primary : theme.text,
                    fontWeight: o.value === value ? 600 : 400,
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.backgroundColor = theme.bgHover)
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.backgroundColor = "transparent")
                  }
                >
                  {o.label}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{
  label: string;
  children: React.ReactNode;
  className?: string;
}> = ({ label, children, className = "" }) => {
  const { theme } = useTheme();
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label style={{ fontSize: 12, fontWeight: 500, color: theme.subtext }}>
        {label}
      </label>
      {children}
    </div>
  );
};

const AddAssetModal: React.FC<Props> = ({
  visible,
  onClose,
  onSuccess,
  dropdownOptions,
}) => {
  const { theme } = useTheme();
  const [tab, setTab] = useState<"single" | "bulk">("single");

  const [form, setForm] = useState(EMPTY_SINGLE);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [rows, setRows] = useState<BulkRow[]>([EMPTY_ROW(1)]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [bulkSuccess, setBulkSuccess] = useState(0);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { employees } = useEmployees();

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSingleSubmit = async () => {
    if (!form.assetTag || !form.company || !form.brand) {
      setError("Asset Tag, Company, and Brand are required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const emp = employees.find((e) => e.id === form.assigneeId);
      await addAsset({
        ...form,
        assigneeName: emp?.name ?? "",
      } as NewAssetInput);
      setForm(EMPTY_SINGLE);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const updateRow = (id: number, field: keyof BulkRow, value: string) =>
    setRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r)),
    );

  const addRow = () => setRows((prev) => [...prev, EMPTY_ROW(Date.now())]);
  const removeRow = (id: number) =>
    setRows((prev) => prev.filter((r) => r.id !== id));

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkError("");
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
        const parsed: BulkRow[] = json.map((raw, i) => {
          const normalized: Record<string, string> = {};
          for (const key of Object.keys(raw)) {
            const mapped = HEADER_MAP[key.toLowerCase().trim()];
            if (mapped) {
              const val = String(raw[key]).trim();
              if (val) normalized[mapped] = val;
            }
          }
          if (!normalized.assetTag)
            warnings.push(`Row ${i + 2}: Missing Asset Tag`);
          if (!normalized.brand) warnings.push(`Row ${i + 2}: Missing Brand`);
          if (!normalized.company)
            warnings.push(`Row ${i + 2}: Missing Company`);
          return {
            id: Date.now() + i,
            assetTag: normalized.assetTag ?? "",
            brand: normalized.brand ?? "",
            model: normalized.model ?? "",
            serialNumber: normalized.serialNumber ?? "",
            category: normalizeCategory(normalized.category ?? ""),
            company: normalizeCompany(normalized.company ?? ""),
            status: (normalized.status as ITInventory["status"]) ?? "Spare",
            assigneeName: normalized.assigneeName ?? "",
            assigneeId: "",
            location:
              (normalized.location as ITInventory["location"]) ?? "Unit 1 & 2",
            datePurchased: normalized.datePurchased ?? "",
            notes: normalized.notes ?? "",
          };
        });
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
    const invalid = rows.find((r) => !r.assetTag || !r.brand || !r.company);
    if (invalid) {
      setBulkError("Every row needs Asset Tag, Brand, and Company.");
      return;
    }

    setBulkLoading(true);
    setBulkError("");
    setBulkSuccess(0);
    try {
      // Sequential to avoid duplicate-asset-tag race conditions
      for (const r of rows) {
        const assignee = employees.find((e) => e.id === r.assigneeId);
        const assigneeName = r.assigneeName || assignee?.name || "";
        await addAsset({
          assetTag: r.assetTag,
          company: r.company,
          serialNumber: r.serialNumber,
          model: r.model,
          brand: r.brand,
          category: r.category,
          status: r.status,
          assigneeId: r.assigneeId,
          assigneeName,
          location: r.location,
          notes: r.notes,
          datePurchased: r.datePurchased,
        } as NewAssetInput);
      }
      setBulkSuccess(rows.length);
      setRows([EMPTY_ROW(1)]);
      onSuccess();
      setTimeout(onClose, 900);
    } catch (err: any) {
      setBulkError(err?.message ?? "Something went wrong. Please try again.");
    } finally {
      setBulkLoading(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_SINGLE);
    setError("");
    setRows([EMPTY_ROW(1)]);
    setBulkError("");
    setBulkSuccess(0);
    setParseWarnings([]);
    onClose();
  };

  if (!visible) return null;

  const cancelBtnStyle: React.CSSProperties = {
    padding: "7px 16px",
    fontSize: 13,
    borderRadius: 8,
    cursor: "pointer",
    border: `1px solid ${theme.border}`,
    backgroundColor: "transparent",
    color: theme.subtext,
  };
  const primaryBtnStyle: React.CSSProperties = {
    padding: "7px 18px",
    fontSize: 13,
    fontWeight: 600,
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    backgroundColor: theme.primary,
    color: theme.primaryText,
    opacity: loading || bulkLoading ? 0.6 : 1,
  };
  const cellInputStyle = (invalid = false): React.CSSProperties => ({
    width: "100%",
    padding: "0 8px",
    height: 32,
    fontSize: 12,
    borderRadius: 6,
    border: `1px solid ${invalid ? theme.dangerBorder : theme.inputBorder}`,
    backgroundColor: invalid ? theme.dangerBg : theme.inputBg,
    color: theme.inputText,
    outline: "none",
    boxSizing: "border-box",
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: theme.overlay }}
    >
      <div
        className="w-full flex flex-col"
        style={{
          backgroundColor: theme.surface,
          borderRadius: 16,
          maxHeight: "90vh",
          width: tab === "bulk" ? "min(95vw, 1100px)" : "min(95vw, 520px)",
          boxShadow: `0 20px 60px ${theme.shadow}`,
          border: `1px solid ${theme.border}`,
          transition: "width 0.2s ease",
        }}
      >
        <div
          className="flex items-start justify-between px-5 pt-5 pb-4"
          style={{ borderBottom: `1px solid ${theme.border}` }}
        >
          <div>
            <h2
              style={{
                fontSize: 17,
                fontWeight: 600,
                color: theme.text,
                margin: 0,
              }}
            >
              Add asset
            </h2>
            <p style={{ fontSize: 11, color: theme.subtext, marginTop: 2 }}>
              Fill in the details below to register a new asset
            </p>
          </div>
          <div className="flex items-center gap-3">
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

        {tab === "single" && (
          <>
            <div
              className="overflow-y-auto flex-1 px-5 py-4"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}
            >
              {error && (
                <div
                  style={{
                    backgroundColor: theme.dangerBg,
                    border: `1px solid ${theme.dangerBorder}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p
                    style={{ fontSize: 12, color: theme.dangerText, margin: 0 }}
                  >
                    ⚠ {error}
                  </p>
                </div>
              )}

              <Field label="Asset tag *">
                <ThemedInput
                  name="assetTag"
                  value={form.assetTag}
                  onChange={handleChange}
                  placeholder="e.g. OCG-DF-001"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Brand *">
                  <ThemedInput
                    name="brand"
                    value={form.brand}
                    onChange={handleChange}
                    placeholder="e.g. HP, Lenovo"
                  />
                </Field>
                <Field label="Model">
                  <ThemedInput
                    name="model"
                    value={form.model}
                    onChange={handleChange}
                    placeholder="e.g. ProBook 440 G6"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Serial number">
                  <ThemedInput
                    name="serialNumber"
                    value={form.serialNumber}
                    onChange={handleChange}
                    placeholder="Enter serial number"
                  />
                </Field>
                <Field label="Date purchased">
                  <input
                    name="datePurchased"
                    type="date"
                    value={form.datePurchased}
                    onChange={handleChange}
                    style={{
                      width: "100%",
                      padding: "0 10px",
                      height: 38,
                      fontSize: 13,
                      borderRadius: 8,
                      border: `1px solid ${theme.inputBorder}`,
                      backgroundColor: theme.inputBg,
                      color: theme.inputText,
                      outline: "none",
                      boxSizing: "border-box",
                      colorScheme: theme.mode === "dark" ? "dark" : "light",
                    }}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Company *">
                  <BadgeSelect
                    value={form.company}
                    displayName={form.company}
                    options={[{ label: "—", value: "" }, ...dropdownOptions.company]}
                    placeholder="Select company"
                    onChange={(val) => setForm((f) => ({ ...f, company: val }))}
                    className="w-full"
                  />
                </Field>
                <Field label="Category">
                  <BadgeSelect
                    value={form.category}
                    displayName={form.category}
                    options={[{ label: "—", value: "" }, ...dropdownOptions.category]}
                    placeholder="Select category"
                    onChange={(val) =>
                      setForm((f) => ({
                        ...f,
                        category: val as ITInventory["category"],
                      }))
                    }
                    className="w-full"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Location">
                  <BadgeSelect
                    value={form.location}
                    displayName={form.location}
                    options={[{ label: "—", value: "" }, ...dropdownOptions.location]}
                    placeholder="Select location"
                    onChange={(val) =>
                      setForm((f) => ({
                        ...f,
                        location: val as ITInventory["location"],
                      }))
                    }
                    className="w-full"
                  />
                </Field>
                <Field label="Status">
                  <BadgeSelect
                    value={form.status}
                    displayName={form.status}
                    options={[{ label: "—", value: "" }, ...dropdownOptions.status]}
                    placeholder="Select status"
                    onChange={(val) =>
                      setForm((f) => ({
                        ...f,
                        status: val as ITInventory["status"],
                      }))
                    }
                    className="w-full"
                  />
                </Field>
              </div>

              <Field label="Assignee">
                <select
                  value={form.assigneeId}
                  onChange={(e) => {
                    const id = e.target.value;
                    const emp = employees.find((x) => x.id === id);
                    setForm((f) => ({
                      ...f,
                      assigneeId: id,
                      assigneeName: emp?.name ?? "",
                    }));
                  }}
                  style={{
                    width: "100%",
                    padding: "0 10px",
                    height: 38,
                    fontSize: 13,
                    borderRadius: 8,
                    border: `1px solid ${theme.inputBorder}`,
                    backgroundColor: theme.inputBg,
                    color: theme.inputText,
                    outline: "none",
                  }}
                >
                  <option value="">Unassigned</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Notes">
                <ThemedTextarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  placeholder="Add any notes about this asset..."
                  rows={3}
                />
              </Field>
            </div>

            <div
              className="flex items-center justify-end gap-2 px-5 py-3"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <button onClick={handleClose} style={cancelBtnStyle}>
                Cancel
              </button>
              <button
                onClick={handleSingleSubmit}
                disabled={loading}
                style={primaryBtnStyle}
              >
                {loading ? "Saving…" : "Add asset"}
              </button>
            </div>
          </>
        )}

        {tab === "bulk" && (
          <>
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
                  Upload Excel / CSV
                </button>
                <a
                  href="data:text/csv;charset=utf-8,Asset Tag,Company,Serial Number,Model,Brand,Category,Status,Assignee,Location,Date Purchased,Notes%0AOCG-001,OCG,SN12345,ThinkPad X1,Lenovo,Laptop,Deployed,John Doe,Unit 1 & 2,2024-01-15,In working condition"
                  download="it_inventory_template.csv"
                  style={{
                    fontSize: 12,
                    color: theme.primary,
                    textDecoration: "none",
                  }}
                >
                  Download template
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

              {parseWarnings.length > 0 && (
                <div
                  style={{
                    marginTop: 10,
                    backgroundColor: theme.dangerBg,
                    border: `1px solid ${theme.dangerBorder}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: theme.dangerText,
                      margin: "0 0 4px",
                    }}
                  >
                    ⚠ Import warnings
                  </p>
                  {parseWarnings.slice(0, 5).map((w, i) => (
                    <p
                      key={i}
                      style={{
                        fontSize: 12,
                        color: theme.dangerText,
                        margin: 0,
                      }}
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
                    backgroundColor: theme.dangerBg,
                    border: `1px solid ${theme.dangerBorder}`,
                    borderRadius: 8,
                    padding: "8px 12px",
                  }}
                >
                  <p
                    style={{ fontSize: 12, color: theme.dangerText, margin: 0 }}
                  >
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
                    ✓ {bulkSuccess} asset{bulkSuccess > 1 ? "s" : ""} saved
                    successfully!
                  </p>
                </div>
              )}
            </div>

            <div className="overflow-auto flex-1 px-5 py-3">
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 900,
                }}
              >
                <thead>
                  <tr>
                    {[
                      "#",
                      "Asset Tag *",
                      "Company *",
                      "Serial #",
                      "Model",
                      "Brand *",
                      "Category",
                      "Status",
                      "Assignee",
                      "Location",
                      "Date",
                      "Notes",
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
                        <input
                          placeholder="OCG-001"
                          value={row.assetTag}
                          onChange={(e) =>
                            updateRow(row.id, "assetTag", e.target.value)
                          }
                          style={{
                            ...cellInputStyle(!row.assetTag),
                            width: 90,
                          }}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <ThemedSelect
                          value={row.company}
                          onChange={(e) =>
                            updateRow(row.id, "company", e.target.value)
                          }
                        >
                          <option value="">—</option>
                          {dropdownOptions.company.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </ThemedSelect>
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          placeholder="SN..."
                          value={row.serialNumber}
                          onChange={(e) =>
                            updateRow(row.id, "serialNumber", e.target.value)
                          }
                          style={{ ...cellInputStyle(), width: 90 }}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          placeholder="Model"
                          value={row.model}
                          onChange={(e) =>
                            updateRow(row.id, "model", e.target.value)
                          }
                          style={{ ...cellInputStyle(), width: 90 }}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          placeholder="Brand"
                          value={row.brand}
                          onChange={(e) =>
                            updateRow(row.id, "brand", e.target.value)
                          }
                          style={{ ...cellInputStyle(!row.brand), width: 80 }}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <ThemedSelect
                          value={row.category}
                          onChange={(e) =>
                            updateRow(row.id, "category", e.target.value)
                          }
                        >
                          {dropdownOptions.category.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </ThemedSelect>
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <ThemedSelect
                          value={row.status}
                          onChange={(e) =>
                            updateRow(row.id, "status", e.target.value)
                          }
                        >
                          {dropdownOptions.status.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </ThemedSelect>
                      </td>
                      <td style={{ padding: "4px 4px", width: 130 }}>
                        <AssigneeSearchSelect
                          value={row.assigneeId}
                          displayName={row.assigneeName}
                          options={employees.map((e) => ({
                            label: e.name,
                            value: e.id,
                          }))}
                          onChange={(id, label) => {
                            updateRow(row.id, "assigneeId", id);
                            updateRow(
                              row.id,
                              "assigneeName",
                              label === "—" ? "" : label,
                            );
                          }}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <ThemedSelect
                          value={row.location}
                          onChange={(e) =>
                            updateRow(row.id, "location", e.target.value)
                          }
                        >
                          {dropdownOptions.location.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </ThemedSelect>
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          type="date"
                          value={row.datePurchased}
                          onChange={(e) =>
                            updateRow(row.id, "datePurchased", e.target.value)
                          }
                          style={{
                            ...cellInputStyle(),
                            width: 128,
                            colorScheme:
                              theme.mode === "dark" ? "dark" : "light",
                          }}
                        />
                      </td>
                      <td style={{ padding: "4px 4px" }}>
                        <input
                          placeholder="Notes..."
                          value={row.notes}
                          onChange={(e) =>
                            updateRow(row.id, "notes", e.target.value)
                          }
                          style={{ ...cellInputStyle(), width: 110 }}
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
                + Add row
              </button>
            </div>

            <div
              className="flex items-center justify-between px-5 py-3"
              style={{ borderTop: `1px solid ${theme.border}` }}
            >
              <p style={{ fontSize: 11, color: theme.subtext, margin: 0 }}>
                {rows.length} row{rows.length !== 1 ? "s" : ""} · Required
                fields marked with *
              </p>
              <div className="flex gap-2">
                <button onClick={handleClose} style={cancelBtnStyle}>
                  Cancel
                </button>
                <button
                  onClick={handleBulkSubmit}
                  disabled={bulkLoading}
                  style={primaryBtnStyle}
                >
                  {bulkLoading
                    ? "Saving…"
                    : `Save ${rows.length} asset${rows.length !== 1 ? "s" : ""}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AddAssetModal;
