import React, { useCallback, useState } from "react";
import { OfficeInventoryItem, StockStatus } from "../../../../../types";
import { useTheme } from "../../../../theme/ThemeContext";
import {
  TableFilterButton,
  TableFilterPanel,
  useTableFilter,
} from "../../../../components/common/TableFilterPanel";
import AddDeliveryModal from "../Modal/AddDeliveryModal";
import AddItemModal from "../Modal/AddItemModal";
import AdjustStockModal from "../Modal/AdjustStockModal";
import EditItemModal from "../Modal/EditItemModal";
import {
  useOfficeInventoryData,
  CATEGORY_TABS,
  STATUS_FILTER_OPTIONS,
  RESTRICTION_FILTER_OPTIONS,
  TABLE_HEADERS,
  formatPeso,
  STOCK_STATUS_STYLE,
  type InventoryFilter,
  type InventorySortKey,
  type SortDir,
} from "./useOfficeInventoryData";

// ─── Sort icon ──────────────────────────────────────────────────────────

const SortIcon = ({ dir }: { dir: SortDir }) => {
  if (dir === "asc") return <span className="ml-1 text-blue-500">▲</span>;
  if (dir === "desc") return <span className="ml-1 text-blue-500">▼</span>;
  return <span className="ml-1 text-gray-300">▲▼</span>;
};

// ─── Status badge ───────────────────────────────────────────────────────

const StockStatusBadge = ({ status }: { status: StockStatus }) => {
  const s = STOCK_STATUS_STYLE[status];
  return (
    <span
      style={{ backgroundColor: s.bg, color: s.text }}
      className="inline-flex items-center gap-1.5 min-w-[100px] justify-center px-2 py-1 rounded-lg text-xs font-medium whitespace-nowrap"
    >
      <span
        style={{
          backgroundColor: s.dot,
          width: 6,
          height: 6,
          borderRadius: "50%",
        }}
      />
      {s.label}
    </span>
  );
};

// ─── Small inline icon buttons ─────────────────────────────────────────

const IconBtn = ({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) => {
  const { theme } = useTheme();
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        borderColor: theme.border,
        color: theme.text,
        opacity: disabled ? 0.35 : 1,
      }}
      className="w-7 h-7 flex items-center justify-center rounded-md border transition-colors"
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.backgroundColor = theme.bgHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      {children}
    </button>
  );
};

const MinusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" d="M5 12h14" />
  </svg>
);
const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" d="M12 5v14M5 12h14" />
  </svg>
);
const EditIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11 4h4M16.5 3.5a1.5 1.5 0 0 1 2.12 2.12L8 16.25 4 17l.75-4L15.38 2.38a1.5 1.5 0 0 1 1.12-.38z"
    />
  </svg>
);
const TrashIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M9 7V4h6v3m-7 0 1 13h8l1-13" />
  </svg>
);
const RestoreIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
  </svg>
);
const LockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <rect x="4" y="10" width="16" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V7a4 4 0 0 1 8 0v3" />
  </svg>
);
const UnlockIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
    <rect x="4" y="10" width="16" height="10" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10V7a4 4 0 0 1 7.5-2" />
  </svg>
);

// ─── Delete confirmation modal ─────────────────────────────────────────

function DeleteConfirmModal({
  visible,
  itemName,
  onCancel,
  onConfirm,
  submitting,
  theme,
}: {
  visible: boolean;
  itemName: string;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  theme: any;
}) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="w-full max-w-sm rounded-xl border p-5"
      >
        <h3 style={{ color: theme.text }} className="text-sm font-semibold mb-1">
          Permanently delete "{itemName}"?
        </h3>
        <p style={{ color: theme.subtext }} className="text-xs mb-4">
          This cannot be undone. The item will be removed from inventory for
          good — its transaction history will stay in the Activity log, but it
          can no longer be restored.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{ backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }}
            className="px-3 py-2 text-sm font-medium rounded-lg border"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            style={{ backgroundColor: "#E11D48", color: "#fff", opacity: submitting ? 0.6 : 1 }}
            className="px-3 py-2 text-sm font-medium rounded-lg"
          >
            {submitting ? "Deleting…" : "Delete permanently"}
          </button>
        </div>
      </div>
    </div>
  );
}

function RestrictConfirmModal({
  visible,
  itemName,
  onCancel,
  onConfirm,
  submitting,
  theme,
}: {
  visible: boolean;
  itemName: string;
  onCancel: () => void;
  onConfirm: () => void;
  submitting: boolean;
  theme: any;
}) {
  if (!visible) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="w-full max-w-sm rounded-xl border p-5"
      >
        <h3 style={{ color: theme.text }} className="text-sm font-semibold mb-1">
          Restrict "{itemName}"?
        </h3>
        <p style={{ color: theme.subtext }} className="text-xs mb-4">
          This item will be hidden from employees — only admins and
          superadmins will be able to see or request it. You can unrestrict it
          again at any time.
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{ backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }}
            className="px-3 py-2 text-sm font-medium rounded-lg border"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            style={{ backgroundColor: "#D97706", color: "#fff", opacity: submitting ? 0.6 : 1 }}
            className="px-3 py-2 text-sm font-medium rounded-lg"
          >
            {submitting ? "Restricting…" : "Restrict item"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────

type Props = {
  initialFilter?: InventoryFilter;
  isSuperAdmin?: boolean;
  initialDeliverItem?: OfficeInventoryItem | null;
  onDeliverModalOpened?: () => void;
};

const OfficeInventoryPage: React.FC<Props> = ({
  initialFilter = null,
  isSuperAdmin = false,
  initialDeliverItem = null,
  onDeliverModalOpened,
}) => {
  const { theme } = useTheme();

  const inventoryFilter = useTableFilter({
    fields: [
      { key: "stockStatus", label: "Status", options: STATUS_FILTER_OPTIONS },
      { key: "restrictionStatus", label: "Access", options: RESTRICTION_FILTER_OPTIONS },
    ],
    showDateRange: false,
  });

  const {
    data, viewMode, setViewMode,
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
    fetchData,
    handleRestore, handleConfirmDelete,
    handleToggleRestriction, handleConfirmRestrict,
    tabCounts, sortedFiltered,
  } = useOfficeInventoryData({ initialFilter, initialDeliverItem, onDeliverModalOpened });

  const renderTableHead = useCallback(
    () => (
      <thead>
        <tr>
          {TABLE_HEADERS.map(({ label, key }) => (
            <th
              key={key}
              onClick={() => handleSort(key as InventorySortKey)}
              style={{
                color: theme.subtext,
                borderBottom: `1px solid ${theme.border}`,
                backgroundColor: theme.surfaceRaised,
                position: "sticky",
                top: 0,
                zIndex: 10,
                boxShadow: `0 1px 0 ${theme.border}`,
              }}
              className="px-3 py-1 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap cursor-pointer select-none transition-colors"
              onMouseEnter={(e) => (e.currentTarget.style.color = theme.text)}
              onMouseLeave={(e) => (e.currentTarget.style.color = theme.subtext)}
            >
              <span className="inline-flex items-center gap-1">
                {label}
                <SortIcon dir={dirFor(key as InventorySortKey)} />
              </span>
            </th>
          ))}
          <th
            style={{
              color: theme.subtext,
              borderBottom: `1px solid ${theme.border}`,
              backgroundColor: theme.surfaceRaised,
              position: "sticky",
              top: 0,
              zIndex: 10,
              boxShadow: `0 1px 0 ${theme.border}`,
            }}
            className="px-3 py-1 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap"
          >
            Actions
          </th>
        </tr>
      </thead>
    ),
    [theme, sortKey, sortDir, handleSort, dirFor],
  );

  const renderTableBody = useCallback(
    (rowItems: OfficeInventoryItem[]) =>
      rowItems.map((item, index) => (
        <tr
          key={item.id}
          style={{
            backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <td className="px-3 py-1.5 min-w-[90px]">
            <span style={{ color: theme.subtext }} className="text-xs">{item.itemCode}</span>
          </td>
          <td className="px-3 py-1.5 min-w-[160px]">
            <span style={{ color: theme.text }} className="text-sm font-medium">{item.name}</span>
            {item.isRestricted && (
              <span title="Restricted to admin/superadmin" style={{ color: theme.subtext, marginLeft: 6 }}>
                <LockIcon />
              </span>
            )}
          </td>
          <td className="px-3 py-1.5 min-w-[110px]">
            <span style={{ color: theme.text }} className="text-sm">{item.brand || "—"}</span>
          </td>
          <td className="px-3 py-1.5 min-w-[80px]">
            <span style={{ color: theme.subtext }} className="text-sm">{item.unit}</span>
          </td>
          <td className="px-3 py-1.5 min-w-[70px]">
            <span
              style={{
                color:
                  item.stockStatus === "out_of_stock"
                    ? "#ef4444"
                    : item.stockStatus === "low_stock"
                      ? "#f59e0b"
                      : theme.text,
              }}
              className="text-sm font-semibold"
            >
              {item.currentStock}
            </span>
          </td>
          <td className="px-3 py-1.5 min-w-[120px]">
            <StockStatusBadge status={item.stockStatus} />
          </td>
          <td className="px-3 py-1.5 min-w-[100px]">
            <span style={{ color: theme.text }} className="text-sm">{formatPeso(item.pricePerUnit)}</span>
          </td>
          <td className="px-3 py-1.5 min-w-[170px]">
            <div className="flex gap-1.5">
              {viewMode === "archived" ? (
                <>
                  <IconBtn title="Restore item" onClick={() => handleRestore(item.id)}>
                    <RestoreIcon />
                  </IconBtn>
                  <IconBtn title="Delete permanently" onClick={() => setDeleteTarget(item)}>
                    <TrashIcon />
                  </IconBtn>
                </>
              ) : (
                <>
                  <IconBtn
                    title="Adjust stock"
                    disabled={item.currentStock === 0}
                    onClick={() => {
                      setAdjustTarget(item);
                      setAdjustModalOpen(true);
                    }}
                  >
                    <MinusIcon />
                  </IconBtn>
                  <IconBtn
                    title="Add delivery"
                    onClick={() => {
                      setDeliverTarget(item);
                      setDeliverModalOpen(true);
                    }}
                  >
                    <PlusIcon />
                  </IconBtn>
                  <IconBtn title="Edit item" onClick={() => setEditTarget(item)}>
                    <EditIcon />
                  </IconBtn>
                  <IconBtn
                    title={item.isRestricted ? "Unrestrict — visible to employees" : "Restrict — admin/superadmin only"}
                    onClick={() => handleToggleRestriction(item)}
                  >
                    {item.isRestricted ? <UnlockIcon /> : <LockIcon />}
                  </IconBtn>
                </>
              )}
            </div>
          </td>
        </tr>
      )),
    [theme, viewMode, handleRestore, handleToggleRestriction, setAdjustTarget, setAdjustModalOpen, setDeliverTarget, setDeliverModalOpen, setEditTarget, setDeleteTarget],
  );

  const renderMobileCards = useCallback(
    (rowItems: OfficeInventoryItem[]) =>
      rowItems.map((item) => (
        <div
          key={item.id}
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
          className="rounded-xl border p-3 mb-3"
        >
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <div className="min-w-0">
              <p style={{ color: theme.text }} className="text-sm font-semibold truncate">{item.name}</p>
              <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
                <span style={{ color: theme.primary }}>{item.itemCode}</span>
                {item.brand ? ` · ${item.brand}` : ""}
              </p>
            </div>
            <StockStatusBadge status={item.stockStatus} />
          </div>

          <div className="flex items-center justify-between mt-2">
            <div className="flex items-baseline gap-1.5">
              <span
                style={{
                  color:
                    item.stockStatus === "out_of_stock"
                      ? "#ef4444"
                      : item.stockStatus === "low_stock"
                        ? "#f59e0b"
                        : theme.text,
                }}
                className="text-lg font-bold"
              >
                {item.currentStock}
              </span>
              <span style={{ color: theme.subtext }} className="text-xs">
                {item.unit} · {formatPeso(item.pricePerUnit)}
              </span>
            </div>

            <div className="flex gap-1.5">
              {viewMode === "archived" ? (
                <>
                  <IconBtn title="Restore item" onClick={() => handleRestore(item.id)}>
                    <RestoreIcon />
                  </IconBtn>
                  <IconBtn title="Delete permanently" onClick={() => setDeleteTarget(item)}>
                    <TrashIcon />
                  </IconBtn>
                </>
              ) : (
                <>
                  <IconBtn
                    title="Adjust stock"
                    disabled={item.currentStock === 0}
                    onClick={() => {
                      setAdjustTarget(item);
                      setAdjustModalOpen(true);
                    }}
                  >
                    <MinusIcon />
                  </IconBtn>
                  <IconBtn
                    title="Add delivery"
                    onClick={() => {
                      setDeliverTarget(item);
                      setDeliverModalOpen(true);
                    }}
                  >
                    <PlusIcon />
                  </IconBtn>
                  <IconBtn title="Edit item" onClick={() => setEditTarget(item)}>
                    <EditIcon />
                  </IconBtn>
                  <IconBtn
                    title={item.isRestricted ? "Unrestrict — visible to employees" : "Restrict — admin/superadmin only"}
                    onClick={() => handleToggleRestriction(item)}
                  >
                    {item.isRestricted ? <UnlockIcon /> : <LockIcon />}
                  </IconBtn>
                </>
              )}
            </div>
          </div>
        </div>
      )),
    [theme, viewMode, handleRestore, handleToggleRestriction, setAdjustTarget, setAdjustModalOpen, setDeliverTarget, setDeliverModalOpen, setEditTarget, setDeleteTarget],
  );

  return (
    <div style={{ backgroundColor: theme.background }} className="flex flex-col h-full overflow-hidden">
      {/* ── Fixed top bar ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <h1 style={{ color: theme.text }} className="text-2xl font-bold">
              Office Inventory{viewMode === "archived" ? " · Archived" : ""}
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Track consumable stock — supplies, cleaning, PPE, and medicine
            </p>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              {sortedFiltered.length} of {data.length} items
            </p>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {viewMode === "active" && (
              <>
                <button
                  onClick={() => {
                    setDeliverTarget(null);
                    setDeliverModalOpen(true);
                  }}
                  style={{ backgroundColor: theme.surface, color: theme.text, borderColor: theme.border }}
                  className="flex-1 sm:flex-initial px-3 py-2 text-sm font-medium rounded-lg border whitespace-nowrap"
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.surface)}
                >
                  + Add Delivery
                </button>

                <button
                  onClick={() => setAddVisible(true)}
                  style={{ backgroundColor: theme.primary, color: theme.primaryText }}
                  className="flex-1 sm:flex-initial px-4 py-2 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.primaryHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = theme.primary)}
                >
                  + Add Item
                </button>
              </>
            )}
          </div>
        </div>

        {/* Row 2: Search + filter */}
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
                placeholder="Search item code, name, brand..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }}
                className="w-full px-4 py-2.5 pl-9 text-sm border rounded-lg focus:outline-none"
                onFocus={(e) => (e.currentTarget.style.borderColor = theme.inputBorderFocus)}
                onBlur={(e) => (e.currentTarget.style.borderColor = theme.inputBorder)}
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
            <span style={{ color: theme.subtext }} className="text-xs">Filtered by:</span>
            <div
              style={{ backgroundColor: theme.primarySubtle, color: theme.primarySubtleText }}
              className="flex items-center gap-2 px-3 py-1 rounded-full"
            >
              <span className="text-xs font-medium">
                {String(activeFilter.field)}: {activeFilter.value}
              </span>
              <button type="button" onClick={() => setActiveFilter(null)} className="text-xs font-bold">
                ✕
              </button>
            </div>
          </div>
        )}

        {/* ── Category tabs ── */}
        <div
          style={{ borderBottom: `1px solid ${theme.border}` }}
          className="flex items-end justify-between gap-2 -mb-px overflow-x-auto office-inventory-scroll"
        >
          <div className="flex items-end gap-0 flex-shrink-0">
            {CATEGORY_TABS.map((tab) => {
              const isActive = viewMode === "active" && activeTab === tab.value;
              return (
                <button
                  key={tab.value}
                  type="button"
                  onClick={() => {
                    setViewMode("active");
                    setActiveTab(tab.value);
                  }}
                  style={{
                    color: isActive ? theme.primary : theme.subtext,
                    borderBottom: isActive ? `2px solid ${theme.primary}` : "2px solid transparent",
                    backgroundColor: "transparent",
                  }}
                  className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none flex-shrink-0"
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.color = theme.text;
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) e.currentTarget.style.color = theme.subtext;
                  }}
                >
                  {tab.label}
                  <span
                    style={{
                      backgroundColor: isActive ? theme.primary : theme.inputBg,
                      color: isActive ? theme.primaryText : theme.subtext,
                    }}
                    className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                  >
                    {tabCounts[tab.value]}
                  </span>
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setViewMode("archived")}
            style={{
              color: viewMode === "archived" ? theme.primary : theme.subtext,
              borderBottom: viewMode === "archived" ? `2px solid ${theme.primary}` : "2px solid transparent",
              backgroundColor: "transparent",
            }}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none flex-shrink-0"
            onMouseEnter={(e) => {
              if (viewMode !== "archived") e.currentTarget.style.color = theme.text;
            }}
            onMouseLeave={(e) => {
              if (viewMode !== "archived") e.currentTarget.style.color = theme.subtext;
            }}
          >
            <TrashIcon />
            Archive
          </button>
        </div>
      </div>

      {/* ── Scrollable table ── */}
      <style>{`
        .office-inventory-scroll::-webkit-scrollbar { width: 6px; height: 6px; }
        .office-inventory-scroll::-webkit-scrollbar-track { background: transparent; }
        .office-inventory-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .office-inventory-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
      `}</style>
      {(viewMode === "archived" ? archivedLoading : loading) ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div style={{ borderColor: theme.primary }} className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : sortedFiltered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <p style={{ color: theme.subtext }} className="text-sm">
            {viewMode === "archived" ? "No archived items." : "No inventory items found."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div
            style={{ borderColor: theme.border }}
            className="hidden md:block flex-1 overflow-y-auto overflow-x-auto px-4 pb-4 office-inventory-scroll"
          >
            <table
              className="min-w-full text-sm border rounded-lg"
              style={{ borderCollapse: "separate", borderSpacing: 0, borderColor: theme.border }}
            >
              {renderTableHead()}
              <tbody>{renderTableBody(sortedFiltered)}</tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden flex-1 overflow-y-auto px-4 pb-4 office-inventory-scroll">
            {renderMobileCards(sortedFiltered)}
          </div>
        </>
      )}

      <TableFilterPanel
        visible={inventoryFilter.filterPanelVisible}
        config={{
          fields: [
            { key: "stockStatus", label: "Status", options: STATUS_FILTER_OPTIONS },
            { key: "restrictionStatus", label: "Access", options: RESTRICTION_FILTER_OPTIONS },
          ],
          showDateRange: false,
        }}
        pendingFilters={inventoryFilter.pendingFilters}
        setPendingFilters={inventoryFilter.setPendingFilters}
        onFilterChange={(updated: any) => inventoryFilter.setAppliedFilters(updated)}
        onClear={inventoryFilter.handleClear}
        onClose={() => inventoryFilter.setFilterPanelVisible(false)}
        panelPos={inventoryFilter.filterPanelPos}
      />

      <AddItemModal visible={addVisible} onClose={() => setAddVisible(false)} onSuccess={fetchData} />

      <EditItemModal
        visible={editTarget !== null}
        item={editTarget}
        onClose={() => setEditTarget(null)}
        onSuccess={fetchData}
      />

      <AdjustStockModal
        visible={adjustModalOpen}
        item={adjustTarget}
        items={data}
        onSelectItem={setAdjustTarget}
        onClose={() => {
          setAdjustModalOpen(false);
          setAdjustTarget(null);
        }}
        onSuccess={fetchData}
      />

      <AddDeliveryModal
        visible={deliverModalOpen}
        item={deliverTarget}
        items={data}
        onSelectItem={setDeliverTarget}
        onClose={() => {
          setDeliverModalOpen(false);
          setDeliverTarget(null);
        }}
        onSuccess={fetchData}
      />

      <DeleteConfirmModal
        visible={deleteTarget !== null}
        itemName={deleteTarget?.name ?? ""}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        submitting={deleting}
        theme={theme}
      />

      <RestrictConfirmModal
        visible={restrictTarget !== null}
        itemName={restrictTarget?.name ?? ""}
        onCancel={() => setRestrictTarget(null)}
        onConfirm={handleConfirmRestrict}
        submitting={restricting}
        theme={theme}
      />
    </div>
  );
};

export default OfficeInventoryPage;