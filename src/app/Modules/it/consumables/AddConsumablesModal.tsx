import React, { useState } from "react";
import { ITConsumable } from "../../../../../types";
import { addConsumable } from "../../../../services/consumableService";
import { useTheme } from "../../../../theme/ThemeContext"; // adjust path to match your project
import AsyncStorage from "@react-native-async-storage/async-storage";
import { logAuditBatch } from "../../../../services/auditlogs";

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const EMPTY_FORM = {
  name:           "",
  model:          "",
  status:         "Spare" as ITConsumable["status"],
  location:       "Unit 1 & 2" as ITConsumable["location"],
  ipAddress:      "",
  macAddress:     "",
  black:          0,
  photoBlack:     0,
  cyan:           0,
  magenta:        0,
  yellow:         0,
  maintenanceBox: 0,
};

const INK_FIELDS: { key: keyof typeof EMPTY_FORM; label: string; swatch: string }[] = [
  { key: "black",          label: "Black",           swatch: "#1f2937" },
  { key: "photoBlack",     label: "Photo Black",     swatch: "#374151" },
  { key: "cyan",           label: "Cyan",            swatch: "#0891b2" },
  { key: "magenta",        label: "Magenta",         swatch: "#db2777" },
  { key: "yellow",         label: "Yellow",          swatch: "#ca8a04" },
  { key: "maintenanceBox", label: "Maintenance Box", swatch: "#7c3aed" },
];

const AddConsumableModal: React.FC<Props> = ({ visible, onClose, onSuccess }) => {
  const { theme } = useTheme();
  const [form, setForm]       = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const val = e.target.type === "number"
      ? Math.max(0, Number(e.target.value))
      : e.target.value;
    setForm({ ...form, [e.target.name]: val });
  };

  const handleSubmit = async () => {
    if (!form.name) {
      setError("Printer Name is required.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await addConsumable(form);

      // Resolve current user, same pattern as the asset modals
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

      // Log creation — a logging failure here shouldn't surface as
      // "add failed" to the user, since the consumable was already saved.
      try {
        const fields: Record<string, string> = {
          model:          form.model,
          status:         form.status,
          location:       form.location,
          ipAddress:      form.ipAddress,
          macAddress:     form.macAddress,
          black:          String(form.black),
          photoBlack:     String(form.photoBlack),
          cyan:           String(form.cyan),
          magenta:        String(form.magenta),
          yellow:         String(form.yellow),
          maintenanceBox: String(form.maintenanceBox),
        };

        await logAuditBatch({
          table: "consumables",
          recordId: form.model || form.name,
          recordLabel: form.name || form.model,
          changedBy,
          changedById,
          changes: [
            { field: "name", oldValue: "", newValue: "Created" },
            ...Object.entries(fields)
              .filter(([, value]) => value !== "" && value !== "0")
              .map(([field, value]) => ({ field, oldValue: "", newValue: value })),
          ],
        });
      } catch {}

      setForm(EMPTY_FORM);
      onSuccess();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setForm(EMPTY_FORM);
    setError("");
    onClose();
  };

  if (!visible) return null;

  // Push theme colors into CSS vars so static Tailwind classes can stay dynamic
  const themeVars = {
    "--t-surface":          theme.surface,
    "--t-overlay":          theme.overlay,
    "--t-text":             theme.text,
    "--t-subtext":          theme.subtext,
    "--t-border":            theme.border,
    "--t-danger-bg":        theme.dangerBg,
    "--t-danger-text":      theme.dangerText,
    "--t-input-bg":         theme.inputBg,
    "--t-input-border":     theme.inputBorder,
    "--t-input-border-focus": theme.inputBorderFocus,
    "--t-input-text":       theme.inputText,
    "--t-input-placeholder": theme.inputPlaceholder,
    "--t-primary":          theme.primary,
    "--t-primary-hover":    theme.primaryHover,
    "--t-primary-text":     theme.primaryText,
    "--t-primary-disabled": theme.primaryDisabled,
    "--t-bg-hover":         theme.bgHover,
  } as React.CSSProperties;

  return (
    <div
      style={themeVars}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--t-overlay)]"
    >
      <div className="bg-[var(--t-surface)] rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-[var(--t-text)]">Add Printer</h2>
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
          <input
            name="name"
            placeholder="Printer Name *"
            value={form.name}
            onChange={handleChange}
            className={inputClass}
          />
          <input
            name="model"
            placeholder="Model Number"
            value={form.model}
            onChange={handleChange}
            className={inputClass}
          />
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
          <input
            name="ipAddress"
            placeholder="IP Address (e.g. 192.168.1.100)"
            value={form.ipAddress}
            onChange={handleChange}
            className={inputClass}
          />
          <input
            name="macAddress"
            placeholder="MAC Address (e.g. AA:BB:CC:DD:EE:FF)"
            value={form.macAddress}
            onChange={handleChange}
            className={inputClass}
          />

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
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={handleClose} className={cancelBtn}>Cancel</button>
          <button onClick={handleSubmit} disabled={loading} className={primaryBtn}>
            {loading ? "Saving..." : "Add Printer"}
          </button>
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

export default AddConsumableModal;