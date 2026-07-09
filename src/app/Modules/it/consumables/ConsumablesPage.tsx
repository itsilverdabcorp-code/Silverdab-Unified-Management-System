import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getAllConsumables,
  deleteConsumable,
  updateConsumableField,
} from "../../../../services/consumableService";
import { ADUser, ITConsumable } from "../../../../../types";
import AddConsumableModal from "./AddConsumablesModal";
import EditConsumableModal from "./EditConsumableModal";
import BadgeSelect from "../../../../components/common/BadgeSelect";
import { useTheme } from "../../../../theme/ThemeContext";
import ManageColumnsModal, {
  ColumnConfig,
  DropdownOption,
} from "../../Superadmin/ManageColumnsModal";
import AuditTrailModal from "../../../../components/common/AuditTrailModal";
import { getAllDropdownConfigs } from "../../../../services/dropdownConfigs";
import {
  useTableFilter,
  TableFilterButton,
  TableFilterPanel,
} from "../../../../components/common/TableFilterPanel";

// ─── Options ──────────────────────────────────────────────────────────────────
const DEFAULT_STATUS_OPTIONS: DropdownOption[] = [
  {
    label: "Spare",
    value: "Spare",
    badgeClass:
      "bg-sky-100 text-sky-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#e0f2fe",
    textColor: "#0369a1",
  },
  {
    label: "Deployed",
    value: "Deployed",
    badgeClass:
      "bg-emerald-100 text-emerald-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#d1fae5",
    textColor: "#065f46",
  },
  {
    label: "Defective",
    value: "Defective",
    badgeClass:
      "bg-red-100 text-red-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#fee2e2",
    textColor: "#991b1b",
  },
];

const DEFAULT_LOCATION_OPTIONS: DropdownOption[] = [
  {
    label: "Unit 1 & 2",
    value: "Unit 1 & 2",
    badgeClass:
      "bg-pink-100 text-pink-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#fce7f3",
    textColor: "#9d174d",
  },
  {
    label: "Unit 3",
    value: "Unit 3",
    badgeClass:
      "bg-purple-100 text-purple-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#f3e8ff",
    textColor: "#6b21a8",
  },
  {
    label: "BDO Makati",
    value: "BDO Makati",
    badgeClass:
      "bg-teal-100 text-teal-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#ccfbf1",
    textColor: "#115e59",
  },
  {
    label: "Triumph",
    value: "Triumph",
    badgeClass:
      "bg-green-100 text-green-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#dcfce7",
    textColor: "#166534",
  },
  {
    label: "WFH",
    value: "WFH",
    badgeClass:
      "bg-cyan-100 text-cyan-800 inline-flex items-center px-3 py-1 text-sm font-semibold",
    bgColor: "#cffafe",
    textColor: "#155e75",
  },
];

// ─── Sort helpers ─────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | "default";
type ConsumablesSortKey =
  | "name"
  | "model"
  | "status"
  | "location"
  | "ipAddress"
  | "macAddress"
  | "black"
  | "cyan"
  | "magenta"
  | "yellow"
  | "maintenanceBox"
  | "photoBlack";

function cycleDir(d: SortDir): SortDir {
  if (d === "default") return "asc";
  if (d === "asc") return "desc";
  return "default";
}

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="ml-1 text-blue-500">▲</span>;
  if (dir === "desc") return <span className="ml-1 text-blue-500">▼</span>;
  return <span className="ml-1 text-gray-300">▲▼</span>;
};

// ─── Ink helpers ──────────────────────────────────────────────────────────────

const INK_COLORS: Record<string, { bg: string; text: string }> = {
  black: { bg: "#f3f4f6", text: "#1f2937" },
  photoBlack: { bg: "#f3f4f6", text: "#374151" },
  cyan: { bg: "#ecfeff", text: "#0e7490" },
  magenta: { bg: "#fdf2f8", text: "#be185d" },
  yellow: { bg: "#fefce8", text: "#a16207" },
  maintenanceBox: { bg: "#f5f3ff", text: "#6d28d9" },
};

const InkBadge = ({ value, type }: { value: number; type: string }) => {
  const cfg = INK_COLORS[type] ?? INK_COLORS.black;
  const low = value <= 2;
  const mid = value > 2 && value <= 5;
  return (
    <span
      style={{
        backgroundColor: low ? "#fef2f2" : mid ? "#fffbeb" : cfg.bg,
        color: low ? "#dc2626" : mid ? "#d97706" : cfg.text,
      }}
      className="inline-flex items-center justify-center min-w-[36px] px-2.5 py-1 rounded-lg text-xs font-bold"
    >
      {value}
    </span>
  );
};

type InkCellProps = {
  itemId: string;
  inkKey: string;
  value: number;
  onUpdate: (id: string, field: string, value: number) => void;
};

const InkCell = ({ itemId, inkKey, value, onUpdate }: InkCellProps) => {
  const { theme } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = () => {
    const num = parseInt(draft, 10);
    if (!isNaN(num) && num >= 0) onUpdate(itemId, inkKey, num);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        style={{
          borderColor: theme.inputBorderFocus,
          backgroundColor: theme.inputBg,
          color: theme.text,
        }}
        className="w-12 text-center text-xs px-1.5 py-1 border rounded-md focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
      className="cursor-pointer"
    >
      <InkBadge value={value} type={inkKey} />
    </button>
  );
};

// ─── Column config ────────────────────────────────────────────────────────────

const COLUMNS: { key: ConsumablesSortKey; label: string }[] = [
  { key: "name", label: "Printer Name" },
  { key: "model", label: "Model" },
  { key: "status", label: "Status" },
  { key: "location", label: "Location" },
  { key: "ipAddress", label: "IP Address" },
  { key: "macAddress", label: "MAC Address" },
  { key: "black", label: "Black" },
  { key: "cyan", label: "Cyan" },
  { key: "magenta", label: "Magenta" },
  { key: "yellow", label: "Yellow" },
  { key: "maintenanceBox", label: "Maint. Box" },
  { key: "photoBlack", label: "Photo Black" },
];

const INK_KEYS = [
  "black",
  "cyan",
  "magenta",
  "yellow",
  "maintenanceBox",
  "photoBlack",
] as const;

// ─── Status group definitions ─────────────────────────────────────────────────

type StatusGroupDef = {
  key: "Deployed" | "Defective" | "Spare";
  label: string;
  headerBg: string;
  headerText: string;
  badgeBg: string;
  badgeText: string;
};

const STATUS_GROUPS: StatusGroupDef[] = [
  {
    key: "Deployed",
    label: "DEPLOYED",
    headerBg: "#d1fae5",
    headerText: "#065f46",
    badgeBg: "#a7f3d0",
    badgeText: "#065f46",
  },
  {
    key: "Defective",
    label: "DEFECTIVE",
    headerBg: "#fee2e2",
    headerText: "#991b1b",
    badgeBg: "#fecaca",
    badgeText: "#991b1b",
  },
  {
    key: "Spare",
    label: "SPARE",
    headerBg: "#ede9fe",
    headerText: "#4c1d95",
    badgeBg: "#ddd6fe",
    badgeText: "#4c1d95",
  },
];

// ─── StatusSection (outside page — prevents remount on re-render) ─────────────

type StatusSectionProps = {
  group: StatusGroupDef;
  items: ITConsumable[];
  isCollapsed: boolean;
  theme: ReturnType<typeof useTheme>["theme"];
  onToggle: (key: string) => void;
  renderTableHead: (stickyTop: number) => React.ReactNode;
  renderTableBody: (items: ITConsumable[]) => React.ReactNode;
};

const StatusSection: React.FC<StatusSectionProps> = React.memo(
  ({
    group,
    items,
    isCollapsed,
    theme,
    onToggle,
    renderTableHead,
    renderTableBody,
  }) => {
    const headerRef = useRef<HTMLDivElement>(null);
    const measuredRef = useRef(false);
    const [headerHeight, setHeaderHeight] = useState(37);

    useEffect(() => {
      if (measuredRef.current) return;
      if (headerRef.current) {
        measuredRef.current = true;
        setHeaderHeight(headerRef.current.getBoundingClientRect().height);
      }
    }, []);

    return (
      <div className="mb-3">
        <div
          ref={headerRef}
          style={{
            backgroundColor: group.headerBg,
            position: "sticky",
            top: 0,
            zIndex: 20,
            borderRadius: isCollapsed ? 8 : "8px 8px 0 0",
            border: `0.5px solid ${theme.border}`,
          }}
        >
          <button
            type="button"
            onClick={() => onToggle(group.key)}
            className="w-full flex items-center gap-2 px-3 py-2 text-left select-none"
          >
            <span
              style={{ color: group.headerText, fontSize: 13, fontWeight: 600 }}
            >
              {isCollapsed ? "▶" : "▼"}
            </span>
            <span
              style={{
                color: group.headerText,
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              {group.label}
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold ml-1"
              style={{ backgroundColor: group.badgeBg, color: group.badgeText }}
            >
              {items.length}
            </span>
          </button>
        </div>

        {!isCollapsed && (
          <div
            style={{
              border: `0.5px solid ${theme.border}`,
              borderTop: "none",
              borderRadius: "0 0 8px 8px",
            }}
          >
            {items.length === 0 ? (
              <p style={{ color: theme.subtext }} className="text-sm px-4 py-3">
                No {group.key.toLowerCase()} printers.
              </p>
            ) : (
              <table
                className="min-w-full text-sm"
                style={{ borderCollapse: "collapse" }}
              >
                {renderTableHead(headerHeight)}
                <tbody>{renderTableBody(items)}</tbody>
              </table>
            )}
          </div>
        )}
      </div>
    );
  },
);

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { user: ADUser; isSuperAdmin?: boolean };
const ConsumablesPage: React.FC<Props> = ({ user, isSuperAdmin = false }) => {
  const { theme } = useTheme();

  // ─── Dropdown options (declared first so hook can reference them) ─────────
  const [dropdownOptions, setDropdownOptions] = useState({
    status: DEFAULT_STATUS_OPTIONS,
    location: DEFAULT_LOCATION_OPTIONS,
  });

  // ─── Filter hook ──────────────────────────────────────────────────────────
  const consumableFilter = useTableFilter({
    fields: [
      { key: "status", label: "Status", options: dropdownOptions.status },
      { key: "location", label: "Location", options: dropdownOptions.location },
    ],
  });

  const [data, setData] = useState<ITConsumable[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<ConsumablesSortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("default");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [addVisible, setAddVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ITConsumable | null>(null);
  const [manageColumnsVisible, setManageColumnsVisible] = useState(false);
  const [auditModal, setAuditModal] = useState<
    | { recordId?: string; recordLabel?: string }
    | null
  >(null);

const [columnConfigs, setColumnConfigs] = useState<ColumnConfig[]>([
    {
      id: "consumable_status",
      module: "consumable",
      field: "status",
      label: "Status",
      editable: true,
      options: [],
    },
    {
      id: "consumable_location",
      module: "consumable",
      field: "location",
      label: "Location",
      editable: true,
      options: [],
    },
  ]);

  // ─── Data ──────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    const result = await getAllConsumables();
    setData(result);
    setLoading(false);
  }, []);

  // Themed scrollbar
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "inventory-scrollbar-style";
    style.textContent = `
      .inventory-scroll::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      .inventory-scroll::-webkit-scrollbar-track {
        background: ${theme.background};
      }
      .inventory-scroll::-webkit-scrollbar-thumb {
        background: ${theme.border};
        border-radius: 999px;
      }
      .inventory-scroll::-webkit-scrollbar-thumb:hover {
        background: ${theme.subtext};
      }
      .inventory-scroll::-webkit-scrollbar-corner {
        background: ${theme.background};
      }
    `;

    const existing = document.getElementById("inventory-scrollbar-style");
    if (existing) existing.remove();
    document.head.appendChild(style);

    return () => {
      document.getElementById("inventory-scrollbar-style")?.remove();
    };
  }, [theme]);

  useEffect(() => {
    getAllDropdownConfigs({
      inventory: { status: [], category: [], location: [], company: [] },
      ticket: { status: [], category: [], priority: [] },
      consumable: { status: DEFAULT_STATUS_OPTIONS, location: DEFAULT_LOCATION_OPTIONS },
    })
      .then((result) => {
        const consumable = result.consumable;
        if (!consumable) return;

        setColumnConfigs((prev) =>
          prev.map((col) => {
            if (col.id === "consumable_status")
              return { ...col, options: consumable.status };
            if (col.id === "consumable_location")
              return { ...col, options: consumable.location };
            return col;
          }),
        );
        setDropdownOptions({
          status: consumable.status,
          location: consumable.location,
        });
      })
      .catch((err) =>
        console.error("Failed to load consumable dropdown configs:", err),
      );
  }, []);
  
  useEffect(() => {
    fetchData();
  }, []);

  const updateLocalField = useCallback(
    (id: string, field: string, value: string | number) => {
      setData((prev) =>
        prev.map((item) =>
          item.model === id ? { ...item, [field]: value } : item,
        ),
      );
    },
    [],
  );

  const handleFieldUpdate = useCallback(
    async (id: string, field: string, value: string | number) => {
      updateLocalField(id, field, value);
      try {
        await updateConsumableField(id, field, value);
      } catch (err) {
        console.error(`Unable to update ${field} for ${id}:`, err);
        fetchData();
      }
    },
    [updateLocalField, fetchData],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      await deleteConsumable(id);
      fetchData();
    },
    [fetchData],
  );

  const handleEdit = useCallback((item: ITConsumable) => {
    setSelectedItem(item);
    setEditVisible(true);
  }, []);

  const toggleCollapsed = useCallback(
    (key: string) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );

  // ─── Sort ──────────────────────────────────────────────────────────────────

  const handleSort = useCallback(
    (key: ConsumablesSortKey) => {
      if (sortKey !== key) {
        setSortKey(key);
        setSortDir("asc");
      } else {
        const next = cycleDir(sortDir);
        setSortDir(next);
        if (next === "default") setSortKey(null);
      }
    },
    [sortKey, sortDir],
  );

  const dirFor = (key: ConsumablesSortKey): SortDir =>
    sortKey === key ? sortDir : "default";

  // ─── Filter + sort ─────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = data;

    result = consumableFilter.applyToData(result, {
      status: "status",
      location: "location",
    });

    if (!q) return result;
    return result.filter((item) =>
      [
        item.name,
        item.model,
        item.status,
        item.location,
        item.ipAddress,
        item.macAddress,
      ].some((v) => (v ?? "").toLowerCase().includes(q)),
    );
  }, [data, search, consumableFilter.appliedFilters]);

  const sortedFiltered = useMemo(() => {
    if (!sortKey || sortDir === "default") return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).toLowerCase() < String(bv).toLowerCase()
            ? -1
            : String(av).toLowerCase() > String(bv).toLowerCase()
              ? 1
              : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  // ─── Stable per-group arrays (prevent unrelated sections from re-rendering) ─

  const groupedDeployed = useMemo(
    () => sortedFiltered.filter((i) => i.status === "Deployed"),
    [sortedFiltered],
  );
  const groupedDefective = useMemo(
    () => sortedFiltered.filter((i) => i.status === "Defective"),
    [sortedFiltered],
  );
  const groupedSpare = useMemo(
    () => sortedFiltered.filter((i) => i.status === "Spare"),
    [sortedFiltered],
  );

  const groupedItemsMap = useMemo(
    () => ({
      Deployed: groupedDeployed,
      Defective: groupedDefective,
      Spare: groupedSpare,
    }),
    [groupedDeployed, groupedDefective, groupedSpare],
  );

  // ─── Table head ────────────────────────────────────────────────────────────

  const renderTableHead = useCallback(
    (stickyTop: number = 0) => (
      <thead>
        <tr>
          {COLUMNS.map(({ key, label }) => (
            <th
              key={key}
              onClick={() => handleSort(key)}
              style={{
                color: theme.subtext,
                borderColor: theme.border,
                backgroundColor: theme.surfaceRaised,
                position: "sticky",
                top: stickyTop,
                zIndex: 10,
              }}
              className="px-3 py-1 text-left text-xs font-semibold uppercase tracking-wide whitespace-nowrap border-b cursor-pointer select-none transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.color = theme.text)}
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = theme.subtext)
              }
            >
              <span className="inline-flex items-center gap-1">
                {label}
                <SortIcon dir={dirFor(key)} />
              </span>
            </th>
          ))}
        </tr>
      </thead>
    ),
    [theme, sortKey, sortDir, handleSort],
  );

  // ─── Table body ────────────────────────────────────────────────────────────

  const renderTableBody = useCallback(
    (items: ITConsumable[]) =>
      items.map((item, index) => (
        <tr
          key={item.id ?? item.model}
          style={{
            backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          {/* Printer Name */}
          <td className="px-3 py-1 min-w-[130px]">
            <button
              type="button"
              onDoubleClick={() => handleEdit(item)}
              className="text-left w-full"
            >
              <p
                style={{ color: theme.text }}
                className="text-sm font-semibold transition-opacity hover:opacity-70 truncate"
              >
                {item.name}
              </p>
            </button>
          </td>

          {/* Model */}
          <td className="px-3 py-1 min-w-[110px]">
            <span
              style={{ color: theme.subtext }}
              className="text-xs font-mono truncate block"
            >
              {item.model || "—"}
            </span>
          </td>

          {/* Status */}
          <td className="px-3 py-1 min-w-[120px]">
            <BadgeSelect
              value={item.status}
              displayName={item.status || "—"}
              options={dropdownOptions.status}
              placeholder="—"
              onChange={(val) => handleFieldUpdate(item.model, "status", val)}
            />
          </td>

          {/* Location */}
          <td className="px-3 py-1 min-w-[120px]">
            <BadgeSelect
              value={item.location}
              displayName={item.location || "—"}
              options={dropdownOptions.location}
              placeholder="—"
              onChange={(val) => handleFieldUpdate(item.model, "location", val)}
            />
          </td>

          {/* IP Address */}
          <td className="px-3 py-1 min-w-[110px]">
            <span style={{ color: theme.text }} className="text-xs font-mono">
              {item.ipAddress || "—"}
            </span>
          </td>

          {/* MAC Address */}
          <td className="px-3 py-1 min-w-[130px]">
            <span
              style={{ color: theme.subtext }}
              className="text-xs font-mono"
            >
              {item.macAddress || "—"}
            </span>
          </td>

          {/* Ink columns */}
          {INK_KEYS.map((inkKey) => (
            <td key={inkKey} className="px-3 py-1 min-w-[70px] text-center">
              {item[inkKey] !== undefined && item[inkKey] !== null ? (
                <InkCell
                  itemId={item.model}
                  inkKey={inkKey}
                  value={item[inkKey] as number}
                  onUpdate={handleFieldUpdate}
                />
              ) : (
                <span style={{ color: theme.subtext }} className="text-xs">
                  —
                </span>
              )}
            </td>
          ))}
        </tr>
      )),
    [theme, handleFieldUpdate, handleEdit, dropdownOptions],
  );

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* ── Fixed top bar ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 style={{ color: theme.text }} className="text-xl font-bold">
              IT Consumables
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              {sortedFiltered.length} of {data.length} printers
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setAuditModal({})}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="px-3 py-2 text-sm font-medium rounded-lg border whitespace-nowrap"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.bgHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.surface)
              }
            >
              Audit Trail
            </button>
            
              <button
                onClick={() => setManageColumnsVisible(true)}
                style={{
                  backgroundColor: theme.surface,
                  color: theme.text,
                  borderColor: theme.border,
                }}
                className="px-3 py-2 text-sm font-semibold rounded-lg border whitespace-nowrap"
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = theme.bgHover)
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = theme.surface)
                }
              >
                ⚙ Manage columns
              </button>
            
            <button
              onClick={() => setAddVisible(true)}
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryText,
              }}
              className="px-4 py-2 text-sm font-semibold rounded-lg whitespace-nowrap"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.primaryHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.primary)
              }
            >
              + Add Printer
            </button>
          </div>
        </div>

        {/* Row 2: Search bar (left) + Filter button (right) */}
<div className="flex items-center gap-2 mb-3">
  {/* Search */}
  <div className="flex-1">
    <div className="relative w-full max-w-md">
      {/* Search Icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: theme.subtext }}
      >
        <path d="m21 21-4.34-4.34" />
        <circle cx="11" cy="11" r="8" />
      </svg>

      <input
        type="text"
        placeholder="Search printer name, model, IP, location..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{
          backgroundColor: theme.inputBg,
          borderColor: theme.inputBorder,
          color: theme.inputText,
        }}
        className="w-full px-4 py-2.5 pl-9 text-sm border rounded-lg focus:outline-none"
        onFocus={(e) =>
          (e.currentTarget.style.borderColor = theme.inputBorderFocus)
        }
        onBlur={(e) =>
          (e.currentTarget.style.borderColor = theme.inputBorder)
        }
      />
    </div>
  </div>

  {/* Filter button */}
  <TableFilterButton
    btnRef={consumableFilter.filterBtnRef}
    onClick={consumableFilter.handleFilterButtonClick}
    activeCount={consumableFilter.activeCount}
    hasActive={consumableFilter.hasActive()}
  />
</div>
      </div>

      {/* ── Scrollable content ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div
            style={{ borderColor: theme.primary }}
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          />
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p style={{ color: theme.subtext }} className="text-sm">
            No printers found.
          </p>
        </div>
      ) : (
        <div className="inventory-scroll flex-1 overflow-y-auto overflow-x-auto px-4 pb-4">
          <div
            style={{ borderColor: theme.border }}
            className="rounded-lg border"
          >
            <table
              className="min-w-full text-sm"
              style={{ borderCollapse: "collapse" }}
            >
              {renderTableHead(0)}
              <tbody>{renderTableBody(sortedFiltered)}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Filter panel ── */}
      <TableFilterPanel
        visible={consumableFilter.filterPanelVisible}
        config={{
          fields: [
            { key: "status", label: "Status", options: dropdownOptions.status },
            { key: "location", label: "Location", options: dropdownOptions.location },
          ],
        }}
        pendingFilters={consumableFilter.pendingFilters}
        setPendingFilters={consumableFilter.setPendingFilters}
        onFilterChange={(updated) => consumableFilter.setAppliedFilters(updated)}
        onClear={consumableFilter.handleClear}
        onClose={() => consumableFilter.setFilterPanelVisible(false)}
        panelPos={consumableFilter.filterPanelPos}
      />

      <AddConsumableModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSuccess={fetchData}
      />
      <EditConsumableModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        onSuccess={fetchData}
        selectedItem={selectedItem}
        onDelete={handleDelete}
      />
      <ManageColumnsModal
        visible={manageColumnsVisible}
        onClose={() => setManageColumnsVisible(false)}
        columns={columnConfigs}
        onSave={(updated) => {
          setColumnConfigs(updated);
          const sta =
            updated.find((c) => c.id === "consumable_status")?.options ??
            DEFAULT_STATUS_OPTIONS;
          const loc =
            updated.find((c) => c.id === "consumable_location")?.options ??
            DEFAULT_LOCATION_OPTIONS;
          setDropdownOptions({ status: sta, location: loc });
        }}
      />
      <AuditTrailModal
        visible={auditModal !== null}
        onClose={() => setAuditModal(null)}
        table="consumables"
        recordId={auditModal?.recordId}
        recordLabel={auditModal?.recordLabel}
      />
    </div>
  );
};

export default ConsumablesPage;
