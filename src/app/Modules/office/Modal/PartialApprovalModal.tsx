import React, { useEffect, useState } from "react";
import { SupplyRequest, SupplyRequestItem } from "../../../../../types";
import { getAllInventoryItems } from "../../../../services/Officeinventory";

// ─── Types ────────────────────────────────────────────────────────────────────

type FulfillmentLine = {
  item: SupplyRequestItem;
  liveStock: number; // current stock from inventory
  qtyToDispense: number; // admin-editable, capped at min(requested, liveStock)
  skipped: boolean; // admin toggled skip
};

type Props = {
  visible: boolean;
  request: SupplyRequest | null;
  onClose: () => void;
  onApproveAll: (request: SupplyRequest) => Promise<void>;
  onApprovePartial: (
    requestId: string,
    lines: { itemId: string; qtyToDispense: number }[],
  ) => Promise<void>;
  onReject: (requestId: string) => void; // ← void, not Promise<void>
  theme: any;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function stockColor(stock: number, requested: number): string {
  if (stock <= 0) return "#f87171"; // red
  if (stock < requested) return "#fb923c"; // orange
  return "#34d399"; // green
}

// ─── Component ────────────────────────────────────────────────────────────────

const PartialApprovalModal: React.FC<Props> = ({
  visible,
  request,
  onClose,
  onApproveAll,
  onApprovePartial,
  onReject, // add this
  theme,
}) => {
  const [lines, setLines] = useState<FulfillmentLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load live stock when modal opens
  useEffect(() => {
    if (!visible || !request) return;
    setError(null);
    setSubmitting(false);

    const fetchStock = async () => {
      setLoading(true);
      try {
        const inventory = await getAllInventoryItems();
        const stockMap = new Map(inventory.map((i) => [i.id, i.currentStock]));

        const newLines: FulfillmentLine[] = request.items.map((item) => {
          const liveStock = stockMap.get(item.itemId) ?? 0;
          const maxDispensable = Math.min(item.quantityRequested, liveStock);
          return {
            item,
            liveStock,
            qtyToDispense: maxDispensable,
            skipped: liveStock <= 0,
          };
        });
        setLines(newLines);
      } catch (err: any) {
        setError("Failed to load live stock. Please try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchStock();
  }, [visible, request]);

  if (!visible || !request) return null;

  // ── Derived state ──────────────────────────────────────────────────────────
  const activeLines = lines.filter((l) => !l.skipped);
  const hasAnyActive = activeLines.length > 0;
  const allFullyFulfilled = lines.every(
    (l) => l.skipped || l.qtyToDispense === l.item.quantityRequested,
  );
  const somePartial = lines.some(
    (l) => !l.skipped && l.qtyToDispense < l.item.quantityRequested,
  );
  const someSkipped = lines.some((l) => l.skipped);

  // ── Line updaters ──────────────────────────────────────────────────────────
  const updateQty = (itemId: string, raw: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.item.itemId !== itemId) return l;
        const parsed = parseInt(raw, 10);
        const qty = isNaN(parsed)
          ? 1
          : clamp(parsed, 1, Math.min(l.item.quantityRequested, l.liveStock));
        // If they force-type 0, auto-skip the line
        const shouldSkip = !isNaN(parsed) && parsed <= 0;
        return {
          ...l,
          qtyToDispense: shouldSkip ? 0 : qty,
          skipped: shouldSkip,
        };
      }),
    );
  };

  const toggleSkip = (itemId: string) => {
    setLines((prev) =>
      prev.map((l) => {
        if (l.item.itemId !== itemId) return l;
        if (l.skipped) {
          // Un-skip: restore to max dispensable
          const max = Math.min(l.item.quantityRequested, l.liveStock);
          return { ...l, skipped: false, qtyToDispense: max > 0 ? max : 0 };
        }
        return { ...l, skipped: true, qtyToDispense: 0 };
      }),
    );
  };

  // ── Submit handlers ────────────────────────────────────────────────────────
  const handleApproveAll = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await onApproveAll(request);
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprovePartial = async () => {
    if (!hasAnyActive) return;
    setSubmitting(true);
    setError(null);
    try {
      await onApprovePartial(
        request.id,
        lines
          .filter((l) => !l.skipped && l.qtyToDispense > 0)
          .map((l) => ({
            itemId: l.item.itemId,
            qtyToDispense: l.qtyToDispense,
          })),
      );
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to approve.");
    } finally {
      setSubmitting(false);
    }
  };
  const handleReject = () => {
    onReject(request.id);
  };

  // ── Styles ─────────────────────────────────────────────────────────────────
  const input: React.CSSProperties = {
    backgroundColor: theme.inputBg,
    borderColor: theme.inputBorder,
    color: theme.inputText,
  };

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          backgroundColor: theme.surface,
          borderColor: theme.border,
          width: 520,
          maxWidth: "95vw",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
        }}
        className="rounded-xl border shadow-2xl"
      >
        {/* ── Header ── */}
        <div
          style={{ borderColor: theme.border }}
          className="flex items-start justify-between px-5 py-4 border-b"
        >
          <div>
            <p
              style={{ color: theme.subtext }}
              className="text-[11px] uppercase tracking-wide mb-0.5"
            >
              Approve request
            </p>
            <h2 style={{ color: theme.text }} className="text-sm font-semibold">
              {request.ticketNumber}
              <span
                style={{ color: theme.subtext }}
                className="font-normal ml-2"
              >
                · {request.requestedByName}
              </span>
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{ color: theme.subtext }}
            className="text-lg leading-none mt-0.5"
          >
            ✕
          </button>
        </div>

        {/* ── Body ── */}
        <div
          style={{ overflowY: "auto", flex: 1 }}
          className="px-5 py-4 flex flex-col gap-3"
        >
          {/* Info callout */}
          <div
            style={{
              backgroundColor: theme.background,
              borderColor: theme.border,
              color: theme.subtext,
            }}
            className="rounded-lg border px-3 py-2.5 text-xs leading-relaxed"
          >
            Adjust quantities per item based on available stock. Skipped items
            won't be deducted. Use{" "}
            <strong style={{ color: theme.text }}>Approve all</strong> to
            fulfill every item at the requested qty (same as before).
          </div>

          {error && (
            <div className="text-xs px-3 py-2 rounded-md bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          {/* ── Item lines ── */}
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div
                style={{ borderColor: theme.primary }}
                className="w-6 h-6 border-4 border-t-transparent rounded-full animate-spin"
              />
            </div>
          ) : (
            <>
              {/* Column headers */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 80px 80px 32px",
                  gap: 8,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${theme.border}`,
                }}
              >
                {["Item", "Requested", "In stock", "Dispense", ""].map((h) => (
                  <span
                    key={h}
                    style={{
                      color: theme.subtext,
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  >
                    {h}
                  </span>
                ))}
              </div>

              {/* Rows */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {lines.map((line) => {
                  const isOutOfStock = line.liveStock <= 0;
                  const isShortStock =
                    line.liveStock < line.item.quantityRequested;

                  return (
                    <div
                      key={line.item.itemId}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 80px 80px 80px 32px",
                        gap: 8,
                        alignItems: "center",
                        opacity: line.skipped ? 0.45 : 1,
                        transition: "opacity 0.15s",
                      }}
                    >
                      {/* Item name + code */}
                      <div style={{ minWidth: 0 }}>
                        <p
                          style={{
                            color: theme.text,
                            fontSize: 13,
                            fontWeight: 500,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {line.item.itemName}
                        </p>
                        <p style={{ color: theme.subtext, fontSize: 11 }}>
                          {line.item.itemCode}
                        </p>
                      </div>

                      {/* Requested qty */}
                      <span
                        style={{
                          color: theme.text,
                          fontSize: 13,
                          textAlign: "center" as const,
                        }}
                      >
                        {line.item.quantityRequested}
                      </span>

                      {/* Live stock pill */}
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: stockColor(
                            line.liveStock,
                            line.item.quantityRequested,
                          ),
                          textAlign: "center" as const,
                        }}
                      >
                        {line.liveStock}
                        {isShortStock && !isOutOfStock && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 400,
                              display: "block",
                              color: "#fb923c",
                            }}
                          >
                            short
                          </span>
                        )}
                        {isOutOfStock && (
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 400,
                              display: "block",
                              color: "#f87171",
                            }}
                          >
                            none
                          </span>
                        )}
                      </span>

                      {/* Dispense qty input */}
                      <input
                        type="number"
                        min={1}
                        max={Math.min(
                          line.item.quantityRequested,
                          line.liveStock,
                        )}
                        value={line.skipped ? "" : line.qtyToDispense}
                        placeholder={line.skipped ? "—" : "0"}
                        disabled={line.skipped || isOutOfStock}
                        onChange={(e) =>
                          updateQty(line.item.itemId, e.target.value)
                        }
                        style={{
                          ...input,
                          padding: "5px 6px",
                          fontSize: 13,
                          border: `1px solid ${input.borderColor}`,
                          borderRadius: 6,
                          outline: "none",
                          width: "100%",
                          boxSizing: "border-box" as const,
                          textAlign: "center" as const,
                          opacity: isOutOfStock ? 0.4 : 1,
                        }}
                      />

                      {/* Skip toggle */}
                      <button
                        onClick={() => toggleSkip(line.item.itemId)}
                        disabled={isOutOfStock}
                        title={
                          line.skipped ? "Include this item" : "Skip this item"
                        }
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 6,
                          border: `1px solid ${theme.border}`,
                          backgroundColor: line.skipped
                            ? theme.background
                            : "transparent",
                          color: line.skipped ? theme.primary : "#f87171",
                          cursor: isOutOfStock ? "not-allowed" : "pointer",
                          fontSize: 13,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        {line.skipped ? "+" : "–"}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Summary row */}
              {!loading && lines.length > 0 && (
                <div
                  style={{
                    borderTop: `1px solid ${theme.border}`,
                    paddingTop: 10,
                    marginTop: 2,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span style={{ color: theme.subtext, fontSize: 12 }}>
                      {activeLines.length} of {lines.length} item
                      {lines.length !== 1 ? "s" : ""} will be dispensed
                      {somePartial && (
                        <span style={{ color: "#fb923c" }}>
                          {" "}
                          (partial quantities)
                        </span>
                      )}
                    </span>
                    <span style={{ color: theme.subtext, fontSize: 12 }}>
                      Total qty:{" "}
                      <strong style={{ color: theme.text }}>
                        {activeLines.reduce((s, l) => s + l.qtyToDispense, 0)}
                      </strong>
                      {" / "}
                      {lines.reduce(
                        (s, l) => s + l.item.quantityRequested,
                        0,
                      )}{" "}
                      requested
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          style={{ borderColor: theme.border }}
          className="flex items-center justify-between gap-2 px-5 py-3.5 border-t"
        >
          {/* Left: Cancel + Reject */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              disabled={submitting}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg border"
            >
              Cancel
            </button>

            <button
              onClick={handleReject}
              disabled={submitting || loading}
              style={{
                backgroundColor: "transparent",
                color: "#ef4444",
                borderColor: "#fca5a5",
                opacity: submitting || loading ? 0.6 : 1,
              }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg border"
            >
              {submitting ? "Saving…" : "Reject"}
            </button>
          </div>

          {/* Right: Approve all + Approve with adjustments */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleApproveAll}
              disabled={submitting || loading}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
                opacity: submitting || loading ? 0.6 : 1,
              }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg border"
              title="Deduct all items at requested quantities (ignores stock shortfalls)"
            >
              {submitting ? "Saving…" : "Approve all"}
            </button>

            <button
              onClick={handleApprovePartial}
              disabled={submitting || loading || !hasAnyActive}
              style={{
                backgroundColor: theme.primary,
                color: theme.primaryText,
                opacity: submitting || loading || !hasAnyActive ? 0.6 : 1,
              }}
              className="px-3.5 py-2 text-sm font-medium rounded-lg"
            >
              {submitting
                ? "Saving…"
                : someSkipped || somePartial
                  ? "Approve with adjustments"
                  : "Approve"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartialApprovalModal;
