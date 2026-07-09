import React, { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ITConsumable } from "../../../../../types";
import { updateConsumable } from "../../../../services/consumableService";
import { logAuditBatch } from "../../../../services/auditlogs";
import { useTheme } from "../../../../theme/ThemeContext"; // adjust path to match your project

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  selectedItem: ITConsumable | null;
  onDelete: (serial: string) => void;
}

const EMPTY_FORM = {
  model: "",
  name: "",
  status: "Spare" as ITConsumable["status"],
  location: "Unit 1 & 2" as ITConsumable["location"],
  ipAddress: "",
  macAddress: "",
  black: 0,
  photoBlack: 0,
  cyan: 0,
  magenta: 0,
  yellow: 0,
  maintenanceBox: 0,
};

const INK_FIELDS: {
  key: keyof typeof EMPTY_FORM;
  label: string;
  swatch: string;
}[] = [
  { key: "black", label: "Black", swatch: "#1f2937" },
  { key: "photoBlack", label: "Photo Black", swatch: "#374151" },
  { key: "cyan", label: "Cyan", swatch: "#0891b2" },
  { key: "magenta", label: "Magenta", swatch: "#db2777" },
  { key: "yellow", label: "Yellow", swatch: "#ca8a04" },
  { key: "maintenanceBox", label: "Maintenance Box", swatch: "#7c3aed" },
];

const EditConsumableModal: React.FC<Props> = ({
  visible,
  onClose,
  onSuccess,
  selectedItem,
  onDelete,
}) => {
  const { theme } = useTheme();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedItem) {
      setForm({
        model: selectedItem.model,
        name: selectedItem.name,
        status: selectedItem.status ?? "Spare",
        location: selectedItem.location,
        ipAddress: selectedItem.ipAddress ?? "",
        macAddress: selectedItem.macAddress ?? "",
        black: selectedItem.black ?? 0,
        photoBlack: selectedItem.photoBlack ?? 0,
        cyan: selectedItem.cyan ?? 0,
        magenta: selectedItem.magenta ?? 0,
        yellow: selectedItem.yellow ?? 0,
        maintenanceBox: selectedItem.maintenanceBox ?? 0,
      });
    }
    setError("");
    setConfirmDel(false);
  }, [selectedItem, visible]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    const val =
      e.target.type === "number"
        ? Math.max(0, Number(e.target.value))
        : e.target.value;
    setForm({ ...form, [e.target.name]: val });
  };

  const handleSubmit = async () => {
    if (!form.name) {
      setError("Printer Name is required.");
      return;
    }
    if (!form.model) {
      setError("Model is required.");
      return;
    }
    if (!selectedItem) return;
    setLoading(true);
    setError("");

    try {
      let changedBy = "Unknown";
      let changedById = "";
      try {
        const saved = await AsyncStorage.getItem("AD_USER_DATA");
        if (saved) {
          const user = JSON.parse(saved);
          changedBy = user.displayName ?? "Unknown";
          changedById = user.username ?? "";
        }
      } catch {}

      const original: Record<keyof typeof form, string | number> = {
        model: selectedItem.model,
        name: selectedItem.name,
        status: selectedItem.status ?? "Spare",
        location: selectedItem.location,
        ipAddress: selectedItem.ipAddress ?? "",
        macAddress: selectedItem.macAddress ?? "",
        black: selectedItem.black ?? 0,
        photoBlack: selectedItem.photoBlack ?? 0,
        cyan: selectedItem.cyan ?? 0,
        magenta: selectedItem.magenta ?? 0,
        yellow: selectedItem.yellow ?? 0,
        maintenanceBox: selectedItem.maintenanceBox ?? 0,
      };

      const changedFields = (Object.keys(form) as (keyof typeof form)[]).filter(
        (key) => form[key] !== original[key],
      );

      if (changedFields.length === 0) {
        onClose();
        return;
      }

      const payload: Partial<typeof form> = {};
      changedFields.forEach((field) => {
        payload[field] = form[field] as any;
      });

      // Always look up the existing doc by its ORIGINAL model — even if the
      // user just changed it in this same save — since that's still the
      // current key for the record until/unless the service does a real rename.
      await updateConsumable(selectedItem.model, payload);

      await logAuditBatch({
        table: "consumables",
        recordId: selectedItem.model,
        recordLabel: selectedItem.name || selectedItem.model,
        changedBy,
        changedById,
        changes: changedFields.map((field) => ({
          field,
          oldValue: String(original[field] ?? ""),
          newValue: String(form[field] ?? ""),
        })),
      });

      onSuccess();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedItem) return;
    if (!confirmDel) {
      setConfirmDel(true);
      return;
    }
    setDeleting(true);

    try {
      // Resolve current user, same pattern as handleSubmit
      let changedBy = "Unknown";
      let changedById = "";
      try {
        const saved = await AsyncStorage.getItem("AD_USER_DATA");
        if (saved) {
          const user = JSON.parse(saved);
          changedBy = user.displayName ?? "Unknown";
          changedById = user.username ?? "";
        }
      } catch {}

      // Snapshot fields before the item is gone, so the audit trail
      // still shows what was deleted, not just that something was.
      const snapshot: Record<string, string> = {
        name: selectedItem.name ?? "",
        status: selectedItem.status ?? "",
        location: selectedItem.location ?? "",
        ipAddress: selectedItem.ipAddress ?? "",
        macAddress: selectedItem.macAddress ?? "",
        black: String(selectedItem.black ?? 0),
        photoBlack: String(selectedItem.photoBlack ?? 0),
        cyan: String(selectedItem.cyan ?? 0),
        magenta: String(selectedItem.magenta ?? 0),
        yellow: String(selectedItem.yellow ?? 0),
        maintenanceBox: String(selectedItem.maintenanceBox ?? 0),
      };

      await onDelete(selectedItem.model);

      // Log the deletion after it succeeds — a logging failure here
      // shouldn't surface as "delete failed" to the user.
      try {
        await logAuditBatch({
          table: "consumables",
          recordId: selectedItem.model,
          recordLabel: selectedItem.name || selectedItem.model,
          changedBy,
          changedById,
          changes: [
            { field: "name", oldValue: snapshot.name, newValue: "Deleted" },
            ...Object.entries(snapshot)
              .filter(
                ([field, value]) =>
                  field !== "name" && value !== "" && value !== "0",
              )
              .map(([field, value]) => ({
                field,
                oldValue: value,
                newValue: "",
              })),
          ],
        });
      } catch {}

      onClose();
    } catch {
      setError("Failed to delete printer. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const handleClose = () => {
    setError("");
    setConfirmDel(false);
    onClose();
  };

  if (!visible || !selectedItem) return null;

  // Push theme colors into CSS vars so static Tailwind classes can stay dynamic
  const themeVars = {
    "--t-surface": theme.surface,
    "--t-overlay": theme.overlay,
    "--t-text": theme.text,
    "--t-subtext": theme.subtext,
    "--t-border": theme.border,
    "--t-danger-bg": theme.dangerBg,
    "--t-danger-border": theme.dangerBorder,
    "--t-danger-text": theme.dangerText,
    "--t-danger-icon": theme.dangerIcon,
    "--t-input-bg": theme.inputBg,
    "--t-input-border": theme.inputBorder,
    "--t-input-border-focus": theme.inputBorderFocus,
    "--t-input-text": theme.inputText,
    "--t-input-placeholder": theme.inputPlaceholder,
    "--t-primary": theme.primary,
    "--t-primary-hover": theme.primaryHover,
    "--t-primary-text": theme.primaryText,
    "--t-primary-disabled": theme.primaryDisabled,
    "--t-bg-hover": theme.bgHover,
    "--t-text-inverse": theme.textInverse,
  } as React.CSSProperties;

  return (
    <div
      style={themeVars}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--t-overlay)]"
    >
      <div className="bg-[var(--t-surface)] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold text-[var(--t-text)]">
              Edit Printer
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="text-[var(--t-subtext)] hover:text-[var(--t-text)] text-xl font-bold"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="text-[var(--t-danger-text)] text-sm mb-4 bg-[var(--t-danger-bg)] px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--t-text)]">
              Printer Name
            </label>
            <input
              name="name"
              placeholder="Printer Name *"
              value={form.name}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--t-text)]">
              Model
            </label>
            <input
              name="model"
              placeholder="Model *"
              value={form.model}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--t-text)]">
              Status
            </label>
            <select
              name="status"
              value={form.status}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="Spare">Spare</option>
              <option value="Deployed">Deployed</option>
              <option value="Defective">Defective</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--t-text)]">
              Location
            </label>
            <select
              name="location"
              value={form.location}
              onChange={handleChange}
              className={inputClass}
            >
              <option value="Unit 1 & 2">Unit 1 & 2</option>
              <option value="Unit 3">Unit 3</option>
              <option value="BDO Makati">BDO Makati</option>
              <option value="Triumph">Triumph</option>
              <option value="WFH">WFH</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--t-text)]">
              IP Address
            </label>
            <input
              name="ipAddress"
              placeholder="e.g. 192.168.1.100"
              value={form.ipAddress}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1 text-[var(--t-text)]">
              MAC Address
            </label>
            <input
              name="macAddress"
              placeholder="e.g. AA:BB:CC:DD:EE:FF"
              value={form.macAddress}
              onChange={handleChange}
              className={inputClass}
            />
          </div>

          {/* Ink stock fields */}
          <div className="border-t border-[var(--t-border)] pt-3 mt-1">
            <p className="text-xs font-semibold text-[var(--t-subtext)] uppercase tracking-wide mb-3">
              Ink & Consumable Stock
            </p>
            <div className="grid grid-cols-2 gap-3">
              {INK_FIELDS.map(({ key, label, swatch }) => (
                <div key={key}>
                  <label className="flex items-center gap-1.5 text-xs font-medium mb-1 text-[var(--t-text)]">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: swatch }}
                    />
                    {label}
                  </label>
                  <input
                    name={key}
                    type="number"
                    min={0}
                    placeholder="0"
                    value={form[key] as number}
                    onChange={handleChange}
                    className={inputClass}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between mt-6">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                confirmDel
                  ? "bg-[var(--t-danger-icon)] text-[var(--t-text-inverse)] hover:opacity-90"
                  : "text-[var(--t-danger-text)] bg-[var(--t-danger-bg)] hover:opacity-80 border border-[var(--t-danger-border)]"
              }`}
            >
              {deleting
                ? "Deleting..."
                : confirmDel
                  ? "Confirm Delete"
                  : "Delete"}
            </button>
            {confirmDel && (
              <button
                onClick={() => setConfirmDel(false)}
                className="text-xs text-[var(--t-subtext)] hover:text-[var(--t-text)]"
              >
                Cancel
              </button>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={handleClose} className={cancelBtn}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className={primaryBtn}
            >
              {loading ? "Saving..." : "Update"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const inputClass =
  "w-full px-3 py-2.5 text-sm bg-[var(--t-input-bg)] text-[var(--t-input-text)] " +
  "placeholder:text-[var(--t-input-placeholder)] border border-[var(--t-input-border)] " +
  "rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--t-input-border-focus)] focus:border-transparent";

const cancelBtn =
  "px-5 py-2 text-sm font-medium text-[var(--t-subtext)] bg-[var(--t-surface)] " +
  "border border-[var(--t-border)] rounded-lg hover:bg-[var(--t-bg-hover)] transition-colors";

const primaryBtn =
  "px-5 py-2 text-sm font-medium text-[var(--t-primary-text)] bg-[var(--t-primary)] " +
  "rounded-lg hover:bg-[var(--t-primary-hover)] disabled:bg-[var(--t-primary-disabled)] " +
  "disabled:cursor-not-allowed transition-colors";

export default EditConsumableModal;
