// app/Admin/OfficeInventory/ActivityPage.tsx

import {
    useCallback,
    useEffect,
    useMemo,
    useState
} from "react";
// @ts-ignore
import ReactDOM from "react-dom";
import { ADUser, StockTransaction } from "../../../../types";
import {
    getAllInventoryItems,
    getAllStockTransactions,
} from "../../../services/Officeinventory";
import { useTheme } from "../../../theme/ThemeContext";

// ─── Action badge config ──────────────────────────────────────────────────────

const ACTION_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  item_created: {
    label: "Item Added",
    bg: "#ede9fe",
    text: "#5b21b6",
    border: "#ddd6fe",
  },
  delivery: {
    label: "Delivery",
    bg: "#dcfce7",
    text: "#15803d",
    border: "#bbf7d0",
  },
  manual_adjustment: {
    label: "Manual adj.",
    bg: "#e2e8f0",
    text: "#334155",
    border: "#cbd5e1",
  },
  supply_request_fulfilled: {
    label: "Approved",
    bg: "#dbeafe",
    text: "#1d4ed8",
    border: "#bfdbfe",
  },
  ticket_deduction: {
    label: "Ticket",
    bg: "#fef3c7",
    text: "#92400e",
    border: "#fde68a",
  },
  supply_request_rejected: {
    label: "Rejected",
    bg: "#fee2e2",
    text: "#b91c1c",
    border: "#fecaca",
  },
  item_archived: {
    label: "Archived",
    bg: "#f1f5f9",
    text: "#475569",
    border: "#cbd5e1",
  },
  item_restored: {
    label: "Restored",
    bg: "#dbeafe",
    text: "#1d4ed8",
    border: "#bfdbfe",
  },
};

function getActionConfig(type: string) {
  return (
    ACTION_CONFIG[type] ?? {
      label: type,
      bg: "#f1f5f9",
      text: "#475569",
      border: "#e2e8f0",
    }
  );
}

const ACTION_FILTER_OPTIONS = [
  { label: "All actions", value: "all" },
  { label: "Item Added", value: "item_created" },
  { label: "Delivery", value: "delivery" },
  { label: "Manual adjustment", value: "manual_adjustment" },
  { label: "Supply request approved", value: "supply_request_fulfilled" },
  { label: "Ticket deduction", value: "ticket_deduction" },
  { label: "Supply request rejected", value: "supply_request_rejected" },
  { label: "Item archived", value: "item_archived" },
  { label: "Item restored", value: "item_restored" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function formatDateTimeFull(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return (
    d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    })
  );
}

function formatQty(
  tx: StockTransaction,
  unitMap: Record<string, string>,
): string {
  const sign = tx.quantityChange > 0 ? "+" : "";
  const unit = unitMap[tx.itemId];
  return unit
    ? `${sign}${tx.quantityChange} ${unit}`
    : `${sign}${tx.quantityChange}`;
}

function deriveRef(tx: StockTransaction): string {
  const match = tx.reason?.match(/SR-\d{4}-\d{4,}/);
  if (match) return match[0];
  const prefix =
    tx.type === "delivery"
      ? "DEL"
      : tx.type === "manual_adjustment"
        ? "ADJ"
        : tx.type === "supply_request_fulfilled"
          ? "SR"
          : tx.type === "item_archived"
            ? "ARC"
            : tx.type === "item_restored"
              ? "RST"
              : "TXN";
  return `${prefix}-${tx.id.slice(0, 6).toUpperCase()}`;
}

function formatPeso(amount: number): string {
  return `₱${amount.toLocaleString("en-PH", { minimumFractionDigits: 2 })}`;
}

function getInitials(name: string): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
  { bg: "#ffedd5", text: "#9a3412" },
];

function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++)
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function exportCsv(rows: StockTransaction[]) {
  const headers = [
    "Date",
    "Action",
    "Item",
    "Item Code",
    "Qty Change",
    "Stock Before",
    "Stock After",
    "Price/Unit",
    "Total Amount",
    "Performed By",
    "Reason",
    "Ref",
  ];
  const lines = rows.map((tx) =>
    [
      formatDateTime(tx.createdAt),
      getActionConfig(tx.type).label,
      tx.itemName,
      tx.itemCode,
      String(tx.quantityChange),
      String(tx.stockBefore),
      String(tx.stockAfter),
      formatPeso(tx.pricePerUnit),
      formatPeso(tx.totalAmount),
      tx.performedByName,
      (tx.reason ?? "").replace(/"/g, '""'),
      deriveRef(tx),
    ]
      .map((v) => `"${v}"`)
      .join(","),
  );
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `activity_log_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

type DetailDrawerProps = {
  tx: StockTransaction | null;
  unitMap: Record<string, string>;
  onClose: () => void;
  theme: any;
};

function DetailDrawer({ tx, unitMap, onClose, theme }: DetailDrawerProps) {
  // Close on Escape key
  useEffect(() => {
    if (!tx) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [tx, onClose]);

  if (!tx) return null;

  const action = getActionConfig(tx.type);
  const ref = deriveRef(tx);
  const unit = unitMap[tx.itemId] ?? "";
  const isPositive = tx.quantityChange > 0;
  const colors = avatarColor(tx.performedByName);
  const qtyDisplay = `${isPositive ? "+" : ""}${tx.quantityChange}${unit ? " " + unit : ""}`;

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.3)",
          zIndex: 99998,
        }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        style={{
          backgroundColor: theme.surface,
          zIndex: 99999,
          boxShadow: "-8px 0 32px rgba(0,0,0,0.15)",
        }}
        className="fixed inset-x-0 bottom-0 md:inset-x-auto md:top-0 md:right-0 md:bottom-0 md:w-[400px] max-h-[85vh] md:max-h-none rounded-t-2xl md:rounded-none md:border-l flex flex-col overflow-y-auto"
      >
        {/* Header */}
        <div
          style={{
            flexShrink: 0,
            padding: "16px 20px 14px",
            borderBottom: `1px solid ${theme.border}`,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <p
              style={{
                margin: 0,
                fontSize: 11,
                color: theme.subtext,
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                marginBottom: 4,
              }}
            >
              Transaction detail
            </p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  fontFamily: "monospace",
                  fontSize: 14,
                  fontWeight: 700,
                  color: theme.text,
                }}
              >
                {ref}
              </span>
              <span
                style={{
                  backgroundColor: action.bg,
                  color: action.text,
                  border: `1px solid ${action.border}`,
                  borderRadius: 99,
                  padding: "2px 10px",
                  fontSize: 11,
                  fontWeight: 600,
                }}
              >
                {action.label}
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              flexShrink: 0,
              width: 30,
              height: 30,
              borderRadius: 8,
              border: "none",
              backgroundColor: "transparent",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: theme.subtext,
              fontSize: 18,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = theme.bgHover)
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Item card */}
          <div
            style={{
              backgroundColor: theme.background,
              border: `1.5px solid ${theme.border}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 10,
                fontWeight: 700,
                color: theme.subtext,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Item
            </p>
            <p
              style={{
                margin: "0 0 3px",
                fontSize: 15,
                fontWeight: 600,
                color: theme.text,
              }}
            >
              {tx.itemName}
            </p>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: theme.subtext,
                fontFamily: "monospace",
              }}
            >
              {tx.itemCode}
            </p>
          </div>

          {/* Stock movement card */}
          <div
            style={{
              backgroundColor: theme.background,
              border: `1.5px solid ${theme.border}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <p
              style={{
                margin: "0 0 14px",
                fontSize: 10,
                fontWeight: 700,
                color: theme.subtext,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Stock movement
            </p>

            {/* Before → qty change → After visual */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              {/* Before */}
              <div style={{ textAlign: "center", flex: 1 }}>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontSize: 10,
                    color: theme.subtext,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  Before
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 26,
                    fontWeight: 700,
                    color: theme.text,
                    lineHeight: 1,
                  }}
                >
                  {tx.stockBefore}
                </p>
                {unit && (
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 11,
                      color: theme.subtext,
                    }}
                  >
                    {unit}
                  </p>
                )}
              </div>

              {/* Arrow + qty change */}
              <div style={{ textAlign: "center", flexShrink: 0 }}>
                <div
                  style={{
                    backgroundColor: isPositive ? "#dcfce7" : "#fee2e2",
                    border: `1.5px solid ${isPositive ? "#bbf7d0" : "#fecaca"}`,
                    borderRadius: 8,
                    padding: "6px 12px",
                    marginBottom: 4,
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 700,
                      color: isPositive ? "#15803d" : "#dc2626",
                    }}
                  >
                    {qtyDisplay}
                  </p>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: 18,
                    color: theme.subtext,
                    lineHeight: 1,
                  }}
                >
                  →
                </p>
              </div>

              {/* After */}
              <div style={{ textAlign: "center", flex: 1 }}>
                <p
                  style={{
                    margin: "0 0 2px",
                    fontSize: 10,
                    color: theme.subtext,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  After
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: 26,
                    fontWeight: 700,
                    color:
                      tx.stockAfter === 0
                        ? "#dc2626"
                        : tx.stockAfter <= 5
                          ? "#d97706"
                          : theme.text,
                    lineHeight: 1,
                  }}
                >
                  {tx.stockAfter}
                </p>
                {unit && (
                  <p
                    style={{
                      margin: "2px 0 0",
                      fontSize: 11,
                      color: theme.subtext,
                    }}
                  >
                    {unit}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Financials card */}
          <div
            style={{
              backgroundColor: theme.background,
              border: `1.5px solid ${theme.border}`,
              borderRadius: 12,
              padding: 16,
            }}
          >
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 10,
                fontWeight: 700,
                color: theme.subtext,
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Value
            </p>
            {[
              {
                label: "Price / unit",
                value: formatPeso(tx.pricePerUnit),
              },
              {
                label: "Total amount",
                value: formatPeso(tx.totalAmount),
                bold: true,
              },
            ].map((row, i, arr) => (
              <div
                key={row.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingBottom: i < arr.length - 1 ? 8 : 0,
                  marginBottom: i < arr.length - 1 ? 8 : 0,
                  borderBottom:
                    i < arr.length - 1 ? `1px solid ${theme.border}` : "none",
                }}
              >
                <span style={{ fontSize: 13, color: theme.subtext }}>
                  {row.label}
                </span>
                <span
                  style={{
                    fontSize: row.bold ? 15 : 13,
                    fontWeight: row.bold ? 700 : 500,
                    color: theme.text,
                  }}
                >
                  {row.value}
                </span>
              </div>
            ))}
          </div>

          {/* Meta card — performed by, date, reason */}
          <div
            style={{
              backgroundColor: theme.background,
              border: `1.5px solid ${theme.border}`,
              borderRadius: 12,
              padding: 16,
              display: "flex",
              flexDirection: "column",
              gap: 14,
            }}
          >
            {/* Performed by */}
            <div>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: theme.subtext,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Performed by
              </p>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: "50%",
                    backgroundColor: colors.bg,
                    color: colors.text,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {getInitials(tx.performedByName)}
                </div>
                <span
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: theme.text,
                  }}
                >
                  {tx.performedByName}
                </span>
              </div>
            </div>

            <div
              style={{
                height: 1,
                backgroundColor: theme.border,
              }}
            />

            {/* Date & time */}
            <div>
              <p
                style={{
                  margin: "0 0 4px",
                  fontSize: 10,
                  fontWeight: 700,
                  color: theme.subtext,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                Date & time
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  color: theme.text,
                  lineHeight: 1.5,
                }}
              >
                {formatDateTimeFull(tx.createdAt)}
              </p>
              {tx.transactionDate &&
                tx.transactionDate !== tx.createdAt?.split("T")[0] && (
                  <p
                    style={{
                      margin: "3px 0 0",
                      fontSize: 11,
                      color: theme.subtext,
                    }}
                  >
                    Transaction date: {tx.transactionDate}
                  </p>
                )}
            </div>

            {/* Reason */}
            {tx.reason ? (
              <>
                <div
                  style={{
                    height: 1,
                    backgroundColor: theme.border,
                  }}
                />
                <div>
                  <p
                    style={{
                      margin: "0 0 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: theme.subtext,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    Reason / Note
                  </p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 13,
                      color: theme.text,
                      lineHeight: 1.6,
                    }}
                  >
                    {tx.reason}
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(drawer, document.body);
}

// ─── Mobile activity card ──────────────────────────────────────────────────────

function ActivityCard({
  tx,
  unitMap,
  isSelected,
  onSelect,
  theme,
}: {
  tx: StockTransaction;
  unitMap: Record<string, string>;
  isSelected: boolean;
  onSelect: () => void;
  theme: any;
}) {
  const action = getActionConfig(tx.type);
  const colors = avatarColor(tx.performedByName);

  return (
    <button
      onClick={onSelect}
      style={{
        backgroundColor: isSelected ? theme.bgActive : theme.surface,
        borderColor: theme.border,
      }}
      className="w-full text-left rounded-lg border px-3 py-2.5 mb-2"
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span
          style={{
            backgroundColor: action.bg,
            color: action.text,
            border: `1px solid ${action.border}`,
          }}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
        >
          {action.label}
        </span>
        <span style={{ color: theme.subtext }} className="text-[11px] flex-shrink-0">
          {formatDateTime(tx.createdAt)}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span style={{ color: theme.text }} className="text-sm font-medium truncate">
          {tx.itemName}
        </span>
        <span
          style={{ color: tx.quantityChange < 0 ? "#dc2626" : "#15803d" }}
          className="text-sm font-semibold flex-shrink-0"
        >
          {formatQty(tx, unitMap)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: "50%",
            backgroundColor: colors.bg,
            color: colors.text,
            fontSize: 8,
            fontWeight: 700,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {getInitials(tx.performedByName)}
        </div>
        <span style={{ color: theme.subtext }} className="text-[11px] truncate">
          {tx.performedByName}
        </span>
      </div>
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type Props = { user?: ADUser };

export default function ActivityPage({ user }: Props) {
  const { theme } = useTheme();

  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [unitMap, setUnitMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [selectedTx, setSelectedTx] = useState<StockTransaction | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [txs, items] = await Promise.all([
        getAllStockTransactions(),
        getAllInventoryItems(),
      ]);
      setTransactions(txs);
      const map: Record<string, string> = {};
      items.forEach((i) => (map[i.id] = i.unit));
      setUnitMap(map);
    } catch (err) {
      console.error("Failed to load activity log:", err);
      setError("Failed to load activity log.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    let result = transactions;
    if (actionFilter !== "all") {
      result = result.filter((tx) => tx.type === actionFilter);
    }
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((tx) =>
        [tx.itemName, tx.itemCode, tx.performedByName, tx.reason ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }
    return result;
  }, [transactions, actionFilter, search]);

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
              Activity
            </h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              All inventory transactions · {filtered.length} of{" "}
              {transactions.length}
            </p>
          </div>
        </div>

        {/* Search + filter + export */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          {/* Search */}
          <div className="relative w-full sm:max-w-md">
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
              className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ color: theme.subtext }}
            >
              <path d="m21 21-4.34-4.34" />
              <circle cx="11" cy="11" r="8" />
            </svg>
            <input
              type="text"
              placeholder="Search item, performer, reason…"
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

          <div className="flex items-center gap-2">
            {/* Action type filter */}
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{
                backgroundColor: theme.inputBg,
                borderColor: theme.inputBorder,
                color: theme.inputText,
              }}
              className="flex-1 sm:flex-initial px-3 py-2.5 text-sm border rounded-lg focus:outline-none"
            >
              {ACTION_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Export button */}
            <button
              onClick={() => exportCsv(filtered)}
              disabled={filtered.length === 0}
              style={{
                backgroundColor: theme.surface,
                color: theme.text,
                borderColor: theme.border,
              }}
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border whitespace-nowrap disabled:opacity-50"
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = theme.bgHover)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = theme.surface)
              }
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Export
            </button>
          </div>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 text-rose-700 text-xs px-3 py-2 mb-3">
            ⚠ {error}
          </div>
        ) : null}
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div className="flex flex-1 items-center justify-center py-20">
          <div
            style={{ borderColor: theme.primary }}
            className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center py-20 gap-2">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            style={{ color: theme.border }}
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p style={{ color: theme.subtext }} className="text-sm">
            No activity found.
          </p>
        </div>
      ) : (
        <>
        {/* Desktop table */}
        <div className="hidden md:block flex-1 overflow-y-auto overflow-x-auto px-4 pb-4">
          <div
            style={{ borderColor: theme.border }}
            className="rounded-lg border overflow-hidden"
          >
            <table
              className="min-w-full text-sm"
              style={{ borderCollapse: "collapse" }}
            >
              <thead>
                <tr>
                  {[
                    "Date & Time",
                    "Action",
                    "Item",
                    "Qty",
                    "Performed By",
                    "Reason / Note",
                    "Ref",
                    "",
                  ].map((h) => (
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
                      className="px-4 py-2.5 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap border-b"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx, index) => {
                  const action = getActionConfig(tx.type);
                  const isSelected = selectedTx?.id === tx.id;

                  return (
                    <tr
                      key={tx.id}
                      style={{
                        backgroundColor: isSelected
                          ? theme.bgActive
                          : index % 2 === 0
                            ? theme.surface
                            : theme.background,
                        borderBottom: `1px solid ${theme.border}`,
                        cursor: "pointer",
                        transition: "background-color 0.1s",
                      }}
                      onClick={() => setSelectedTx(isSelected ? null : tx)}
                      onMouseEnter={(e) => {
                        if (!isSelected)
                          e.currentTarget.style.backgroundColor = theme.bgHover;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = isSelected
                          ? theme.bgActive
                          : index % 2 === 0
                            ? theme.surface
                            : theme.background;
                      }}
                    >
                      {/* Date */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          style={{ color: theme.subtext }}
                          className="text-xs"
                        >
                          {formatDateTime(tx.createdAt)}
                        </span>
                      </td>

                      {/* Action badge */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          style={{
                            backgroundColor: action.bg,
                            color: action.text,
                            border: `1px solid ${action.border}`,
                          }}
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium"
                        >
                          {action.label}
                        </span>
                      </td>

                      {/* Item name */}
                      <td className="px-4 py-3 min-w-[160px]">
                        <span
                          style={{ color: theme.text }}
                          className="text-sm font-medium"
                        >
                          {tx.itemName}
                        </span>
                      </td>

                      {/* Qty */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          style={{
                            color:
                              tx.quantityChange < 0 ? "#dc2626" : "#15803d",
                          }}
                          className="text-sm font-semibold"
                        >
                          {formatQty(tx, unitMap)}
                        </span>
                      </td>

                      {/* Performed by */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: "50%",
                              backgroundColor: avatarColor(tx.performedByName)
                                .bg,
                              color: avatarColor(tx.performedByName).text,
                              fontSize: 9,
                              fontWeight: 700,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(tx.performedByName)}
                          </div>
                          <span
                            style={{ color: theme.text }}
                            className="text-sm"
                          >
                            {tx.performedByName}
                          </span>
                        </div>
                      </td>

                      {/* Reason */}
                      <td className="px-4 py-3" style={{ maxWidth: 240 }}>
                        <span
                          style={{
                            color: theme.subtext,
                            overflow: "hidden",
                            display: "-webkit-box",
                            WebkitLineClamp: 1,
                            WebkitBoxOrient: "vertical",
                          }}
                          className="text-sm"
                        >
                          {tx.reason || "—"}
                        </span>
                      </td>

                      {/* Ref */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          style={{ color: theme.subtext }}
                          className="text-xs font-mono"
                        >
                          {deriveRef(tx)}
                        </span>
                      </td>

                      {/* View chevron */}
                      <td className="px-4 py-3 whitespace-nowrap text-right">
                        <span
                          style={{
                            color: isSelected ? theme.primary : theme.subtext,
                            fontSize: 16,
                            display: "inline-block",
                            transform: isSelected
                              ? "rotate(90deg)"
                              : "rotate(0deg)",
                            transition: "transform 0.15s",
                          }}
                        >
                          ›
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Mobile cards */}
        <div className="md:hidden flex-1 overflow-y-auto px-4 pb-4">
          {filtered.map((tx) => (
            <ActivityCard
              key={tx.id}
              tx={tx}
              unitMap={unitMap}
              isSelected={selectedTx?.id === tx.id}
              onSelect={() => setSelectedTx(selectedTx?.id === tx.id ? null : tx)}
              theme={theme}
            />
          ))}
        </div>
        </>
      )}

      {/* ── Detail drawer ── */}
      <DetailDrawer
        tx={selectedTx}
        unitMap={unitMap}
        onClose={() => setSelectedTx(null)}
        theme={theme}
      />
    </div>
  );
}
