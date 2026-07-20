import React, { useEffect, useState } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import { saveDropdownOptions } from "../../../services/dropdownConfigs";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DropdownOption = {
  label: string;
  value: string;
  bgColor: string;
  textColor: string;
  /**
   * Tailwind badge class string, kept only for backward-compat with any
   * component still reading it directly. Superadmin-added/edited options
   * render from bgColor/textColor as inline styles instead, since they
   * can be any color and can't map onto a fixed set of Tailwind classes.
   */
  badgeClass?: string;
};

export type ColumnConfig = {
  id: string; // short key: "status", "category", etc.
  module: string; // MySQL dropdown_configs module key, e.g. "inventory", "ticket", "consumable"
  field: string; // MySQL dropdown_configs field key, e.g. "status", "category"
  label: string;
  editable: boolean;
  options: DropdownOption[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  columns: ColumnConfig[];
  onSave: (columns: ColumnConfig[]) => void;
};

// ─── Tailwind color presets for badge options ─────────────────────────────────

const COLOR_PRESETS = [
  // Green
  {
    bg: "bg-green-600",
    text: "text-white",
    bgHex: "#16a34a",
    textHex: "#ffffff",
    label: "Green",
  },
  {
    bg: "bg-green-700",
    text: "text-white",
    bgHex: "#15803d",
    textHex: "#ffffff",
    label: "Green 700",
  },
  {
    bg: "bg-green-800",
    text: "text-white",
    bgHex: "#166534",
    textHex: "#ffffff",
    label: "Green 800",
  },

  // Orange
  {
    bg: "bg-orange-600",
    text: "text-white",
    bgHex: "#ea580c",
    textHex: "#ffffff",
    label: "Orange",
  },
  {
    bg: "bg-orange-700",
    text: "text-white",
    bgHex: "#c2410c",
    textHex: "#ffffff",
    label: "Orange 700",
  },
  {
    bg: "bg-orange-800",
    text: "text-white",
    bgHex: "#9a3412",
    textHex: "#ffffff",
    label: "Orange 800",
  },

  // Blue
  {
    bg: "bg-blue-600",
    text: "text-white",
    bgHex: "#2563eb",
    textHex: "#ffffff",
    label: "Blue",
  },
  {
    bg: "bg-blue-700",
    text: "text-white",
    bgHex: "#1d4ed8",
    textHex: "#ffffff",
    label: "Blue 700",
  },
  {
    bg: "bg-blue-800",
    text: "text-white",
    bgHex: "#1e40af",
    textHex: "#ffffff",
    label: "Blue 800",
  },
  {
    bg: "bg-blue-900",
    text: "text-white",
    bgHex: "#1e3a8a",
    textHex: "#ffffff",
    label: "Blue 900",
  },

  // Cyan
  {
    bg: "bg-cyan-600",
    text: "text-white",
    bgHex: "#0891b2",
    textHex: "#ffffff",
    label: "Cyan",
  },
  {
    bg: "bg-cyan-700",
    text: "text-white",
    bgHex: "#0e7490",
    textHex: "#ffffff",
    label: "Cyan 700",
  },
  {
    bg: "bg-cyan-800",
    text: "text-white",
    bgHex: "#155e75",
    textHex: "#ffffff",
    label: "Cyan 800",
  },
  {
    bg: "bg-cyan-900",
    text: "text-white",
    bgHex: "#164e63",
    textHex: "#ffffff",
    label: "Cyan 900",
  },

  // Red
  {
    bg: "bg-red-600",
    text: "text-white",
    bgHex: "#dc2626",
    textHex: "#ffffff",
    label: "Red",
  },
  {
    bg: "bg-red-700",
    text: "text-white",
    bgHex: "#b91c1c",
    textHex: "#ffffff",
    label: "Red 700",
  },
  {
    bg: "bg-red-800",
    text: "text-white",
    bgHex: "#991b1b",
    textHex: "#ffffff",
    label: "Red 800",
  },
  {
    bg: "bg-red-900",
    text: "text-white",
    bgHex: "#7f1d1d",
    textHex: "#ffffff",
    label: "Red 900",
  },

  // Purple
  {
    bg: "bg-purple-600",
    text: "text-white",
    bgHex: "#9333ea",
    textHex: "#ffffff",
    label: "Purple",
  },
  {
    bg: "bg-purple-700",
    text: "text-white",
    bgHex: "#7e22ce",
    textHex: "#ffffff",
    label: "Purple 700",
  },
  {
    bg: "bg-purple-800",
    text: "text-white",
    bgHex: "#6b21a8",
    textHex: "#ffffff",
    label: "Purple 800",
  },
  {
    bg: "bg-purple-900",
    text: "text-white",
    bgHex: "#581c87",
    textHex: "#ffffff",
    label: "Purple 900",
  },

  // Amber
  {
    bg: "bg-amber-700",
    text: "text-white",
    bgHex: "#b45309",
    textHex: "#ffffff",
    label: "Amber 700",
  },
  {
    bg: "bg-amber-800",
    text: "text-white",
    bgHex: "#92400e",
    textHex: "#ffffff",
    label: "Amber 800",
  },
  {
    bg: "bg-amber-900",
    text: "text-white",
    bgHex: "#78350f",
    textHex: "#ffffff",
    label: "Amber 900",
  },

  // Teal
  {
    bg: "bg-teal-600",
    text: "text-white",
    bgHex: "#0d9488",
    textHex: "#ffffff",
    label: "Teal",
  },
  {
    bg: "bg-teal-700",
    text: "text-white",
    bgHex: "#0f766e",
    textHex: "#ffffff",
    label: "Teal 700",
  },
  {
    bg: "bg-teal-800",
    text: "text-white",
    bgHex: "#115e59",
    textHex: "#ffffff",
    label: "Teal 800",
  },
  {
    bg: "bg-teal-900",
    text: "text-white",
    bgHex: "#134e4a",
    textHex: "#ffffff",
    label: "Teal 900",
  },

  // Pink
  {
    bg: "bg-pink-600",
    text: "text-white",
    bgHex: "#db2777",
    textHex: "#ffffff",
    label: "Pink",
  },
  {
    bg: "bg-pink-700",
    text: "text-white",
    bgHex: "#be185d",
    textHex: "#ffffff",
    label: "Pink 700",
  },
  {
    bg: "bg-pink-800",
    text: "text-white",
    bgHex: "#9d174d",
    textHex: "#ffffff",
    label: "Pink 800",
  },
  {
    bg: "bg-pink-900",
    text: "text-white",
    bgHex: "#831843",
    textHex: "#ffffff",
    label: "Pink 900",
  },

  // Indigo
  {
    bg: "bg-indigo-600",
    text: "text-white",
    bgHex: "#4f46e5",
    textHex: "#ffffff",
    label: "Indigo",
  },
  {
    bg: "bg-indigo-700",
    text: "text-white",
    bgHex: "#4338ca",
    textHex: "#ffffff",
    label: "Indigo 700",
  },
  {
    bg: "bg-indigo-800",
    text: "text-white",
    bgHex: "#3730a3",
    textHex: "#ffffff",
    label: "Indigo 800",
  },
  {
    bg: "bg-indigo-900",
    text: "text-white",
    bgHex: "#312e81",
    textHex: "#ffffff",
    label: "Indigo 900",
  },

  // Violet
  {
    bg: "bg-violet-600",
    text: "text-white",
    bgHex: "#7c3aed",
    textHex: "#ffffff",
    label: "Violet",
  },
  {
    bg: "bg-violet-700",
    text: "text-white",
    bgHex: "#6d28d9",
    textHex: "#ffffff",
    label: "Violet 700",
  },
  {
    bg: "bg-violet-800",
    text: "text-white",
    bgHex: "#5b21b6",
    textHex: "#ffffff",
    label: "Violet 800",
  },
  {
    bg: "bg-violet-900",
    text: "text-white",
    bgHex: "#4c1d95",
    textHex: "#ffffff",
    label: "Violet 900",
  },

  // Gray
  {
    bg: "bg-gray-500",
    text: "text-white",
    bgHex: "#6b7280",
    textHex: "#ffffff",
    label: "Gray",
  },
  {
    bg: "bg-gray-600",
    text: "text-white",
    bgHex: "#4b5563",
    textHex: "#ffffff",
    label: "Gray 600",
  },
  {
    bg: "bg-gray-700",
    text: "text-white",
    bgHex: "#374151",
    textHex: "#ffffff",
    label: "Gray 700",
  },
  {
    bg: "bg-gray-800",
    text: "text-white",
    bgHex: "#1f2937",
    textHex: "#ffffff",
    label: "Gray 800",
  },

  // New colors
  {
    bg: "bg-rose-600",
    text: "text-white",
    bgHex: "#e11d48",
    textHex: "#ffffff",
    label: "Rose",
  },
  {
    bg: "bg-rose-700",
    text: "text-white",
    bgHex: "#be123c",
    textHex: "#ffffff",
    label: "Rose 700",
  },
  {
    bg: "bg-rose-800",
    text: "text-white",
    bgHex: "#9f1239",
    textHex: "#ffffff",
    label: "Rose 800",
  },

  {
    bg: "bg-emerald-600",
    text: "text-white",
    bgHex: "#059669",
    textHex: "#ffffff",
    label: "Emerald",
  },
  {
    bg: "bg-emerald-700",
    text: "text-white",
    bgHex: "#047857",
    textHex: "#ffffff",
    label: "Emerald 700",
  },
  {
    bg: "bg-emerald-800",
    text: "text-white",
    bgHex: "#065f46",
    textHex: "#ffffff",
    label: "Emerald 800",
  },

  {
    bg: "bg-sky-600",
    text: "text-white",
    bgHex: "#0284c7",
    textHex: "#ffffff",
    label: "Sky",
  },
  {
    bg: "bg-sky-700",
    text: "text-white",
    bgHex: "#0369a1",
    textHex: "#ffffff",
    label: "Sky 700",
  },
  {
    bg: "bg-sky-800",
    text: "text-white",
    bgHex: "#075985",
    textHex: "#ffffff",
    label: "Sky 800",
  },

  {
    bg: "bg-fuchsia-600",
    text: "text-white",
    bgHex: "#c026d3",
    textHex: "#ffffff",
    label: "Fuchsia",
  },
  {
    bg: "bg-fuchsia-700",
    text: "text-white",
    bgHex: "#a21caf",
    textHex: "#ffffff",
    label: "Fuchsia 700",
  },
  {
    bg: "bg-fuchsia-800",
    text: "text-white",
    bgHex: "#86198f",
    textHex: "#ffffff",
    label: "Fuchsia 800",
  },

  {
    bg: "bg-slate-600",
    text: "text-white",
    bgHex: "#475569",
    textHex: "#ffffff",
    label: "Slate",
  },
  {
    bg: "bg-slate-700",
    text: "text-white",
    bgHex: "#334155",
    textHex: "#ffffff",
    label: "Slate 700",
  },
  {
    bg: "bg-slate-800",
    text: "text-white",
    bgHex: "#1e293b",
    textHex: "#ffffff",
    label: "Slate 800",
  },
];
const BASE_BADGE =
  "inline-flex justify-center px-2 py-1 rounded-lg text-sm font-medium";

function makeBadgeClass(
  bg: string,
  text: string,
  minW: string = "min-w-[90px]",
): string {
  return `${bg} ${text} ${BASE_BADGE} ${minW}`;
}

// The dropdown service auto-prepends a virtual "no value" option
// (value: "") to every list it returns so selects can be cleared.
// It's never actually stored — re-applied fresh on every read — so
// it has no business showing up here as something an admin can
// rename, recolor, or delete. Strip it the moment columns come in.
function stripAutoOption(cols: ColumnConfig[]): ColumnConfig[] {
  return cols.map((col) => ({
    ...col,
    options: col.options.filter((opt) => opt.value !== ""),
  }));
}

// ─── Component ────────────────────────────────────────────────────────────────

const GripIcon = ({ color }: { color: string }) => (
  <svg width="10" height="16" viewBox="0 0 10 16" fill={color}>
    <circle cx="2" cy="2" r="1.3" />
    <circle cx="8" cy="2" r="1.3" />
    <circle cx="2" cy="8" r="1.3" />
    <circle cx="8" cy="8" r="1.3" />
    <circle cx="2" cy="14" r="1.3" />
    <circle cx="8" cy="14" r="1.3" />
  </svg>
);

const ManageColumnsModal: React.FC<Props> = ({
  visible,
  onClose,
  columns,
  onSave,
}) => {
  const { theme } = useTheme();
  const [localCols, setLocalCols] = useState<ColumnConfig[]>(
    stripAutoOption(JSON.parse(JSON.stringify(columns))),
  );
  const [activeColId, setActiveColId] = useState(
    columns.find((c) => c.editable)?.id ?? columns[0]?.id,
  );
  const [colorPickerIdx, setColorPickerIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setLocalCols(stripAutoOption(JSON.parse(JSON.stringify(columns))));
    setActiveColId(columns.find((c) => c.editable)?.id ?? columns[0]?.id);
  }, [visible, columns]);
  if (!visible) return null;

  const activeCol = localCols.find((c) => c.id === activeColId)!;

  const updateOption = (idx: number, patch: Partial<DropdownOption>) => {
    setLocalCols((prev) =>
      prev.map((col) =>
        col.id !== activeColId
          ? col
          : {
              ...col,
              options: col.options.map((opt, i) =>
                i === idx ? { ...opt, ...patch } : opt,
              ),
            },
      ),
    );
  };

  const addOption = () => {
    const preset = COLOR_PRESETS[0];
    setLocalCols((prev) =>
      prev.map((col) =>
        col.id !== activeColId
          ? col
          : {
              ...col,
              options: [
                ...col.options,
                {
                  label: "New option",
                  value: "New option",
                  bgColor: preset.bgHex,
                  textColor: preset.textHex,
                },
              ],
            },
      ),
    );
  };

  const removeOption = (idx: number) => {
    setLocalCols((prev) =>
      prev.map((col) =>
        col.id !== activeColId
          ? col
          : { ...col, options: col.options.filter((_, i) => i !== idx) },
      ),
    );
  };

  const reorderOption = (fromIdx: number, toIdx: number) => {
    setLocalCols((prev) =>
      prev.map((col) => {
        if (col.id !== activeColId) return col;
        const options = [...col.options];
        const [moved] = options.splice(fromIdx, 1);
        options.splice(toIdx, 0, moved);
        return { ...col, options };
      }),
    );
  };

  const applyColor = (optIdx: number, preset: (typeof COLOR_PRESETS)[0]) => {
    updateOption(optIdx, {
      bgColor: preset.bgHex,
      textColor: preset.textHex,
    });
    setColorPickerIdx(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);

    // Sync value to match label for all options
    const synced = localCols.map((col) => ({
      ...col,
      options: col.options.map((opt) => ({ ...opt, value: opt.label })),
    }));

    try {
      // Persist every editable column's options to MySQL, one at a time.
      // Firing these concurrently (Promise.all) caused two PUT requests to
      // open overlapping DELETE+INSERT transactions against the same
      // dropdown_configs table at once, which MySQL would sometimes resolve
      // by killing one as a deadlock victim (ER_LOCK_DEADLOCK). Saving
      // sequentially avoids that entirely.
      for (const col of synced.filter((c) => c.editable)) {
        await saveDropdownOptions(col.module, col.field, col.options);
      }

      onSave(synced);
      onClose();
    } catch {
      setSaveError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setLocalCols(stripAutoOption(JSON.parse(JSON.stringify(columns))));
    setSaveError(null);
  };

  const getPresetForColor = (bgColor?: string) =>
    COLOR_PRESETS.find(
      (p) => p.bgHex.toLowerCase() === (bgColor ?? "").toLowerCase(),
    );

  return (
    <div
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          width: 660,
          maxHeight: "85vh",
          display: "flex",
          flexDirection: "column",
        }}
        className="rounded-xl border shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div
          style={{ borderBottomColor: theme.border }}
          className="flex items-center justify-between px-5 py-4 border-b flex-shrink-0"
        >
          <div>
            <h2 style={{ color: theme.text }} className="text-base font-bold">
              Manage column dropdowns
            </h2>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Changes are saved to the server and applied immediately to all
              users
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              color: theme.subtext,
              backgroundColor: theme.surfaceRaised,
            }}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold hover:opacity-70"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar */}
          <div
            style={{
              borderRightColor: theme.border,
              backgroundColor: theme.background,
            }}
            className="w-44 flex-shrink-0 border-r overflow-y-auto py-2"
          >
            <p
              style={{ color: theme.subtext }}
              className="text-[10px] font-medium uppercase tracking-widest px-4 pb-2"
            >
              Columns
            </p>
            {localCols.map((col) => (
              <button
                key={col.id}
                type="button"
                onClick={() => {
                  setActiveColId(col.id);
                  setColorPickerIdx(null);
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-xs text-left"
                style={{
                  backgroundColor:
                    col.id === activeColId
                      ? theme.surfaceRaised
                      : "transparent",
                  color: col.id === activeColId ? theme.text : theme.subtext,
                  fontWeight: col.id === activeColId ? 600 : 400,
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    col.id === activeColId
                      ? theme.surfaceRaised
                      : theme.bgHover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor =
                    col.id === activeColId
                      ? theme.surfaceRaised
                      : "transparent")
                }
              >
                <span>{col.label}</span>
                {col.editable ? (
                  <span
                    style={{
                      backgroundColor: theme.primarySubtle,
                      color: theme.primarySubtleText,
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  >
                    {col.options.length}
                  </span>
                ) : (
                  <span
                    style={{
                      color: theme.subtext,
                      backgroundColor: theme.surfaceRaised,
                    }}
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                  >
                    locked
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto p-5">
            {!activeCol.editable ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <span style={{ fontSize: 28 }}>🔒</span>
                <p style={{ color: theme.subtext }} className="text-sm">
                  This column is managed automatically
                </p>
              </div>
            ) : (
              <>
                <p
                  style={{ color: theme.text }}
                  className="text-sm font-medium mb-1"
                >
                  {activeCol.label} options
                </p>
                <p style={{ color: theme.subtext }} className="text-xs mb-4">
                  Add, rename, or remove options. Click the color swatch to
                  change badge color.
                </p>

                {/* Preview */}
                <div
                  style={{
                    backgroundColor: theme.background,
                    borderColor: theme.border,
                  }}
                  className="rounded-lg border px-4 py-3 mb-4"
                >
                  <p
                    style={{ color: theme.subtext }}
                    className="text-[10px] uppercase tracking-widest font-medium mb-2"
                  >
                    Preview
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {activeCol.options.length === 0 ? (
                      <span
                        style={{ color: theme.subtext }}
                        className="text-xs"
                      >
                        No options yet
                      </span>
                    ) : (
                      activeCol.options.map((opt, i) => (
                        <span
                          key={i}
                          className="inline-flex justify-center px-2 py-1 rounded-lg text-sm font-medium min-w-[90px]"
                          style={{
                            backgroundColor: opt.bgColor,
                            color: opt.textColor,
                          }}
                        >
                          {opt.label || "…"}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                {/* Option rows */}
                <div className="flex flex-col gap-2 mb-3">
                  {activeCol.options.map((opt, idx) => {
                    const matchedPreset = getPresetForColor(opt.bgColor);

                    return (
                      <div
                        key={idx}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (dragIdx !== null && dragOverIdx !== idx) {
                            setDragOverIdx(idx);
                          }
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIdx !== null && dragIdx !== idx) {
                            reorderOption(dragIdx, idx);
                          }
                          setDragIdx(null);
                          setDragOverIdx(null);
                        }}
                        style={{
                          opacity: dragIdx === idx ? 0.4 : 1,
                          borderTop:
                            dragOverIdx === idx &&
                            dragIdx !== null &&
                            dragIdx !== idx
                              ? `2px solid ${theme.primary}`
                              : "2px solid transparent",
                        }}
                      >
                        <div
                          style={{
                            borderColor: theme.border,
                            backgroundColor: theme.surface,
                          }}
                          className="flex items-center gap-2 px-3 py-2 rounded-lg border"
                        >
                          {/* Drag handle */}
                          <span
                            draggable
                            onDragStart={(e) => {
                              setDragIdx(idx);
                              setColorPickerIdx(null);
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            onDragEnd={() => {
                              setDragIdx(null);
                              setDragOverIdx(null);
                            }}
                            title="Drag to reorder"
                            className="flex-shrink-0 flex items-center"
                            style={{ cursor: "grab" }}
                          >
                            <GripIcon color={theme.subtext} />
                          </span>

                          {/* Color swatch */}
                          <button
                            type="button"
                            title="Change color"
                            onClick={() =>
                              setColorPickerIdx(
                                colorPickerIdx === idx ? null : idx,
                              )
                            }
                            className="w-5 h-5 rounded flex-shrink-0 border"
                            style={{
                              backgroundColor: opt.bgColor,
                              borderColor: theme.border,
                            }}
                          />

                          {/* Label input */}
                          <input
                            type="text"
                            value={opt.label}
                            onChange={(e) =>
                              updateOption(idx, { label: e.target.value })
                            }
                            style={{
                              backgroundColor: "transparent",
                              color: theme.text,
                              borderColor: "transparent",
                            }}
                            className="flex-1 text-xs outline-none border-b focus:border-b"
                            onFocus={(e) =>
                              (e.currentTarget.style.borderColor =
                                theme.primary)
                            }
                            onBlur={(e) =>
                              (e.currentTarget.style.borderColor =
                                "transparent")
                            }
                          />

                          {/* Color hex preview (read-only) */}
                          {opt.bgColor && (
                            <span
                              title={`bg: ${opt.bgColor} · text: ${opt.textColor}`}
                              className="text-[10px] font-mono opacity-40 flex-shrink-0"
                              style={{ color: theme.subtext }}
                            >
                              {opt.bgColor}
                            </span>
                          )}

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => removeOption(idx)}
                            style={{ color: theme.subtext }}
                            className="text-xs hover:opacity-60 flex-shrink-0"
                            title="Remove option"
                          >
                            ✕
                          </button>
                        </div>

                        {/* Color picker inline */}
                        {colorPickerIdx === idx && (
                          <div
                            style={{
                              backgroundColor: theme.surface,
                              borderColor: theme.border,
                            }}
                            className="flex flex-wrap gap-2 px-3 py-2 border border-t-0 rounded-b-lg"
                          >
                            {COLOR_PRESETS.map((preset) => (
                              <button
                                key={preset.label}
                                type="button"
                                title={preset.label}
                                onClick={() => applyColor(idx, preset)}
                                className={`w-5 h-5 rounded ${preset.bg} border`}
                                style={{
                                  borderColor:
                                    matchedPreset?.bg === preset.bg
                                      ? theme.primary
                                      : theme.border,
                                  outline:
                                    matchedPreset?.bg === preset.bg
                                      ? `2px solid ${theme.primary}`
                                      : "none",
                                }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Add option */}
                <button
                  type="button"
                  onClick={addOption}
                  style={{ borderColor: theme.border, color: theme.subtext }}
                  className="w-full flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg text-xs hover:opacity-70 mb-4"
                >
                  <span className="text-base leading-none">+</span> Add option
                </button>
              </>
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <div
          style={{ borderTopColor: theme.border }}
          className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
        >
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              style={{ color: theme.subtext, borderColor: theme.border }}
              className="px-3 py-1.5 text-xs border rounded-lg hover:opacity-70 disabled:opacity-40"
            >
              Reset to saved
            </button>
            {saveError && (
              <span className="text-xs text-red-500">{saveError}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              style={{ color: theme.text, borderColor: theme.border }}
              className="px-3 py-1.5 text-xs border rounded-lg hover:opacity-70 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryText,
              }}
              className="px-4 py-1.5 text-xs font-medium rounded-lg hover:opacity-90 disabled:opacity-60 flex items-center gap-2"
            >
              {saving && (
                <span
                  className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin"
                  style={{
                    borderColor: theme.primaryText,
                    borderTopColor: "transparent",
                  }}
                />
              )}
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ManageColumnsModal;
