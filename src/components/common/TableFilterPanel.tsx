import React, { useEffect, useRef, useState } from "react";
import { useTheme } from "../../theme/ThemeContext";
import { DropdownOption } from "../../app/Modules/Superadmin/ManageColumnsModal";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FilterField = {
  key: string;
  label: string;
  options: DropdownOption[];
};

export type FilterState = {
  [key: string]: string[] | string | undefined;
  dateFrom?: string;
  dateTo?: string;
};

export type TableFilterConfig = {
  fields: FilterField[];
  showDateRange?: boolean;
  dateLabel?: string;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTableFilter(config: TableFilterConfig) {
  const emptyFilter = (): FilterState => {
    const base: FilterState = { dateFrom: "", dateTo: "" };
    config.fields.forEach((f) => (base[f.key] = []));
    return base;
  };

  const [filterPanelVisible, setFilterPanelVisible] = useState(false);
  const [pendingFilters, setPendingFilters] = useState<FilterState>(emptyFilter);
  const [appliedFilters, setAppliedFilters] = useState<FilterState>(emptyFilter);
  const [filterPanelPos, setFilterPanelPos] = useState<React.CSSProperties>({});
  const filterBtnRef = useRef<HTMLButtonElement>(null);

  const hasActive = () =>
    config.fields.some((f) => (appliedFilters[f.key] as string[])?.length > 0) ||
    !!appliedFilters.dateFrom ||
    !!appliedFilters.dateTo;

  const activeCount = [
    ...config.fields.map((f) => (appliedFilters[f.key] as string[])?.length > 0),
    !!(appliedFilters.dateFrom || appliedFilters.dateTo),
  ].filter(Boolean).length;

  const handleFilterButtonClick = () => {
    if (filterPanelVisible) {
      setFilterPanelVisible(false);
      return;
    }
    if (filterBtnRef.current) {
      const rect = filterBtnRef.current.getBoundingClientRect();
      const panelWidth = 280;
      const left = Math.min(
        rect.right - panelWidth,
        window.innerWidth - panelWidth - 8,
      );
      setFilterPanelPos({ top: rect.bottom + 6, left: Math.max(8, left) });
    }
    setPendingFilters(appliedFilters);
    setFilterPanelVisible(true);
  };

  const handleClear = () => {
    const empty = emptyFilter();
    setPendingFilters(empty);
    setAppliedFilters(empty);
    setFilterPanelVisible(false);
  };

  const applyToData = <T extends Record<string, any>>(
    data: T[],
    fieldMap: Partial<Record<string, keyof T>>,
    dateField?: keyof T,
  ): T[] => {
    let result = data;
    config.fields.forEach((f) => {
      const selected = appliedFilters[f.key] as string[];
      if (!selected?.length) return;
      const dataKey = fieldMap[f.key] ?? (f.key as keyof T);
      result = result.filter((item) => selected.includes(item[dataKey] as string));
    });
    if (dateField) {
      if (appliedFilters.dateFrom)
        result = result.filter(
          (item) => toDateString(item[dateField]) >= appliedFilters.dateFrom!,
        );
      if (appliedFilters.dateTo)
        result = result.filter(
          (item) => toDateString(item[dateField]) <= appliedFilters.dateTo!,
        );
    }
    return result;
  };

  return {
    filterBtnRef,
    filterPanelVisible,
    setFilterPanelVisible,
    pendingFilters,
    setPendingFilters,
    appliedFilters,
    setAppliedFilters,
    filterPanelPos,
    handleFilterButtonClick,
    handleClear,
    hasActive,
    activeCount,
    applyToData,
  };
}

// ─── Date helper (internal) ───────────────────────────────────────────────────

function toDateString(value: any): string {
  if (!value) return "";
  if (typeof value.toDate === "function")
    return value.toDate().toISOString().split("T")[0];
  if (value instanceof Date) return value.toISOString().split("T")[0];
  const d = new Date(value);
  return isNaN(d.getTime()) ? "" : d.toISOString().split("T")[0];
}

// ─── Filter Button ────────────────────────────────────────────────────────────

type FilterButtonProps = {
  btnRef: React.RefObject<HTMLButtonElement | null>;
  onClick: () => void;
  activeCount: number;
  hasActive: boolean;
};

export const TableFilterButton: React.FC<FilterButtonProps> = ({
  btnRef,
  onClick,
  activeCount,
  hasActive,
}) => {
  const { theme } = useTheme();
  return (
    <button
      ref={btnRef}
      type="button"
      onClick={onClick}
      style={{
        backgroundColor: hasActive ? theme.primary : theme.surface,
        color: hasActive ? theme.primaryText : theme.subtext,
        borderColor: hasActive ? theme.primary : theme.border,
      }}
      className="flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border whitespace-nowrap transition-all"
      onMouseEnter={(e) => {
        if (!hasActive) e.currentTarget.style.backgroundColor = theme.bgHover;
      }}
      onMouseLeave={(e) => {
        if (!hasActive) e.currentTarget.style.backgroundColor = theme.surface;
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
      </svg>
      Filter
      {activeCount > 0 && (
        <span
          className="px-1.5 py-0.5 rounded-full text-xs font-semibold"
          style={{
            backgroundColor: "rgba(255,255,255,0.25)",
            color: theme.primaryText,
          }}
        >
          {activeCount}
        </span>
      )}
    </button>
  );
};

// ─── Filter Panel ─────────────────────────────────────────────────────────────

type TableFilterPanelProps = {
  visible: boolean;
  config: TableFilterConfig;
  pendingFilters: FilterState;
  setPendingFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  onFilterChange: (updated: FilterState) => void;
  onClear: () => void;
  onClose: () => void;
  panelPos: React.CSSProperties;
};

export const TableFilterPanel: React.FC<TableFilterPanelProps> = ({
  visible,
  config,
  pendingFilters,
  setPendingFilters,
  onFilterChange,
  onClear,
  onClose,
  panelPos,
}) => {
  const { theme } = useTheme();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node))
        onClose();
    };
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [visible, onClose]);

  if (!visible) return null;

  const toggleChip = (key: string, value: string) => {
    setPendingFilters((prev) => {
      const arr = (prev[key] as string[]) ?? [];
      const updated = {
        ...prev,
        [key]: arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value],
      };
      onFilterChange(updated);
      return updated;
    });
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <p
      style={{ color: theme.subtext }}
      className="text-xs font-semibold uppercase tracking-wider mb-2"
    >
      {label}
    </p>
  );

  const ChipGroup = ({
    options,
    selected,
    onToggle,
  }: {
    options: DropdownOption[];
    selected: string[];
    onToggle: (val: string) => void;
  }) => (
    <div className="flex flex-wrap gap-1.5 mb-4">
      {options.map((opt) => {
        const isActive = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onToggle(opt.value)}
            className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
            style={
              isActive
                ? {
                    backgroundColor: opt.bgColor ?? theme.primarySubtle,
                    color: opt.textColor ?? theme.primarySubtleText,
                    borderColor: (opt.textColor ?? theme.primarySubtleText) + "55",
                  }
                : {
                    backgroundColor: theme.surface,
                    color: theme.subtext,
                    borderColor: theme.border,
                  }
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div
      ref={panelRef}
      style={{
        ...panelPos,
        backgroundColor: theme.surface,
        borderColor: theme.border,
        boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
        zIndex: 9999,
        width: 280,
      }}
      className="fixed rounded-xl border overflow-hidden"
    >
      {/* Header */}
      <div
        style={{ borderBottomColor: theme.border }}
        className="flex items-center justify-between px-4 py-3 border-b"
      >
        <span style={{ color: theme.text }} className="text-sm font-medium flex items-center gap-1">
          <svg
        xmlns="http://www.w3.org/2000/svg"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z" />
      </svg>
      Filter
        </span>
        <button
          type="button"
          onClick={onClear}
          style={{ color: theme.subtext }}
          className="text-xs hover:underline"
        >
          Clear all
        </button>
      </div>

      {/* Body */}
      <div className="px-4 pt-3 pb-2 max-h-[70vh] overflow-y-auto inventory-scroll">
        {config.fields.map((field) => (
          <div key={field.key}>
            <SectionLabel label={field.label} />
            <ChipGroup
              options={field.options}
              selected={(pendingFilters[field.key] as string[]) ?? []}
              onToggle={(v) => toggleChip(field.key, v)}
            />
          </div>
        ))}

        {config.showDateRange && (
          <>
            <SectionLabel label={config.dateLabel ?? "Date Range"} />
            <div className="flex items-center gap-2 mb-4">
              <input
                type="date"
                value={pendingFilters.dateFrom ?? ""}
                onChange={(e) => {
                  const updated = { ...pendingFilters, dateFrom: e.target.value };
                  setPendingFilters(updated);
                  onFilterChange(updated);
                }}
                style={{
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  color: theme.inputText,
                  colorScheme: theme.mode,
                }}
                className="flex-1 text-xs px-2 py-1.5 border rounded-lg focus:outline-none"
              />
              <span style={{ color: theme.subtext }} className="text-xs">—</span>
              <input
                type="date"
                value={pendingFilters.dateTo ?? ""}
                onChange={(e) => {
                  const updated = { ...pendingFilters, dateTo: e.target.value };
                  setPendingFilters(updated);
                  onFilterChange(updated);
                }}
                style={{
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  color: theme.inputText,
                  colorScheme: theme.mode,
                }}
                className="flex-1 text-xs px-2 py-1.5 border rounded-lg focus:outline-none"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};