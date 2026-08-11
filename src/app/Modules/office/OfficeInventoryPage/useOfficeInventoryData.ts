import { useCallback, useEffect, useMemo, useState } from "react";
import { OfficeCategory, OfficeInventoryItem, StockStatus } from "../../../../../types";
import {
  archiveInventoryItem,
  restoreInventoryItem,
  deleteInventoryItemPermanently,
  getAllInventoryItems,
  toggleItemRestriction,
} from "../../../../services/Officeinventory";

// ─── Shared option/lookup tables ───────────────────────────────────────────

export const CATEGORY_OPTIONS = [
  { label: "Office Supplies", value: "office_supplies", bgColor: "#dbeafe", textColor: "#1e40af" },
  { label: "Cleaning", value: "cleaning", bgColor: "#ede9fe", textColor: "#5b21b6" },
  { label: "PPE", value: "ppe", bgColor: "#fce7f3", textColor: "#9d174d" },
  { label: "Medicine", value: "medicine", bgColor: "#ccfbf1", textColor: "#115e59" },
];

export const STATUS_FILTER_OPTIONS = [
  { label: "In Stock", value: "in_stock", bgColor: "#dcfce7", textColor: "#166534" },
  { label: "Low Stock", value: "low_stock", bgColor: "#fef3c7", textColor: "#92400e" },
  { label: "Out of Stock", value: "out_of_stock", bgColor: "#fee2e2", textColor: "#991b1b" },
];

export const RESTRICTION_FILTER_OPTIONS = [
  { label: "Restricted", value: "restricted", bgColor: "#f1f5f9", textColor: "#334155" },
  { label: "Unrestricted", value: "unrestricted", bgColor: "#dcfce7", textColor: "#166534" },
];

export const CATEGORY_LABELS: Record<OfficeCategory, string> = {
  office_supplies: "Office Supplies",
  cleaning: "Cleaning",
  ppe: "PPE",
  medicine: "Medicine",
  pantry: "Pantry",
};

export type CategoryTab = "all" | OfficeCategory;

export const CATEGORY_TABS: { label: string; value: CategoryTab }[] = [
  { label: "All", value: "all" },
  { label: "Office Supplies", value: "office_supplies" },
  { label: "Cleaning", value: "cleaning" },
  { label: "PPE", value: "ppe" },
  { label: "Medicine", value: "medicine" },
  { label: "Pantry", value: "pantry" },
];

export type SortDir = "asc" | "desc" | "default";

export type InventorySortKey =
  | "itemCode"
  | "name"
  | "brand"
  | "category"
  | "unit"
  | "currentStock"
  | "stockStatus"
  | "pricePerUnit";

export const STATUS_ORDER: Record<StockStatus, number> = {
  in_stock: 0,
  low_stock: 1,
  out_of_stock: 2,
};

export function cycleDir(current: SortDir): SortDir {
  if (current === "default") return "asc";
  if (current === "asc") return "desc";
  return "default";
}

export const TABLE_HEADERS: { label: string; key: InventorySortKey }[] = [
  { label: "Item Code", key: "itemCode" },
  { label: "Item Name", key: "name" },
  { label: "Brand", key: "brand" },
  { label: "Unit", key: "unit" },
  { label: "Stock", key: "currentStock" },
  { label: "Status", key: "stockStatus" },
  { label: "Price/Unit", key: "pricePerUnit" },
];

export const normalizeValue = (value: any) => {
  if (value == null) return "";
  if (typeof value === "number") return value;
  return String(value).toLowerCase();
};

export const formatPeso = (amount: number) =>
  `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;

export const STOCK_STATUS_STYLE: Record<
  StockStatus,
  { bg: string; text: string; dot: string; label: string }
> = {
  in_stock: { bg: "#dcfce7", text: "#166534", dot: "#22c55e", label: "In Stock" },
  low_stock: { bg: "#fef3c7", text: "#92400e", dot: "#f59e0b", label: "Low Stock" },
  out_of_stock: { bg: "#fee2e2", text: "#991b1b", dot: "#ef4444", label: "Out of Stock" },
};

export type InventoryFilter = {
  field: keyof OfficeInventoryItem;
  value: string;
} | null;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOfficeInventoryData({
  initialFilter = null,
  initialDeliverItem = null,
  onDeliverModalOpened,
}: {
  initialFilter?: InventoryFilter;
  initialDeliverItem?: OfficeInventoryItem | null;
  onDeliverModalOpened?: () => void;
}) {
  const [data, setData] = useState<OfficeInventoryItem[]>([]);
  const [archivedData, setArchivedData] = useState<OfficeInventoryItem[]>([]);
  const [viewMode, setViewMode] = useState<"active" | "archived">("active");
  const [loading, setLoading] = useState(true);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<InventoryFilter>(initialFilter);
  const [activeTab, setActiveTab] = useState<CategoryTab>("all");
  const [sortKey, setSortKey] = useState<InventorySortKey | null>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [addVisible, setAddVisible] = useState(false);
  const [editTarget, setEditTarget] = useState<OfficeInventoryItem | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<OfficeInventoryItem | null>(null);
  const [deliverTarget, setDeliverTarget] = useState<OfficeInventoryItem | null>(null);
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [deliverModalOpen, setDeliverModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<OfficeInventoryItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [restrictTarget, setRestrictTarget] = useState<OfficeInventoryItem | null>(null);
  const [restricting, setRestricting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getAllInventoryItems();
      setData(result);
    } catch (err) {
      console.error("Unable to load office inventory", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchArchivedData = useCallback(async () => {
    setArchivedLoading(true);
    try {
      const result = await getAllInventoryItems(true);
      setArchivedData(result.filter((item) => !item.isActive));
    } catch (err) {
      console.error("Unable to load archived inventory", err);
    } finally {
      setArchivedLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (viewMode === "archived") fetchArchivedData();
  }, [viewMode, fetchArchivedData]);

  useEffect(() => {
    if (initialDeliverItem && !loading && data.length > 0) {
      const freshItem =
        data.find((d) => d.id === initialDeliverItem.id) ?? initialDeliverItem;
      setDeliverTarget(freshItem);
      setDeliverModalOpen(true);
      onDeliverModalOpened?.();
    }
  }, [initialDeliverItem, loading, data]);

  const handleArchive = useCallback(
    async (id: string) => {
      await archiveInventoryItem(id);
      fetchData();
    },
    [fetchData],
  );

  const handleRestore = useCallback(
    async (id: string) => {
      try {
        await restoreInventoryItem(id);
        await fetchArchivedData();
        await fetchData();
      } catch (err) {
        console.error("Unable to restore item", err);
      }
    },
    [fetchArchivedData, fetchData],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInventoryItemPermanently(deleteTarget.id);
      setDeleteTarget(null);
      await fetchArchivedData();
    } catch (err) {
      console.error("Unable to delete item", err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, fetchArchivedData]);

  const applyRestrictionToggle = useCallback(
    async (item: OfficeInventoryItem, nextRestricted: boolean) => {
      setData((prev) =>
        prev.map((row) =>
          row.id === item.id ? { ...row, isRestricted: nextRestricted } : row,
        ),
      );
      try {
        await toggleItemRestriction(item.id, nextRestricted);
      } catch (err) {
        console.error("Unable to update item restriction", err);
        setData((prev) =>
          prev.map((row) =>
            row.id === item.id ? { ...row, isRestricted: item.isRestricted } : row,
          ),
        );
      }
    },
    [],
  );

  const handleToggleRestriction = useCallback(
    (item: OfficeInventoryItem) => {
      if (item.isRestricted) {
        applyRestrictionToggle(item, false);
      } else {
        setRestrictTarget(item);
      }
    },
    [applyRestrictionToggle],
  );

  const handleConfirmRestrict = useCallback(async () => {
    if (!restrictTarget) return;
    setRestricting(true);
    try {
      await applyRestrictionToggle(restrictTarget, true);
    } finally {
      setRestricting(false);
      setRestrictTarget(null);
    }
  }, [restrictTarget, applyRestrictionToggle]);

  const dirFor = (key: InventorySortKey): SortDir => (sortKey === key ? sortDir : "default");

  const sourceData = viewMode === "archived" ? archivedData : data;

  const preTabFiltered = useMemo(() => {
    const q = search.toLowerCase().trim();

    let result = activeFilter
      ? sourceData.filter((item) => (item[activeFilter.field] ?? "") === activeFilter.value)
      : sourceData;

    // NOTE: this hook intentionally does NOT run inventoryFilter.applyToData
    // (the TableFilterPanel status/restriction filter) — that lives in the
    // web-only useTableFilter hook tied to the filter-panel UI component.
    // The web page composes its own filtering on top of preTabFiltered by
    // passing appliedFilters through; native can do the same or skip the
    // panel entirely and filter status/restriction inline.

    if (!q) return result;
    return result.filter((item) =>
      [item.itemCode, item.name, item.brand, CATEGORY_LABELS[item.category]]
        .map((v) => (v ?? "").toString().toLowerCase())
        .some((v) => v.includes(q)),
    );
  }, [sourceData, activeFilter, search]);

  const tabCounts = useMemo(() => {
    const counts: Record<CategoryTab, number> = {
      all: preTabFiltered.length,
      office_supplies: 0,
      cleaning: 0,
      ppe: 0,
      medicine: 0,
      pantry: 0,
    };
    preTabFiltered.forEach((item) => {
      if (item.category in counts) counts[item.category as OfficeCategory]++;
    });
    return counts;
  }, [preTabFiltered]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return preTabFiltered;
    return preTabFiltered.filter((item) => item.category === activeTab);
  }, [preTabFiltered, activeTab]);

  const sortedFiltered = useMemo(() => {
    if (!sortKey || sortDir === "default") return filtered;
    return [...filtered].sort((a, b) => {
      const aVal = sortKey === "stockStatus" ? STATUS_ORDER[a.stockStatus] : normalizeValue(a[sortKey]);
      const bVal = sortKey === "stockStatus" ? STATUS_ORDER[b.stockStatus] : normalizeValue(b[sortKey]);
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
  }, [filtered, sortKey, sortDir]);

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

  return {
    data, archivedData, viewMode, setViewMode,
    loading, archivedLoading,
    search, setSearch,
    activeFilter, setActiveFilter,
    activeTab, setActiveTab,
    sortKey, sortDir, dirFor, handleSort,
    addVisible, setAddVisible,
    editTarget, setEditTarget,
    adjustTarget, setAdjustTarget,
    deliverTarget, setDeliverTarget,
    adjustModalOpen, setAdjustModalOpen,
    deliverModalOpen, setDeliverModalOpen,
    deleteTarget, setDeleteTarget,
    deleting,
    restrictTarget, setRestrictTarget,
    restricting,
    fetchData, fetchArchivedData,
    handleArchive, handleRestore, handleConfirmDelete,
    handleToggleRestriction, handleConfirmRestrict,
    tabCounts, sortedFiltered,
  };
}