import React, { useEffect, useState } from "react";
import { ADUser, EditAssetInput, ITInventory } from "../../../../../types";
import BadgeSelect from "../../../../components/common/BadgeSelect";
import { updateAsset } from "../../../../services/itInventory";
import { logAuditBatch } from "../../../../services/auditlogs";
import { useTheme } from "../../../../theme/ThemeContext";
import { DropdownOption } from "../../../../services/dropdownConfigs";

export type Employee = { id: string; name: string };

interface Props {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onDelete: (assetTag: string) => Promise<void>;
  selectedAsset: ITInventory | null;
  employees: Employee[];
  user: ADUser;
  dropdownOptions: {
    category: DropdownOption[];
    status: DropdownOption[];
    company: DropdownOption[];
    location: DropdownOption[];
  };
}

const EMPTY_FORM = {
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

const ThemedInput: React.FC<{
  name: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}> = ({ name, value, onChange, placeholder, type = "text" }) => {
  const { theme } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <input
      name={name}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        padding: "0 10px",
        height: 38,
        fontSize: 13,
        borderRadius: 8,
        border: `1px solid ${focused ? theme.inputBorderFocus : theme.inputBorder}`,
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
  const [focused, setFocused] = useState(false);
  return (
    <textarea
      name={name}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: "100%",
        padding: "8px 10px",
        fontSize: 13,
        borderRadius: 8,
        border: `1px solid ${focused ? theme.inputBorderFocus : theme.inputBorder}`,
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

const EditAssetModal: React.FC<Props> = ({
  visible,
  onClose,
  onSuccess,
  onDelete,
  selectedAsset,
  employees,
  user,
  dropdownOptions,
}) => {
  const { theme } = useTheme();
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (selectedAsset) {
      setForm({
        company: selectedAsset.company,
        serialNumber: selectedAsset.serialNumber,
        model: selectedAsset.model,
        brand: selectedAsset.brand,
        status: selectedAsset.status,
        assigneeId: selectedAsset.assigneeId,
        assigneeName: selectedAsset.assigneeName,
        category: selectedAsset.category,
        location: selectedAsset.location,
        datePurchased: selectedAsset.datePurchased
          ? selectedAsset.datePurchased.slice(0, 10)
          : "",
        notes: selectedAsset.notes,
      });
    }
    setError("");
    setConfirmDelete(false);
  }, [selectedAsset, visible]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async () => {
    if (!form.company || !form.brand) {
      setError("Company and Brand are required.");
      return;
    }
    if (!selectedAsset) return;

    setLoading(true);
    setError("");

    try {
      const original: Record<string, string> = {
        company: selectedAsset.company ?? "",
        serialNumber: selectedAsset.serialNumber ?? "",
        model: selectedAsset.model ?? "",
        brand: selectedAsset.brand ?? "",
        status: selectedAsset.status ?? "",
        assigneeId: selectedAsset.assigneeId ?? "",
        assigneeName: selectedAsset.assigneeName ?? "",
        category: selectedAsset.category ?? "",
        location: selectedAsset.location ?? "",
        notes: selectedAsset.notes ?? "",
        datePurchased: selectedAsset.datePurchased
          ? selectedAsset.datePurchased.slice(0, 10)
          : "",
      };

      const changed: Record<string, string> = {};
      (Object.keys(form) as (keyof typeof form)[]).forEach((key) => {
        if ((form[key] ?? "") !== (original[key] ?? ""))
          changed[key] = form[key] as string;
      });

      if (Object.keys(changed).length === 0) {
        onClose();
        return;
      }

      await updateAsset(
        selectedAsset.assetTag,
        changed as Partial<EditAssetInput>,
      );

      await logAuditBatch({
        table: "inventory",
        recordId: selectedAsset.assetTag,
        recordLabel: selectedAsset.assetTag,
        changes: Object.keys(changed).map((field) => ({
          field,
          oldValue: original[field] ?? "",
          newValue: changed[field] ?? "",
        })),
        changedBy: user.displayName,
        changedById: user.username,
      });

      onSuccess();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    handleConfirmDelete();
  };

  const handleConfirmDelete = async () => {
    if (!selectedAsset) return;
    setDeleting(true);
    try {
      await onDelete(selectedAsset.assetTag);
      onClose();
    } catch {
      setError("Failed to delete asset. Please try again.");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const handleClose = () => {
    setError("");
    setConfirmDelete(false);
    onClose();
  };

  if (!visible || !selectedAsset) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: theme.overlay }}
    >
      <div
        className="w-full max-w-lg flex flex-col"
        style={{
          backgroundColor: theme.surface,
          borderRadius: 16,
          maxHeight: "90vh",
          boxShadow: `0 20px 60px ${theme.shadow}`,
          border: `1px solid ${theme.border}`,
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
              Edit asset
            </h2>
            <p style={{ fontSize: 11, color: theme.subtext, marginTop: 2 }}>
              Asset tag: {selectedAsset.assetTag}
            </p>
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
              <p style={{ fontSize: 12, color: theme.dangerText, margin: 0 }}>
                ⚠ {error}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Serial number">
              <ThemedInput
                name="serialNumber"
                value={form.serialNumber}
                onChange={handleChange}
                placeholder="Enter serial number"
              />
            </Field>
            <Field label="Model">
              <ThemedInput
                name="model"
                value={form.model}
                onChange={handleChange}
                placeholder="Model"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand">
              <ThemedInput
                name="brand"
                value={form.brand}
                onChange={handleChange}
                placeholder="Brand *"
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
            <Field label="Company">
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
          className="flex items-center justify-between px-5 py-3"
          style={{ borderTop: `1px solid ${theme.border}` }}
        >
          <button
            onClick={handleDeleteClick}
            disabled={deleting || loading}
            style={{
              padding: "7px 14px",
              fontSize: 13,
              fontWeight: 500,
              borderRadius: 8,
              cursor: "pointer",
              border: `1px solid ${theme.dangerBorder}`,
              backgroundColor: confirmDelete ? theme.dangerBg : "transparent",
              color: theme.dangerText,
              opacity: deleting || loading ? 0.6 : 1,
            }}
          >
            {deleting
              ? "Deleting…"
              : confirmDelete
                ? "Confirm delete"
                : "Delete asset"}
          </button>

          <div className="flex gap-2">
            {confirmDelete ? (
              <button
                onClick={() => setConfirmDelete(false)}
                style={{
                  padding: "7px 16px",
                  fontSize: 13,
                  borderRadius: 8,
                  cursor: "pointer",
                  border: `1px solid ${theme.border}`,
                  backgroundColor: "transparent",
                  color: theme.subtext,
                }}
              >
                Cancel
              </button>
            ) : (
              <>
                <button
                  onClick={handleClose}
                  style={{
                    padding: "7px 16px",
                    fontSize: 13,
                    borderRadius: 8,
                    cursor: "pointer",
                    border: `1px solid ${theme.border}`,
                    backgroundColor: "transparent",
                    color: theme.subtext,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  style={{
                    padding: "7px 18px",
                    fontSize: 13,
                    fontWeight: 600,
                    borderRadius: 8,
                    cursor: "pointer",
                    border: "none",
                    backgroundColor: theme.primary,
                    color: theme.primaryText,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? "Saving…" : "Update asset"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditAssetModal;
