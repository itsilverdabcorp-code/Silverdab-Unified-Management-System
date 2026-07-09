import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ADUser, ITInventory } from "../../../../../types";
import BadgeSelect from "../../../../components/common/BadgeSelect";
import {
  TableFilterButton,
  TableFilterPanel,
  useTableFilter,
} from "../../../../components/common/TableFilterPanel";
import { useEmployees } from "../../../../hooks/useEmployees";
import {
  deleteAsset,
  getAllAssets,
  updateAsset,
} from "../../../../services/itInventory";
import { useTheme } from "../../../../theme/ThemeContext";
import ManageColumnsModal, {
  ColumnConfig,
  DropdownOption,
} from "../../Superadmin/ManageColumnsModal";
import AddAssetModal from "./AddAssetModal";
import EditAssetModal from "./EditAssetModal";
import { getAllDropdownConfigs } from "@/services/dropdownConfigs";
import { logAudit } from "@/services/auditlogs";
import AuditTrailModal from "../../../../components/common/AuditTrailModal";

// ─── Dropdown option defaults — editable at runtime via the Manage Columns
// modal, which is why the page holds them in state (see below) rather than
// referencing these constants directly. ─────────────────────────────────────

export type { DropdownOption };

const DEFAULT_STATUS_OPTIONS: DropdownOption[] = [
  {
    label: "Deployed",
    value: "Deployed",
    badgeClass: "",
    bgColor: "#d1fae5",
    textColor: "#065f46",
  },
  {
    label: "Spare",
    value: "Spare",
    badgeClass: "",
    bgColor: "#dbeafe",
    textColor: "#1e40af",
  },
  {
    label: "Defective",
    value: "Defective",
    badgeClass: "",
    bgColor: "#fee2e2",
    textColor: "#991b1b",
  },
];

const DEFAULT_CATEGORY_OPTIONS: DropdownOption[] = [
  {
    label: "Laptop",
    value: "Laptop",
    badgeClass: "",
    bgColor: "#ffedd5",
    textColor: "#9a3412",
  },
  {
    label: "Monitor",
    value: "Monitor",
    badgeClass: "",
    bgColor: "#fef9c3",
    textColor: "#854d0e",
  },
  {
    label: "Desktop",
    value: "Desktop",
    badgeClass: "",
    bgColor: "#e0e7ff",
    textColor: "#3730a3",
  },
  {
    label: "UPS",
    value: "UPS",
    badgeClass: "",
    bgColor: "#cffafe",
    textColor: "#155e75",
  },
  {
    label: "Network Device",
    value: "Network Device",
    badgeClass: "",
    bgColor: "#d1fae5",
    textColor: "#065f46",
  },
  {
    label: "Server",
    value: "Server",
    badgeClass: "",
    bgColor: "#ede9fe",
    textColor: "#5b21b6",
  },
];

const DEFAULT_LOCATION_OPTIONS: DropdownOption[] = [
  {
    label: "Unit 1 & 2",
    value: "Unit 1 & 2",
    badgeClass: "",
    bgColor: "#fce7f3",
    textColor: "#9d174d",
  },
  {
    label: "Unit 3",
    value: "Unit 3",
    badgeClass: "",
    bgColor: "#f3e8ff",
    textColor: "#6b21a8",
  },
  {
    label: "BDO Makati",
    value: "BDO Makati",
    badgeClass: "",
    bgColor: "#ccfbf1",
    textColor: "#115e59",
  },
  {
    label: "Triumph",
    value: "Triumph",
    badgeClass: "",
    bgColor: "#dcfce7",
    textColor: "#166534",
  },
  {
    label: "WFH",
    value: "WFH",
    badgeClass: "",
    bgColor: "#cffafe",
    textColor: "#155e75",
  },
];

const DEFAULT_COMPANY_OPTIONS: DropdownOption[] = [
  {
    label: "OCG",
    value: "OCG",
    badgeClass: "",
    bgColor: "#dbeafe",
    textColor: "#1e40af",
  },
  {
    label: "SDB",
    value: "SDB",
    badgeClass: "",
    bgColor: "#ede9fe",
    textColor: "#5b21b6",
  },
];

// ─── Sort helpers ─────────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | "default";
type InventorySortKey =
  | "assetTag"
  | "company"
  | "serialNumber"
  | "model"
  | "brand"
  | "category"
  | "status"
  | "assigneeName"
  | "location"
  | "datePurchased"
  | "notes";

const STATUS_ORDER: Record<string, number> = {
  Deployed: 0,
  Spare: 1,
  Defective: 2,
};

function cycleDir(current: SortDir): SortDir {
  if (current === "default") return "asc";
  if (current === "asc") return "desc";
  return "default";
}

const TABLE_HEADERS: { label: string; key: InventorySortKey }[] = [
  { label: "Asset Tag", key: "assetTag" },
  { label: "Company", key: "company" },
  { label: "Serial Number", key: "serialNumber" },
  { label: "Model", key: "model" },
  { label: "Brand", key: "brand" },
  { label: "Category", key: "category" },
  { label: "Status", key: "status" },
  { label: "Assignee", key: "assigneeName" },
  { label: "Location", key: "location" },
  { label: "Date Purchased", key: "datePurchased" },
  { label: "Notes", key: "notes" },
];

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="ml-1 text-blue-500">▲</span>;
  if (dir === "desc") return <span className="ml-1 text-blue-500">▼</span>;
  return <span className="ml-1 text-gray-300">▲▼</span>;
};

// ─── SearchableSelect (assignee picker) ──────────────────────────────────────

type SearchableSelectProps = {
  value: string;
  displayName: string;
  options: { label: string; value: string }[];
  placeholder?: string;
  onChange: (value: string, label: string) => void;
};

const SearchableSelect = ({
  value,
  displayName,
  options,
  placeholder = "Unassigned",
  onChange,
}: SearchableSelectProps) => {
  const { theme } = useTheme();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const getInitials = (name: string) => {
    const parts = name.trim().split(" ").filter(Boolean);
    if (parts.length === 0) return "?";
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase();
  };

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
      const dropdownH = Math.min(220, filtered.length * 28 + 40);
      const showAbove = spaceBelow < dropdownH && rect.top > dropdownH;
      setDropdownStyle({
        position: "fixed",
        left: rect.left,
        width: rect.width,
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
    <div ref={wrapRef} className="relative min-w-[120px]">
      <button
        ref={triggerRef}
        type="button"
        onClick={openDropdown}
        className="text-left w-full"
      >
        {value ? (
          <span
            style={{
              backgroundColor: theme.primarySubtle,
              color: theme.primarySubtleText,
            }}
            className="inline-flex items-center justify-center gap-2 rounded-full px-3 py-1 text-xs font-medium max-w-full whitespace-nowrap"
          >
            <span
              className="flex items-center justify-center rounded-full"
              style={{
                width: 22,
                height: 22,
                backgroundColor: theme.primary,
                color: theme.primaryText,
                fontSize: 10,
                fontWeight: 500,
                flexShrink: 0,
              }}
            >
              {getInitials(displayName)}
            </span>
            {displayName}
          </span>
        ) : (
          <span
            style={{
              backgroundColor: theme.surfaceRaised,
              color: theme.subtext,
            }}
            className="inline-flex items-center justify-center rounded-full p-2"
            title={placeholder}
          >
            <svg
              className="w-4 h-4"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-3.33 0-8 1.67-8 5v1h16v-1c0-3.33-4.67-5-8-5z"
              />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            ...dropdownStyle,
            backgroundColor: theme.surface,
            borderColor: theme.border,
          }}
          className="rounded-lg shadow-lg border"
        >
          <input
            autoFocus
            type="text"
            value={query}
            placeholder="Search..."
            style={{
              backgroundColor: theme.surface,
              color: theme.text,
              borderBottomColor: theme.border,
            }}
            className="w-full px-3 py-2 text-xs border-b focus:outline-none"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setOpen(false);
                setQuery("");
              }
            }}
          />
          <ul className="inventory-scroll max-h-44 overflow-y-auto">
            {filtered.length === 0 ? (
              <li
                style={{ color: theme.subtext }}
                className="px-3 py-2 text-xs"
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
                    color: o.value === value ? theme.primary : theme.text,
                  }}
                  className={
                    "px-3 py-1.5 text-xs cursor-pointer " +
                    (o.value === value ? "font-medium" : "")
                  }
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

// ─── Date helpers ─────────────────────────────────────────────────────────

const toDateString = (value: string) => (value ? value.slice(0, 10) : "");
const formatDisplayDate = (value: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
};
const normalizeValue = (value: any) =>
  value == null ? "" : String(value).toLowerCase();

// ─── Page ─────────────────────────────────────────────────────────────────

export type InventoryFilter = {
  field: keyof ITInventory;
  value: string;
} | null;

type Props = { user: ADUser; initialFilter?: InventoryFilter };

const ITInventoryPage: React.FC<Props> = ({ user, initialFilter = null }) => {
  const { theme } = useTheme();

  // Dropdown options for this table's badge columns. Held in state (rather
  // than as plain constants) so the Manage Columns modal can add/edit/remove
  // options and have the change reflected immediately everywhere they're used.
  const [categoryOptions, setCategoryOptions] = useState<DropdownOption[]>(
    DEFAULT_CATEGORY_OPTIONS,
  );
  const [statusOptions, setStatusOptions] = useState<DropdownOption[]>(
    DEFAULT_STATUS_OPTIONS,
  );
  const [companyOptions, setCompanyOptions] = useState<DropdownOption[]>(
    DEFAULT_COMPANY_OPTIONS,
  );
  const [locationOptions, setLocationOptions] = useState<DropdownOption[]>(
    DEFAULT_LOCATION_OPTIONS,
  );
  const [manageColumnsVisible, setManageColumnsVisible] = useState(false);

  const manageColumnsConfig: ColumnConfig[] = useMemo(
    () => [
      {
        id: "category",
        module: "inventory",
        field: "category",
        label: "Category",
        editable: true,
        options: categoryOptions,
      },
      {
        id: "status",
        module: "inventory",
        field: "status",
        label: "Status",
        editable: true,
        options: statusOptions,
      },
      {
        id: "company",
        module: "inventory",
        field: "company",
        label: "Company",
        editable: true,
        options: companyOptions,
      },
      {
        id: "location",
        module: "inventory",
        field: "location",
        label: "Location",
        editable: true,
        options: locationOptions,
      },
    ],
    [categoryOptions, statusOptions, companyOptions, locationOptions],
  );

  const handleManageColumnsSave = useCallback((updated: ColumnConfig[]) => {
    updated.forEach((col) => {
      switch (col.id) {
        case "category":
          setCategoryOptions(col.options);
          break;
        case "status":
          setStatusOptions(col.options);
          break;
        case "company":
          setCompanyOptions(col.options);
          break;
        case "location":
          setLocationOptions(col.options);
          break;
      }
    });
  }, []);

  const inventoryFilter = useTableFilter({
    fields: [
      { key: "category", label: "Category", options: categoryOptions },
      { key: "status", label: "Status", options: statusOptions },
      { key: "company", label: "Company", options: companyOptions },
      { key: "location", label: "Location", options: locationOptions },
    ],
    showDateRange: true,
    dateLabel: "Date Purchased",
  });

  const [data, setData] = useState<ITInventory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] =
    useState<InventoryFilter>(initialFilter);
  const [sortKey, setSortKey] = useState<InventorySortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("default");
  const [addVisible, setAddVisible] = useState(false);
  const [editVisible, setEditVisible] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<ITInventory | null>(null);
  const [editingNoteTag, setEditingNoteTag] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string>("");
  const [auditModal, setAuditModal] = useState<{
    recordId?: string;
    recordLabel?: string;
  } | null>(null);

  const { employees } = useEmployees();

  const assigneeOptions = employees.map((e) => ({
    label: e.name,
    value: e.id,
  }));

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllAssets();
      setData(result);
    } catch (err) {
      console.error("Unable to load inventory", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    setActiveFilter(initialFilter ?? null);
  }, [initialFilter]);

  useEffect(() => {
    const loadDropdownConfigs = async () => {
      const configs = await getAllDropdownConfigs({
        inventory: {
          category: DEFAULT_CATEGORY_OPTIONS,
          status: DEFAULT_STATUS_OPTIONS,
          company: DEFAULT_COMPANY_OPTIONS,
          location: DEFAULT_LOCATION_OPTIONS,
        },
      });
      setCategoryOptions(configs.inventory.category);
      setStatusOptions(configs.inventory.status);
      setCompanyOptions(configs.inventory.company);
      setLocationOptions(configs.inventory.location);
    };
    loadDropdownConfigs();
  }, []);
  const updateLocalField = useCallback(
    (assetTag: string, field: string, value: string) => {
      setData((prev) =>
        prev.map((item) =>
          item.assetTag === assetTag ? { ...item, [field]: value } : item,
        ),
      );
    },
    [],
  );

  const handleFieldUpdate = useCallback(
    async (assetTag: string, field: string, value: string) => {
      const previous = data.find((item) => item.assetTag === assetTag);
      const oldValue = previous ? String((previous as any)[field] ?? "") : "";

      updateLocalField(assetTag, field, value);
      try {
        await updateAsset(assetTag, { [field]: value } as any);
        await logAudit({
          table: "inventory",
          recordId: assetTag,
          recordLabel: assetTag,
          field,
          oldValue,
          newValue: value,
          changedBy: user.displayName,
          changedById: user.username,
        });
      } catch (err) {
        console.error(`Unable to update ${field} for ${assetTag}:`, err);
        fetchData();
      }
    },
    [updateLocalField, fetchData, data],
  );

  const handleAssigneeChange = useCallback(
    async (assetTag: string, assigneeId: string) => {
      const previous = data.find((item) => item.assetTag === assetTag);
      const oldAssigneeName = previous?.assigneeName ?? "";
      const selected = employees.find((e) => e.id === assigneeId);
      const assigneeName = selected?.name ?? "";
      updateLocalField(assetTag, "assigneeId", assigneeId);
      updateLocalField(assetTag, "assigneeName", assigneeName);
      try {
        await updateAsset(assetTag, { assigneeId, assigneeName });
        await logAudit({
          table: "inventory",
          recordId: assetTag,
          recordLabel: assetTag,
          field: "assigneeName",
          oldValue: oldAssigneeName,
          newValue: assigneeName,
          changedBy: user.displayName,
          changedById: user.username,
        });
      } catch (err) {
        console.error(`Unable to update assignee for ${assetTag}:`, err);
        fetchData();
      }
    },
    [employees, updateLocalField, fetchData, data, user],
  );

  const handleDelete = useCallback(
    async (assetTag: string) => {
      await deleteAsset(assetTag);
      fetchData();
    },
    [fetchData],
  );

  const handleEdit = useCallback((asset: ITInventory) => {
    setSelectedAsset(asset);
    setEditVisible(true);
  }, []);

  const dirFor = (key: InventorySortKey): SortDir =>
    sortKey === key ? sortDir : "default";

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let result = activeFilter
      ? data.filter(
          (item) => (item[activeFilter.field] ?? "") === activeFilter.value,
        )
      : data;

    result = inventoryFilter.applyToData(
      result,
      {
        category: "category",
        status: "status",
        company: "company",
        location: "location",
      },
      "datePurchased",
    );

    if (!q) return result;
    return result.filter((item) => {
      const assigneeName =
        employees.find((e) => e.id === item.assigneeId)?.name ??
        item.assigneeName ??
        "";
      return [
        item.assetTag,
        item.brand,
        item.model,
        item.company,
        item.category,
        item.location,
        item.status,
        item.serialNumber,
        assigneeName,
        item.notes,
        item.datePurchased ? formatDisplayDate(item.datePurchased) : "",
      ]
        .map((v) => (v ?? "").toString().toLowerCase())
        .some((v) => v.includes(q));
    });
  }, [data, activeFilter, inventoryFilter.appliedFilters, search, employees]);

  const sortedFiltered = useMemo(() => {
    if (!sortKey || sortDir === "default") return filtered;
    return [...filtered].sort((a, b) => {
      const aVal =
        sortKey === "status"
          ? (STATUS_ORDER[a.status] ?? 0)
          : sortKey === "assigneeName"
            ? normalizeValue(
                employees.find((e) => e.id === a.assigneeId)?.name ??
                  a.assigneeName,
              )
            : normalizeValue(a[sortKey]);
      const bVal =
        sortKey === "status"
          ? (STATUS_ORDER[b.status] ?? 0)
          : sortKey === "assigneeName"
            ? normalizeValue(
                employees.find((e) => e.id === b.assigneeId)?.name ??
                  b.assigneeName,
              )
            : normalizeValue(b[sortKey]);
      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : aVal < bVal
            ? -1
            : aVal > bVal
              ? 1
              : 0;
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir, employees]);

  const handleSort = useCallback(
    (key: InventorySortKey) => {
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

  const renderTableHead = useCallback(
    () => (
      <thead>
        <tr>
          {TABLE_HEADERS.map(({ label, key }) => (
            <th
              key={key}
              onClick={() => handleSort(key)}
              style={{
                color: theme.subtext,
                borderColor: theme.border,
                backgroundColor: theme.surfaceRaised,
                position: "sticky",
                top: 0,
                zIndex: 10,
              }}
              className="px-3 py-1 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap border-b cursor-pointer select-none transition-colors"
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

  const renderTableBody = useCallback(
    (items: ITInventory[]) =>
      items.map((item, index) => (
        <tr
          key={item.assetTag}
          style={{
            backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <td className="px-3 py-1 min-w-[130px]">
            <button
              type="button"
              onDoubleClick={() => handleEdit(item)}
              className="text-left w-full"
            >
              <p
                style={{ color: theme.text }}
                className="text-sm font-medium transition-opacity hover:opacity-70"
              >
                {item.assetTag}
              </p>
            </button>
          </td>

          <td className="text-sm px-3 py-1 min-w-[110px]">
            <BadgeSelect
              value={item.company}
              displayName={item.company || "—"}
              options={[{ label: "—", value: "" }, ...companyOptions]}
              placeholder="—"
              onChange={(val) =>
                handleFieldUpdate(item.assetTag, "company", val)
              }
            />
          </td>

          <td className="px-3 py-1 min-w-[140px]">
            <span style={{ color: theme.text }} className="text-sm">
              {item.serialNumber || "—"}
            </span>
          </td>
          <td className="px-3 py-1 min-w-[110px]">
            <span style={{ color: theme.text }} className="text-sm">
              {item.model || "—"}
            </span>
          </td>
          <td className="px-3 py-1 min-w-[110px]">
            <span style={{ color: theme.text }} className="text-sm">
              {item.brand || "—"}
            </span>
          </td>

          <td className="px-3 py-1 min-w-[160px]">
            <BadgeSelect
              value={item.category}
              displayName={item.category || "—"}
              options={[{ label: "—", value: "" }, ...categoryOptions]}
              placeholder="—"
              onChange={(val) =>
                handleFieldUpdate(item.assetTag, "category", val)
              }
            />
          </td>

          <td className="px-3 py-1 min-w-[120px]">
            <BadgeSelect
              value={item.status}
              displayName={item.status || "—"}
              options={[{ label: "—", value: "" }, ...statusOptions]}
              placeholder="—"
              onChange={(val) =>
                handleFieldUpdate(item.assetTag, "status", val)
              }
            />
          </td>

          <td className="px-3 py-1 min-w-[140px]">
            <SearchableSelect
              value={item.assigneeId ?? ""}
              displayName={
                employees.find((e) => e.id === item.assigneeId)?.name ??
                item.assigneeName ??
                "Unassigned"
              }
              options={assigneeOptions}
              placeholder="Unassigned"
              onChange={async (value) => {
                await handleAssigneeChange(item.assetTag, value);
              }}
            />
          </td>

          <td className="px-3 py-1 min-w-[120px]">
            <BadgeSelect
              value={item.location}
              displayName={item.location || "—"}
              options={[{ label: "—", value: "" }, ...locationOptions]}
              placeholder="—"
              onChange={(val) =>
                handleFieldUpdate(item.assetTag, "location", val)
              }
            />
          </td>

          <td className="px-3 py-1 min-w-[130px]">
            <input
              type="date"
              value={toDateString(item.datePurchased)}
              onChange={(e) =>
                handleFieldUpdate(
                  item.assetTag,
                  "datePurchased",
                  e.target.value,
                )
              }
              onClick={(e) => (e.target as HTMLInputElement).showPicker()}
              style={{ color: theme.text, colorScheme: theme.mode }}
              className="text-sm bg-transparent border-none outline-none cursor-pointer w-full"
            />
          </td>

          <td className="px-3 py-1 min-w-[200px]">
            {editingNoteTag === item.assetTag ? (
              <input
                type="text"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                autoFocus
                placeholder="Notes"
                style={{
                  backgroundColor: theme.inputBg,
                  borderColor: theme.inputBorder,
                  color: theme.inputText,
                }}
                className="w-full px-2 py-1.5 text-xs border rounded-md focus:outline-none"
                onFocus={(e) =>
                  (e.currentTarget.style.borderColor = theme.inputBorderFocus)
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  else if (e.key === "Escape") setEditingNoteTag(null);
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = theme.inputBorder;
                  if (draftNote !== (item.notes ?? ""))
                    handleFieldUpdate(item.assetTag, "notes", draftNote);
                  setEditingNoteTag(null);
                }}
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => {
                  setEditingNoteTag(item.assetTag);
                  setDraftNote(item.notes ?? "");
                }}
                className="text-left w-full"
                title="Double-click to edit"
              >
                <span
                  style={{ color: theme.text }}
                  className="text-xs line-clamp-2"
                >
                  {item.notes || "—"}
                </span>
              </button>
            )}
          </td>
        </tr>
      )),
    [
      theme,
      employees,
      assigneeOptions,
      editingNoteTag,
      draftNote,
      handleFieldUpdate,
      handleAssigneeChange,
      handleEdit,
      categoryOptions,
      statusOptions,
      companyOptions,
      locationOptions,
    ],
  );

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 style={{ color: theme.text }} className="text-2xl font-bold">
              IT Inventory
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              View and manage all IT equipment stock
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              {sortedFiltered.length} of {data.length} records
            </p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setAuditModal({})}
              style={{
                borderColor: theme.border,
                color: theme.text,
                backgroundColor: theme.surface,
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap"
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
                borderColor: theme.border,
                color: theme.text,
                backgroundColor: theme.surface,
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg border transition-colors whitespace-nowrap"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.bgHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.surface)
              }
            >
              Manage Columns
            </button>

            <button
              onClick={() => setAddVisible(true)}
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryText,
              }}
              className="px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.primaryHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.primary)
              }
            >
              + Add Asset
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1">
            <div className="relative w-full max-w-md">
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
                placeholder="Search asset tag, brand, model..."
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

          <TableFilterButton
            btnRef={inventoryFilter.filterBtnRef}
            onClick={inventoryFilter.handleFilterButtonClick}
            activeCount={inventoryFilter.activeCount}
            hasActive={inventoryFilter.hasActive()}
          />
        </div>

        {activeFilter && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span style={{ color: theme.subtext }} className="text-xs">
              Filtered by:
            </span>
            <div
              style={{
                backgroundColor: theme.primarySubtle,
                color: theme.primarySubtleText,
              }}
              className="flex items-center gap-2 px-3 py-1 rounded-full"
            >
              <span className="text-xs font-medium">
                {activeFilter.field}: {activeFilter.value}
              </span>
              <button
                type="button"
                onClick={() => setActiveFilter(null)}
                className="text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <span style={{ color: theme.subtext }} className="text-xs">
              {filtered.length} result{filtered.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
      </div>

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
            No inventory records found.
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
              {renderTableHead()}
              <tbody>{renderTableBody(sortedFiltered)}</tbody>
            </table>
          </div>
        </div>
      )}

      <TableFilterPanel
        visible={inventoryFilter.filterPanelVisible}
        config={{
          fields: [
            { key: "category", label: "Category", options: categoryOptions },
            { key: "status", label: "Status", options: statusOptions },
            { key: "company", label: "Company", options: companyOptions },
            { key: "location", label: "Location", options: locationOptions },
          ],
          showDateRange: true,
          dateLabel: "Date Purchased",
        }}
        pendingFilters={inventoryFilter.pendingFilters}
        setPendingFilters={inventoryFilter.setPendingFilters}
        onFilterChange={(updated) => inventoryFilter.setAppliedFilters(updated)}
        onClear={inventoryFilter.handleClear}
        onClose={() => inventoryFilter.setFilterPanelVisible(false)}
        panelPos={inventoryFilter.filterPanelPos}
      />

      <AddAssetModal
        visible={addVisible}
        onClose={() => setAddVisible(false)}
        onSuccess={fetchData}
        dropdownOptions={{
          category: categoryOptions,
          status: statusOptions,
          company: companyOptions,
          location: locationOptions,
        }}
      />
      <EditAssetModal
        visible={editVisible}
        onClose={() => setEditVisible(false)}
        onSuccess={fetchData}
        selectedAsset={selectedAsset}
        onDelete={handleDelete}
        employees={employees}
        user={user}
        dropdownOptions={{
          category: categoryOptions,
          status: statusOptions,
          company: companyOptions,
          location: locationOptions,
        }}
      />

      <ManageColumnsModal
        visible={manageColumnsVisible}
        onClose={() => setManageColumnsVisible(false)}
        columns={manageColumnsConfig}
        onSave={handleManageColumnsSave}
      />

      <AuditTrailModal
        visible={auditModal !== null}
        onClose={() => setAuditModal(null)}
        table="inventory"
        recordId={auditModal?.recordId}
        recordLabel={auditModal?.recordLabel}
      />
    </div>
  );
};

export default ITInventoryPage;
