import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import { ADUser, SupplyRequest, SupplyRequestStatus } from "../../../../types";
import {
  getAllSupplyRequests,
  approveSupplyRequest,
  approveSupplyRequestPartial,
  rejectSupplyRequest,
  markDelivered,
  markFailedDelivery,
  archiveSupplyRequest,
} from "../../../services/supplyRequest"; // ← new MySQL service
import { getAllInventoryItems } from "../../../services/Officeinventory";
import PartialApprovalModal from "./Modal/PartialApprovalModal";

// ─── Types ────────────────────────────────────────────────────────────────────

type PageTab = "requests" | "deliveries";
type StatusFilter =
  | "all"
  | "pending"
  | "awaiting_stock"
  | "out_for_delivery"
  | "resolved"
  | "failed_delivery"
  | "rejected";
type StockStatus = "available" | "low" | "out_of_stock";

// ─── Status config ────────────────────────────────────────────────────────────

const REQUEST_STATUS_TABS: { label: string; value: StatusFilter }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Awaiting stock", value: "awaiting_stock" },
  { label: "Out for delivery", value: "out_for_delivery" },
  { label: "Issued", value: "resolved" }, // ← changed from "Delivered"
  { label: "Failed", value: "failed_delivery" },
  { label: "Rejected", value: "rejected" },
];

const DELIVERY_STATUS_TABS: {
  label: string;
  value: "all" | "out_for_delivery" | "resolved" | "failed_delivery";
}[] = [
  { label: "All", value: "all" },
  { label: "For delivery", value: "out_for_delivery" },
  { label: "Issued", value: "resolved" },
  { label: "Failed", value: "failed_delivery" },
];


function statusBadgeClass(status: string): string {
  switch (status) {
    case "pending":
      return "bg-sky-100 text-sky-700";
    case "awaiting_stock":
      return "bg-amber-100 text-amber-700";
    case "out_for_delivery":
      return "bg-blue-100 text-blue-700";
    case "resolved":
      return "bg-emerald-100 text-emerald-700";
    case "failed_delivery":
      return "bg-rose-100 text-rose-700";
    case "rejected":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "awaiting_stock":
      return "Awaiting stock";
    case "out_for_delivery":
      return "Out for delivery";
    case "resolved":
      return "Issued"; 
    case "failed_delivery":
      return "Failed delivery";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

function stockBadgeClass(status: StockStatus): string {
  switch (status) {
    case "available":
      return "bg-emerald-100 text-emerald-700";
    case "low":
      return "bg-amber-100 text-amber-700";
    case "out_of_stock":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function stockLabel(status: StockStatus): string {
  switch (status) {
    case "available":
      return "In stock";
    case "low":
      return "Low stock";
    case "out_of_stock":
      return "Out of stock";
    default:
      return status;
  }
}

function worstStockStatus(
  items: SupplyRequest["items"],
  liveStock?: Record<string, StockStatus>,
): StockStatus {
  // Prefer live inventory status when we have it for that item; fall back
  // to the frozen snapshot (stockStatusAtRequest) for items we don't have
  // live data for, so this degrades gracefully if the inventory fetch fails.
  const effective = (i: SupplyRequest["items"][number]): StockStatus =>
    (liveStock?.[i.itemId] as StockStatus) ??
    (i.stockStatusAtRequest as StockStatus);

  if (items.some((i) => effective(i) === "out_of_stock")) return "out_of_stock";
  if (items.some((i) => effective(i) === "low")) return "low";
  return "available";
}

// office_inventory.stock_status uses in_stock/low_stock/out_of_stock;
// supply_request_items.stock_status_at_request uses available/low/out_of_stock.
function toRequestStockStatus(inventoryStockStatus: string): StockStatus {
  switch (inventoryStockStatus) {
    case "in_stock":
      return "available";
    case "low_stock":
      return "low";
    case "out_of_stock":
      return "out_of_stock";
    default:
      return inventoryStockStatus as StockStatus;
  }
}

function getInitials(name: string): string {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 0) return "?";
  return (
    (parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")
  ).toUpperCase();
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

// Once a request has been reviewed (approved/partial), items with
// quantityApproved === 0 were skipped — exclude them so counts/qty reflect
// what's actually being fulfilled/delivered, not the original ask.
function effectiveItems(items: SupplyRequest["items"]) {
  const anyReviewed = items.some(
    (i) => i.quantityApproved !== null && i.quantityApproved !== undefined,
  );
  if (!anyReviewed) return items;
  return items.filter((i) => (i.quantityApproved ?? 0) > 0);
}

function displayQty(item: SupplyRequest["items"][number]): number {
  return item.quantityApproved ?? item.quantityRequested;
}

function itemSummary(items: SupplyRequest["items"]) {
  const active = effectiveItems(items);
  if (active.length === 0)
    return { primaryLabel: "—", extraCount: 0, qtyLabel: "—" };
  const first = active[0];
  return {
    primaryLabel: first.itemName,
    extraCount: active.length - 1,
    qtyLabel:
      active.length === 1
        ? String(displayQty(first))
        : `${active.length} items`,
  };
}

function effectiveStatus(
  r: SupplyRequest,
  liveStock?: Record<string, StockStatus>,
): string {
  if (r.status === "pending" || r.status === "awaiting_stock") {
    return worstStockStatus(r.items, liveStock) === "out_of_stock"
      ? "awaiting_stock"
      : "pending";
  }
  return r.status;
}

// Lower number = shown first. Pending / out for delivery / awaiting stock
// are live, actionable states and keep their own priority tiers. Issued,
// Failed delivery, and Rejected are all "closed" outcomes — they share one
// tier so they interleave with each other purely by date (newest first,
// via the secondary sort in filteredRequests below) instead of clustering
// into three separate status blocks.
const STATUS_SORT_ORDER: Record<string, number> = {
  pending: 0,
  out_for_delivery: 1,
  awaiting_stock: 2,
  resolved: 3,
  failed_delivery: 3,
  rejected: 3,
};

// ─── Reject modal ─────────────────────────────────────────────────────────────

function RejectModal({
  visible,
  ticketNumber,
  onCancel,
  onConfirm,
  submitting,
  theme,
  zIndex = 50,
}: {
  visible: boolean;
  ticketNumber: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  submitting: boolean;
  theme: any;
  zIndex?: number;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);
  if (!visible) return null;
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/40 px-4" style={{ zIndex }}>
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="w-full max-w-sm rounded-xl border p-5"
      >
        <h3
          style={{ color: theme.text }}
          className="text-sm font-semibold mb-1"
        >
          Reject request {ticketNumber}
        </h3>
        <p style={{ color: theme.subtext }} className="text-xs mb-3">
          Let the requester know why this was rejected.
        </p>
        <textarea
          autoFocus
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Item discontinued, please choose an alternative…"
          style={{
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.inputText,
          }}
          className="w-full min-h-[80px] rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.border,
            }}
            className="px-3 py-2 text-sm font-medium rounded-lg border"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={submitting || !reason.trim()}
            style={{
              backgroundColor: "#E11D48",
              color: "#fff",
              opacity: submitting || !reason.trim() ? 0.6 : 1,
            }}
            className="px-3 py-2 text-sm font-medium rounded-lg"
          >
            {submitting ? "Rejecting…" : "Reject request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Failed delivery modal ────────────────────────────────────────────────────

function FailedDeliveryModal({
  visible,
  ticketNumber,
  onCancel,
  onConfirm,
  submitting,
  theme,
}: {
  visible: boolean;
  ticketNumber: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
  submitting: boolean;
  theme: any;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (visible) setReason("");
  }, [visible]);
  if (!visible) return null;

  const QUICK_REASONS = [
    "Requester not available",
    "Wrong location / floor",
    "Requester refused delivery",
    "Item damaged in transit",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="w-full max-w-sm rounded-xl border p-5"
      >
        <h3
          style={{ color: theme.text }}
          className="text-sm font-semibold mb-1"
        >
          Mark delivery failed — {ticketNumber}
        </h3>
        <p style={{ color: theme.subtext }} className="text-xs mb-3">
          Select a reason or type your own. The request will return to the queue
          for re-delivery.
        </p>
        {/* Quick reason pills */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {QUICK_REASONS.map((q) => (
            <button
              key={q}
              onClick={() => setReason(q)}
              style={{
                backgroundColor: reason === q ? theme.primary : theme.inputBg,
                color: reason === q ? theme.primaryText : theme.subtext,
                borderColor: theme.border,
              }}
              className="px-2.5 py-1 text-xs rounded-full border transition-colors"
            >
              {q}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Or describe what happened…"
          style={{
            backgroundColor: theme.inputBg,
            borderColor: theme.inputBorder,
            color: theme.inputText,
          }}
          className="w-full min-h-[70px] rounded-lg border px-3 py-2 text-sm focus:outline-none resize-none"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            disabled={submitting}
            style={{
              backgroundColor: theme.surface,
              color: theme.text,
              borderColor: theme.border,
            }}
            className="px-3 py-2 text-sm font-medium rounded-lg border"
          >
            Cancel
          </button>
          <button
            onClick={() => reason.trim() && onConfirm(reason.trim())}
            disabled={submitting || !reason.trim()}
            style={{
              backgroundColor: "#D97706",
              color: "#fff",
              opacity: submitting || !reason.trim() ? 0.6 : 1,
            }}
            className="px-3 py-2 text-sm font-medium rounded-lg"
          >
            {submitting ? "Saving…" : "Mark as failed"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Detail drawer ────────────────────────────────────────────────────────────

function DetailDrawer({
  request,
  onClose,
  theme,
}: {
  request: SupplyRequest | null;
  onClose: () => void;
  theme: any;
}) {
  if (!request) return null;
  const totalQty = effectiveItems(request.items).reduce(
    (s, i) => s + displayQty(i),
    0,
  );
  const status = effectiveStatus(request);

  const trail = [
    {
      label: "Filed by",
      value: request.requestedByName,
      at: request.createdAt,
    },
    request.approvedByName
      ? {
          label: "Approved by",
          value: request.approvedByName,
          at: request.approvedAt,
        }
      : null,
    request.deliveredByName
      ? {
          label: "Delivered by",
          value: request.deliveredByName,
          at: request.deliveredAt,
        }
      : null,
    request.reviewedByName && request.status === "rejected"
      ? {
          label: "Rejected by",
          value: request.reviewedByName,
          at: request.reviewedAt,
        }
      : null,
  ].filter(Boolean) as { label: string; value: string; at?: string }[];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-stretch justify-center md:justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div
        style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        className="relative w-full md:max-w-md max-h-[85vh] md:max-h-screen md:h-full rounded-t-2xl md:rounded-none md:border-l overflow-y-auto"
      >
        <div
          className="flex items-center justify-between px-4 md:px-5 py-3 md:py-4 border-b sticky top-0 z-10"
          style={{ backgroundColor: theme.surface, borderColor: theme.border }}
        >
          <div className="min-w-0">
            <p
              style={{ color: theme.subtext }}
              className="text-[11px] uppercase tracking-wide"
            >
              Supply request
            </p>
            <h2
              style={{ color: theme.text }}
              className="text-base font-semibold truncate"
            >
              {request.ticketNumber}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ color: theme.subtext, backgroundColor: theme.background }}
            className="w-8 h-8 flex items-center justify-center rounded-full text-xl leading-none flex-shrink-0"
          >
            ×
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Status badge */}
          <span
            className={`inline-flex text-xs font-medium px-2.5 py-1 rounded-full ${statusBadgeClass(status)}`}
          >
            {statusLabel(status)}
          </span>

          {/* Summary */}
          <div
            style={{
              borderColor: theme.border,
              backgroundColor: theme.background,
            }}
            className="rounded-lg border p-4 space-y-0"
          >
            {[
              { label: "Requested by", value: request.requestedByName },
              { label: "Date filed", value: formatDate(request.createdAt) },
              { label: "Total items", value: String(request.items.length) },
              { label: "Total qty", value: String(totalQty) },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                style={{ borderColor: theme.border }}
                className={`flex justify-between items-center py-2 ${i < arr.length - 1 ? "border-b" : ""}`}
              >
                <span style={{ color: theme.subtext }} className="text-xs">
                  {row.label}
                </span>
                <span
                  style={{ color: theme.text }}
                  className="text-xs font-medium"
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Items — only show items that survived approval once reviewed */}
          <div>
            <h3
              style={{ color: theme.text }}
              className="text-sm font-semibold mb-2"
            >
              Items ({effectiveItems(request.items).length})
            </h3>
            <div className="space-y-2">
              {effectiveItems(request.items).map((item, i) => (
                <div
                  key={`${item.itemId}-${i}`}
                  style={{
                    borderColor: theme.border,
                    backgroundColor: theme.background,
                  }}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                >
                  <div>
                    <p
                      style={{ color: theme.text }}
                      className="text-sm font-medium"
                    >
                      {item.itemName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        style={{ color: theme.subtext }}
                        className="text-xs"
                      >
                        {item.itemCode}
                      </span>
                      <span
                        style={{ color: theme.subtext }}
                        className="text-xs"
                      >
                        ·
                      </span>
                      <span
                        className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${stockBadgeClass(item.stockStatusAtRequest as StockStatus)}`}
                      >
                        {stockLabel(item.stockStatusAtRequest as StockStatus)}
                      </span>
                    </div>
                  </div>
                  <span
                    style={{ color: theme.primary }}
                    className="text-sm font-semibold"
                  >
                    ×{displayQty(item)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          {request.notes && (
            <div>
              <h3
                style={{ color: theme.text }}
                className="text-sm font-semibold mb-2"
              >
                Notes
              </h3>
              <p
                style={{
                  color: theme.subtext,
                  borderColor: theme.border,
                  backgroundColor: theme.background,
                }}
                className="text-sm rounded-lg border p-3 leading-relaxed"
              >
                {request.notes}
              </p>
            </div>
          )}

          {/* Rejection reason */}
          {request.status === "rejected" && request.rejectionReason && (
            <div>
              <h3
                style={{ color: theme.text }}
                className="text-sm font-semibold mb-2"
              >
                Rejection reason
              </h3>
              <p className="text-sm rounded-lg border border-rose-200 bg-rose-50 text-rose-700 p-3 leading-relaxed">
                {request.rejectionReason}
              </p>
            </div>
          )}

          {/* Failed delivery reason */}
          {request.status === "failed_delivery" && request.failedReason && (
            <div>
              <h3
                style={{ color: theme.text }}
                className="text-sm font-semibold mb-2"
              >
                Failed delivery reason
              </h3>
              <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-700 p-3 leading-relaxed">
                {request.failedReason}
              </p>
            </div>
          )}

          {/* Activity trail */}
          {trail.length > 0 && (
            <div>
              <h3
                style={{ color: theme.text }}
                className="text-sm font-semibold mb-2"
              >
                Activity
              </h3>
              <div className="space-y-2">
                {trail.map((t, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div
                      style={{ backgroundColor: theme.border }}
                      className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    />
                    <div>
                      <span
                        style={{ color: theme.text }}
                        className="text-xs font-medium"
                      >
                        {t.label}:{" "}
                      </span>
                      <span
                        style={{ color: theme.subtext }}
                        className="text-xs"
                      >
                        {t.value}
                      </span>
                      {t.at && (
                        <p
                          style={{ color: theme.subtext }}
                          className="text-[11px]"
                        >
                          {formatDate(t.at)}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Supply Request row ───────────────────────────────────────────────────────
function RequestRow({
  request,
  index,
  onApprove,
  onReject,
  onView,
  onDeliver,
  onFail,
  onArchive,
  canArchive,
  approvingId,
  liveStock,
  theme,
}: {
  request: SupplyRequest;
  index: number;
  onApprove: (r: SupplyRequest) => void;
  onReject: (r: SupplyRequest) => void;
  onView: (r: SupplyRequest) => void;
  onDeliver: (r: SupplyRequest) => void;
  onFail: (r: SupplyRequest) => void;
  onArchive: (r: SupplyRequest) => void;
  canArchive: boolean;
  approvingId: string | null;
  liveStock?: Record<string, StockStatus>;
  theme: any;
}) {
  const stock = worstStockStatus(request.items, liveStock);
  const status = effectiveStatus(request, liveStock);
  const { primaryLabel, extraCount, qtyLabel } = itemSummary(request.items);
  const isPending =
    request.status === "pending" || request.status === "awaiting_stock";
  const isApproving = approvingId === request.id;

  return (
    <tr
      onClick={() => onView(request)}
      style={{
        backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
        borderBottom: `1px solid ${theme.border}`,
        cursor: "pointer",
      }}
    >
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ color: theme.text }} className="text-sm font-medium">
          #{request.ticketNumber.replace(/^SR-\d+-/, "")}
        </span>
      </td>
      <td className="px-3 py-3 min-w-[150px]">
        <div className="flex items-center gap-2">
          <span
            style={{
              backgroundColor: theme.primary,
              color: theme.primaryText,
              width: 22,
              height: 22,
            }}
            className="flex items-center justify-center rounded-full text-[10px] font-medium flex-shrink-0"
          >
            {getInitials(request.requestedByName)}
          </span>
          <span style={{ color: theme.text }} className="text-sm">
            {request.requestedByName}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 min-w-[180px]">
        <span style={{ color: theme.text }} className="text-sm font-medium">
          {primaryLabel}
        </span>
        {extraCount > 0 && (
          <span style={{ color: theme.subtext }} className="text-xs ml-1.5">
            +{extraCount} more
          </span>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ color: theme.text }} className="text-sm">
          {qtyLabel}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ color: theme.subtext }} className="text-xs">
          {formatDate(request.createdAt)}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${stockBadgeClass(stock)}`}
        >
          {stockLabel(stock)}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusBadgeClass(status)}`}
        >
          {statusLabel(status)}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-right">
        {isPending ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onApprove(request);
              }}
              disabled={isApproving}
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryText,
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
            >
              {isApproving ? "Reviewing…" : "Review"}
            </button>
          </div>
        ) : request.status === "out_for_delivery" ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeliver(request);
              }}
              disabled={isApproving}
              style={{ backgroundColor: "#16a34a", color: "#fff" }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
            >
              {isApproving ? "Saving…" : "✓ Deliver"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFail(request);
              }}
              disabled={isApproving}
              style={{ backgroundColor: "#D97706", color: "#fff" }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
            >
              ✕ Failed
            </button>
          </div>
        ) : (
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onView(request);
              }}
              style={{ borderColor: theme.border, color: theme.text }}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border"
            >
               View
            </button>
            {canArchive && ["resolved", "rejected", "failed_delivery"].includes(request.status) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onArchive(request);
                }}
                disabled={isApproving}
                style={{ borderColor: theme.border, color: theme.subtext }}
                className="px-3 py-1.5 text-xs font-medium rounded-lg border disabled:opacity-60"
              >
                Archive
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Delivery row ─────────────────────────────────────────────────────────────

function DeliveryRow({
  request,
  index,
  onDeliver,
  onFail,
  onView,
  actionId,
  theme,
}: {
  request: SupplyRequest;
  index: number;
  onDeliver: (r: SupplyRequest) => void;
  onFail: (r: SupplyRequest) => void;
  onView: (r: SupplyRequest) => void;
  actionId: string | null;
  theme: any;
}) {
  const { primaryLabel, extraCount, qtyLabel } = itemSummary(request.items);
  const status = request.status;
  const isActive = actionId === request.id;
  const isForDelivery =
    status === "out_for_delivery" || status === "failed_delivery";

  return (
    <tr
      onClick={() => onView(request)}
      style={{
        backgroundColor: index % 2 === 0 ? theme.surface : theme.background,
        borderBottom: `1px solid ${theme.border}`,
        cursor: "pointer",
      }}
    >
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ color: theme.text }} className="text-sm font-medium">
          #{request.ticketNumber.replace(/^SR-\d+-/, "")}
        </span>
      </td>
      <td className="px-3 py-3 min-w-[150px]">
        <div className="flex items-center gap-2">
          <span
            style={{
              backgroundColor: theme.primary,
              color: theme.primaryText,
              width: 22,
              height: 22,
            }}
            className="flex items-center justify-center rounded-full text-[10px] font-medium flex-shrink-0"
          >
            {getInitials(request.requestedByName)}
          </span>
          <span style={{ color: theme.text }} className="text-sm">
            {request.requestedByName}
          </span>
        </div>
      </td>
      <td className="px-3 py-3 min-w-[180px]">
        <span style={{ color: theme.text }} className="text-sm font-medium">
          {primaryLabel}
        </span>
        {extraCount > 0 && (
          <span style={{ color: theme.subtext }} className="text-xs ml-1.5">
            +{extraCount} more
          </span>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ color: theme.text }} className="text-sm">
          {qtyLabel}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span style={{ color: theme.subtext }} className="text-xs">
          {formatDate(request.approvedAt ?? "")}
        </span>
      </td>
      <td className="px-3 py-3 whitespace-nowrap">
        <span
          className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusBadgeClass(status)}`}
        >
          {statusLabel(status)}
        </span>
        {/* Show failed reason hint */}
        {status === "failed_delivery" && request.failedReason && (
          <p
            style={{ color: theme.subtext }}
            className="text-[11px] mt-0.5 max-w-[160px] truncate"
          >
            {request.failedReason}
          </p>
        )}
      </td>
      <td className="px-3 py-3 whitespace-nowrap text-right">
        {isForDelivery ? (
          <div className="inline-flex items-center gap-1.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDeliver(request);
              }}
              disabled={isActive}
              style={{ backgroundColor: "#16a34a", color: "#fff" }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
            >
              {isActive ? "Saving…" : "✓ Deliver"}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFail(request);
              }}
              disabled={isActive}
              style={{ backgroundColor: "#D97706", color: "#fff" }}
              className="px-2.5 py-1.5 text-xs font-medium rounded-lg disabled:opacity-60"
            >
              ✕ Failed
            </button>
          </div>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onView(request);
            }}
            style={{ borderColor: theme.border, color: theme.text }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border"
          >
             View
          </button>
        )}
      </td>
    </tr>
  );
}

// ─── Mobile request card ──────────────────────────────────────────────────────

function RequestCard({
  request,
  onApprove,
  onView,
  onDeliver,
  onFail,
  approvingId,
  liveStock,
  theme,
}: {
  request: SupplyRequest;
  onApprove: (r: SupplyRequest) => void;
  onView: (r: SupplyRequest) => void;
  onDeliver: (r: SupplyRequest) => void;
  onFail: (r: SupplyRequest) => void;
  approvingId: string | null;
  liveStock?: Record<string, StockStatus>;
  theme: any;
}) {
  const stock = worstStockStatus(request.items, liveStock);
  const status = effectiveStatus(request, liveStock);
  const { primaryLabel, extraCount, qtyLabel } = itemSummary(request.items);
  const isPending =
    request.status === "pending" || request.status === "awaiting_stock";
  const isApproving = approvingId === request.id;

  return (
    <div
      onClick={() => onView(request)}
      style={{ backgroundColor: theme.surface, borderColor: theme.border, cursor: "pointer" }}
      className="rounded-lg border px-2.5 py-2 mb-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            style={{
              backgroundColor: theme.primary,
              color: theme.primaryText,
              width: 16,
              height: 16,
            }}
            className="flex items-center justify-center rounded-full text-[8px] font-medium flex-shrink-0"
          >
            {getInitials(request.requestedByName)}
          </span>
          <span style={{ color: theme.text }} className="text-xs font-semibold flex-shrink-0">
            #{request.ticketNumber.replace(/^SR-\d+-/, "")}
          </span>
          <span style={{ color: theme.subtext }} className="text-[11px] truncate">
            {request.requestedByName}
          </span>
        </div>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${statusBadgeClass(status)}`}
        >
          {statusLabel(status)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span style={{ color: theme.text }} className="text-xs font-medium truncate">
          {primaryLabel}
          {extraCount > 0 && (
            <span style={{ color: theme.subtext }} className="font-normal">
              {" "}+{extraCount}
            </span>
          )}
        </span>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${stockBadgeClass(stock)}`}
        >
          {stockLabel(stock)}
        </span>
      </div>

      <p style={{ color: theme.subtext }} className="text-[11px] mb-1.5">
        {qtyLabel} · {formatDate(request.createdAt)}
      </p>

      {isPending ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onApprove(request);
          }}
          disabled={isApproving}
          style={{ backgroundColor: theme.primary, color: theme.primaryText }}
          className="w-full py-1.5 text-xs font-medium rounded-md disabled:opacity-60"
        >
          {isApproving ? "Reviewing…" : "Review"}
        </button>
      ) : request.status === "out_for_delivery" ? (
        <div className="flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeliver(request);
            }}
            disabled={isApproving}
            style={{ backgroundColor: "#16a34a", color: "#fff" }}
            className="flex-1 py-1.5 text-xs font-medium rounded-md disabled:opacity-60"
          >
            {isApproving ? "Saving…" : "✓ Deliver"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFail(request);
            }}
            disabled={isApproving}
            style={{ backgroundColor: "#D97706", color: "#fff" }}
            className="px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-60"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView(request);
          }}
          style={{ borderColor: theme.border, color: theme.text }}
          className="w-full py-1.5 text-xs font-medium rounded-md border"
        >
          View
        </button>
      )}
    </div>
  );
}

// ─── Mobile delivery card ──────────────────────────────────────────────────────

function DeliveryCard({
  request,
  onDeliver,
  onFail,
  onView,
  actionId,
  theme,
}: {
  request: SupplyRequest;
  onDeliver: (r: SupplyRequest) => void;
  onFail: (r: SupplyRequest) => void;
  onView: (r: SupplyRequest) => void;
  actionId: string | null;
  theme: any;
}) {
  const { primaryLabel, extraCount, qtyLabel } = itemSummary(request.items);
  const status = request.status;
  const isActive = actionId === request.id;
  const isForDelivery =
    status === "out_for_delivery" || status === "failed_delivery";

  return (
    <div
      onClick={() => onView(request)}
      style={{ backgroundColor: theme.surface, borderColor: theme.border, cursor: "pointer" }}
      className="rounded-lg border px-2.5 py-2 mb-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            style={{
              backgroundColor: theme.primary,
              color: theme.primaryText,
              width: 16,
              height: 16,
            }}
            className="flex items-center justify-center rounded-full text-[8px] font-medium flex-shrink-0"
          >
            {getInitials(request.requestedByName)}
          </span>
          <span style={{ color: theme.text }} className="text-xs font-semibold flex-shrink-0">
            #{request.ticketNumber.replace(/^SR-\d+-/, "")}
          </span>
          <span style={{ color: theme.subtext }} className="text-[11px] truncate">
            {request.requestedByName}
          </span>
        </div>
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${statusBadgeClass(status)}`}
        >
          {statusLabel(status)}
        </span>
      </div>

      <div className="mb-1.5">
        <span style={{ color: theme.text }} className="text-xs font-medium">
          {primaryLabel}
        </span>
        {extraCount > 0 && (
          <span style={{ color: theme.subtext }} className="text-[11px] ml-1">
            +{extraCount} more
          </span>
        )}
      </div>

      <p style={{ color: theme.subtext }} className="text-[11px] mb-1.5">
        {qtyLabel} · Approved {formatDate(request.approvedAt ?? "")}
      </p>
      {status === "failed_delivery" && request.failedReason && (
        <p style={{ color: theme.subtext }} className="text-[11px] mb-1.5 truncate">
          {request.failedReason}
        </p>
      )}

      {isForDelivery ? (
        <div className="flex gap-1.5">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeliver(request);
            }}
            disabled={isActive}
            style={{ backgroundColor: "#16a34a", color: "#fff" }}
            className="flex-1 py-1.5 text-xs font-medium rounded-md disabled:opacity-60"
          >
            {isActive ? "Saving…" : "✓ Deliver"}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onFail(request);
            }}
            disabled={isActive}
            style={{ backgroundColor: "#D97706", color: "#fff" }}
            className="px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-60"
          >
            ✕
          </button>
        </div>
      ) : (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onView(request);
          }}
          style={{ borderColor: theme.border, color: theme.text }}
          className="w-full py-1.5 text-xs font-medium rounded-md border"
        >
          View
        </button>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = {
  user?: ADUser;
  initialApprovalRequest?: SupplyRequest | null;
  onApprovalModalOpened?: () => void;
};

const REQUEST_HEADERS = [
  "Ticket #",
  "Requested by",
  "Item",
  "Qty",
  "Date filed",
  "Stock status",
  "Status",
  "",
];
const DELIVERY_HEADERS = [
  "Ticket #",
  "Deliver to",
  "Item",
  "Qty",
  "Approved at",
  "Status",
  "",
];

export default function SupplyRequestsPage({ user, initialApprovalRequest, onApprovalModalOpened }: Props) {
  const { theme } = useTheme();

  const [pageTab, setPageTab] = useState<PageTab>("requests");
  const [requests, setRequests] = useState<SupplyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [delivFilter, setDelivFilter] = useState<
    "all" | "out_for_delivery" | "resolved" | "failed_delivery"
  >("out_for_delivery");
  const [detailRequest, setDetailRequest] = useState<SupplyRequest | null>(
    null,
  );
  const [rejectTarget, setRejectTarget] = useState<SupplyRequest | null>(null);
  const [failTarget, setFailTarget] = useState<SupplyRequest | null>(null);
  const [approvalTarget, setApprovalTarget] = useState<SupplyRequest | null>(
    null,
  );
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [delivActionId, setDelivActionId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [failing, setFailing] = useState(false);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [liveStock, setLiveStock] = useState<Record<string, StockStatus>>({});
  const isFirstLoad = useRef(true);

  const loadRequests = useCallback(async () => {
    if (isFirstLoad.current) setLoading(true);
    else setRefreshing(true);
    try {
      const [data, items] = await Promise.all([
        getAllSupplyRequests(),
        getAllInventoryItems().catch((err) => {
          console.warn("Could not fetch live inventory for status check:", err);
          return [];
        }),
      ]);
      setRequests(data);
      setLiveStock(
        Object.fromEntries(
          items.map((it) => [it.id, toRequestStockStatus(it.stockStatus)]),
        ),
      );
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to load supply requests.");
    } finally {
      isFirstLoad.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (initialApprovalRequest) {
      setApprovalTarget(initialApprovalRequest);
      onApprovalModalOpened?.();
    }
  }, [initialApprovalRequest]);

  useEffect(() => {
    loadRequests();

    const POLL_INTERVAL_MS = 8_000;
    const intervalId = setInterval(loadRequests, POLL_INTERVAL_MS);
    const onFocus = () => loadRequests();
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadRequests]);

  // ── Filtered lists ─────────────────────────────────────────────────────────

  const filteredRequests = useMemo(() => {
    let r = requests;
    if (statusFilter !== "all")
      r = r.filter((x) => effectiveStatus(x, liveStock) === statusFilter);
    const q = search.trim().toLowerCase();
    if (q)
      r = r.filter((x) =>
        [
          x.ticketNumber,
          x.requestedByName,
          ...x.items.map((i) => i.itemName),
          ...x.items.map((i) => i.itemCode),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );

    return [...r].sort((a, b) => {
      const pa = STATUS_SORT_ORDER[effectiveStatus(a, liveStock)] ?? 99;
      const pb = STATUS_SORT_ORDER[effectiveStatus(b, liveStock)] ?? 99;
      if (pa !== pb) return pa - pb;
      // Same priority tier — newest first
      return (
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [requests, statusFilter, search, liveStock]);

  const filteredDeliveries = useMemo(() => {
    // filteredDeliveries
    let r = requests.filter((x) =>
      ["out_for_delivery", "resolved", "failed_delivery"].includes(x.status),
    );
    if (delivFilter !== "all") r = r.filter((x) => x.status === delivFilter);
    const q = search.trim().toLowerCase();
    if (q)
      r = r.filter((x) =>
        [x.ticketNumber, x.requestedByName, ...x.items.map((i) => i.itemName)]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    return r;
  }, [requests, delivFilter, search]);

  // ── Counts ─────────────────────────────────────────────────────────────────

  const requestCounts = useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    requests.forEach((r) => {
      const s = effectiveStatus(r, liveStock);
      c[s] = (c[s] ?? 0) + 1;
    });
    return c;
  }, [requests, liveStock]);

  const delivCounts = useMemo(() => {
    const base = requests.filter((x) =>
      ["out_for_delivery", "delivered", "failed_delivery"].includes(x.status),
    );
    return {
      all: base.length,
      out_for_delivery: base.filter((x) => x.status === "out_for_delivery")
        .length,
      resolved: base.filter((x) => x.status === "resolved").length,
      failed_delivery: base.filter((x) => x.status === "failed_delivery")
        .length,
    };
  }, [requests]);

  const pendingDeliveryCount = requests.filter(
    (x) => x.status === "out_for_delivery",
  ).length;

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleApproveAll = async (request: SupplyRequest) => {
    setApprovingId(request.id);
    setError("");
    try {
      await approveSupplyRequest(request.id);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve request.");
      throw err;
    } finally {
      setApprovingId(null);
    }
  };

  const handleApprovePartial = async (
    requestId: string,
    lines: { itemId: string; qtyToDispense: number }[],
  ) => {
    setApprovingId(requestId);
    setError("");
    try {
      await approveSupplyRequestPartial(requestId, lines);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve request.");
      throw err;
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmReject = async (reason: string) => {
    if (!rejectTarget) return;
    setRejecting(true);
    setError("");
    try {
      await rejectSupplyRequest(rejectTarget.id, reason);
      setRejectTarget(null);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to reject request.");
    } finally {
      setRejecting(false);
    }
  };

  const handleMarkDelivered = async (request: SupplyRequest) => {
    setDelivActionId(request.id);
    setError("");
    try {
      await markDelivered(request.id, user?.displayName ?? "Technician");
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to mark as delivered.");
    } finally {
      setDelivActionId(null);
    }
  };

  const handleConfirmFailed = async (reason: string) => {
    if (!failTarget) return;
    setFailing(true);
    setError("");
    try {
      await markFailedDelivery(
        failTarget.id,
        reason,
        user?.displayName ?? "Technician",
      );
      setFailTarget(null);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update delivery status.");
    } finally {
      setFailing(false);
    }
  };

const handleReject = (requestId: string) => {
  const request = requests.find((r) => r.id === requestId);
  if (!request) return;
  setApprovalTarget(null);
  setTimeout(() => setRejectTarget(request), 100);
};

  const handleArchive = async (request: SupplyRequest) => {
    setApprovingId(request.id);
    setError("");
    try {
      await archiveSupplyRequest(request.id);
      await loadRequests();
    } catch (err: any) {
      setError(err?.message ?? "Failed to archive request.");
    } finally {
      setApprovingId(null);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{ backgroundColor: theme.background }}
      className="flex flex-col h-full overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-0">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h1 style={{ color: theme.text }} className="text-xl font-bold">
              Supply requests
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              {pageTab === "requests"
                ? `${filteredRequests.length} of ${requests.length} requests`
                : `${filteredDeliveries.length} deliveries`}
              {refreshing ? "" : ""}
            </p>
          </div>
        </div>

        {/* ── Page tabs ── */}
        <div
          style={{ borderBottom: `1px solid ${theme.border}` }}
          className="flex items-end gap-0 -mb-px mb-3"
        >
          {[
            { label: "Supply Requests", value: "requests" as PageTab },
            {
              label: `Deliveries${pendingDeliveryCount > 0 ? ` (${pendingDeliveryCount})` : ""}`,
              value: "deliveries" as PageTab,
            },
          ].map((tab) => {
            const active = pageTab === tab.value;
            return (
              <button
                key={tab.value}
                onClick={() => setPageTab(tab.value)}
                style={{
                  color: active ? theme.primary : theme.subtext,
                  borderBottom: active
                    ? `2px solid ${theme.primary}`
                    : "2px solid transparent",
                  backgroundColor: "transparent",
                }}
                className="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors focus:outline-none"
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── Search ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div className="relative w-full sm:max-w-md">
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
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.inputText,
              }}
              className="w-full px-4 py-2.5 pl-9 text-sm border rounded-lg focus:outline-none"
            />
          </div>

          {/* Status filter pills */}
          <div
            style={{
              backgroundColor: theme.surfaceRaised,
              borderColor: theme.border,
            }}
            className="flex items-center gap-1 p-1 rounded-lg border flex-wrap"
          >
            {(pageTab === "requests"
              ? REQUEST_STATUS_TABS
              : DELIVERY_STATUS_TABS
            ).map((tab) => {
              const active =
                pageTab === "requests"
                  ? statusFilter === tab.value
                  : delivFilter === tab.value;
              const count =
                pageTab === "requests"
                  ? (requestCounts[tab.value] ?? 0)
                  : (delivCounts[tab.value as keyof typeof delivCounts] ?? 0);
              return (
                <button
                  key={tab.value}
                  onClick={() =>
                    pageTab === "requests"
                      ? setStatusFilter(tab.value as StatusFilter)
                      : setDelivFilter(tab.value as any)
                  }
                  style={{
                    backgroundColor: active ? theme.primary : "transparent",
                    color: active ? theme.primaryText : theme.subtext,
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors"
                >
                  {tab.label}
                  {count > 0 && (
                    <span className="ml-1 opacity-70">{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs px-3 py-2 mb-3">
            ⚠ {error}
          </div>
        )}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div
            style={{ borderColor: theme.primary }}
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          />
        </div>
      ) : (
        <>
        {/* Desktop table */}
        <div className="hidden md:block flex-1 overflow-y-auto overflow-x-auto px-4 pb-4">
          <div
            style={{ borderColor: theme.border }}
            className="rounded-lg border"
          >
            <table
              className="min-w-full text-sm"
              style={{ borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  {(pageTab === "requests"
                    ? REQUEST_HEADERS
                    : DELIVERY_HEADERS
                  ).map((h) => (
                    <th
                      key={h}
                      style={{
                        color: theme.subtext,
                        borderColor: theme.border,
                        backgroundColor: theme.surfaceRaised,
                        position: "sticky",
                        top: 0,
                        zIndex: 10,
                      }}
                      className="px-3 py-2 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap border-b"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageTab === "requests" ? (
                  filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-3 py-10 text-center">
                        <p style={{ color: theme.subtext }} className="text-sm">
                          No requests found.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((r, i) => (
                      <RequestRow
                        key={r.id}
                        request={r}
                        index={i}
                        onApprove={(x) => setApprovalTarget(x)}
                        onReject={(x) => setRejectTarget(x)}
                        onView={(x) => setDetailRequest(x)}
                        onDeliver={handleMarkDelivered}
                        onFail={(x) => setFailTarget(x)}
                        onArchive={handleArchive}
                        canArchive={user?.role === "superadmin"}
                        approvingId={approvingId}
                        liveStock={liveStock}
                        theme={theme}
                      />
                    ))
                  )
                ) : filteredDeliveries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center">
                      <p style={{ color: theme.subtext }} className="text-sm">
                        No deliveries found.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredDeliveries.map((r, i) => (
                    <DeliveryRow
                      key={r.id}
                      request={r}
                      index={i}
                      onDeliver={handleMarkDelivered}
                      onFail={(x) => setFailTarget(x)}
                      onView={(x) => setDetailRequest(x)}
                      actionId={delivActionId}
                      theme={theme}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden flex-1 overflow-y-auto px-4 pb-4">
          {pageTab === "requests" ? (
            filteredRequests.length === 0 ? (
              <p style={{ color: theme.subtext }} className="text-sm text-center py-10">
                No requests found.
              </p>
            ) : (
              filteredRequests.map((r) => (
                <RequestCard
                  key={r.id}
                  request={r}
                  onApprove={(x) => setApprovalTarget(x)}
                  onView={(x) => setDetailRequest(x)}
                  onDeliver={handleMarkDelivered}
                  onFail={(x) => setFailTarget(x)}
                  approvingId={approvingId}
                  liveStock={liveStock}
                  theme={theme}
                />
              ))
            )
          ) : filteredDeliveries.length === 0 ? (
            <p style={{ color: theme.subtext }} className="text-sm text-center py-10">
              No deliveries found.
            </p>
          ) : (
            filteredDeliveries.map((r) => (
              <DeliveryCard
                key={r.id}
                request={r}
                onDeliver={handleMarkDelivered}
                onFail={(x) => setFailTarget(x)}
                onView={(x) => setDetailRequest(x)}
                actionId={delivActionId}
                theme={theme}
              />
            ))
          )}
        </div>
        </>
      )}

      {/* ── Modals ── */}
      <PartialApprovalModal
        visible={approvalTarget !== null}
        request={approvalTarget}
        onClose={() => setApprovalTarget(null)}
        onApproveAll={handleApproveAll}
        onApprovePartial={handleApprovePartial}
        onReject={handleReject} // add this
        theme={theme}
      />

      <DetailDrawer
        request={detailRequest}
        onClose={() => setDetailRequest(null)}
        theme={theme}
      />

      <RejectModal
        visible={rejectTarget !== null}
        ticketNumber={rejectTarget?.ticketNumber ?? ""}
        onCancel={() => setRejectTarget(null)}
        onConfirm={handleConfirmReject}
        submitting={rejecting}
        theme={theme}
      />
      <FailedDeliveryModal
        visible={failTarget !== null}
        ticketNumber={failTarget?.ticketNumber ?? ""}
        onCancel={() => setFailTarget(null)}
        onConfirm={handleConfirmFailed}
        submitting={failing}
        theme={theme}
      />
    </div>
  );
}
