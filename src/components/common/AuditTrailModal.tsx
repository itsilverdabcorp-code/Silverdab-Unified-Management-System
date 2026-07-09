import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
// @ts-ignore
import ReactDOM from "react-dom";
import { useTheme } from "../../theme/ThemeContext";
import {
  getAuditLogs,
  AnyAuditEntry,
  AuditTable,
  isBatchEntry,
  AuditEntry,
  AuditBatchEntry,
} from "../../services/auditlogs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const FIELD_LABEL: Record<string, string> = {
  status:        "Status",
  priority:      "Priority",
  category:      "Category",
  assigneeId:    "Assignee ID",
  assigneeName:  "Assignee",
  requesterId:   "Requester ID",
  requesterName: "Requester",
  dueDate:       "Due Date",
  summary:       "Summary",
  details:       "Details",
  location:      "Location",
  company:       "Company",
  model:         "Model",
  quantity:      "Quantity",
  updatedAt:     "Updated At",
  notes:         "Notes",
  datePurchased: "Date Purchased",
  brand:         "Brand",
  serialNumber:  "Serial Number",
};

const friendlyField = (f: string) =>
  FIELD_LABEL[f] ?? f.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase());

const getDayLabel = (ts: any): string => {
  if (!ts) return "Unknown";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const entryDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (entryDay.getTime() === today.getTime()) return "Today";
  if (entryDay.getTime() === yesterday.getTime()) return "Yesterday";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
};

const formatTime = (ts: any): string => {
  if (!ts) return "—";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  const day  = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${time} · ${day}`;
};

const getInitials = (name: string): string => {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AVATAR_COLORS = [
  { bg: "#dbeafe", text: "#1e40af" },
  { bg: "#fce7f3", text: "#9d174d" },
  { bg: "#d1fae5", text: "#065f46" },
  { bg: "#ede9fe", text: "#5b21b6" },
  { bg: "#fef9c3", text: "#854d0e" },
  { bg: "#cffafe", text: "#155e75" },
  { bg: "#ffedd5", text: "#9a3412" },
  { bg: "#f3e8ff", text: "#6b21a8" },
];

const avatarColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const groupByDay = (entries: AnyAuditEntry[]): { label: string; entries: AnyAuditEntry[] }[] => {
  const map = new Map<string, AnyAuditEntry[]>();
  for (const e of entries) {
    const label = getDayLabel(e.timestamp);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(e);
  }
  return Array.from(map.entries()).map(([label, entries]) => ({ label, entries }));
};

const getFieldTabs = (logs: AnyAuditEntry[]): string[] => {
  const seen = new Set<string>();
  for (const e of logs) {
    if (isBatchEntry(e)) e.changes.forEach((c) => seen.add(c.field));
    else seen.add((e as AuditEntry).field);
  }
  return Array.from(seen).sort();
};

// ─── Value badge ──────────────────────────────────────────────────────────────

const ValueBadge: React.FC<{ value: string; variant: "old" | "new" }> = ({ value, variant }) => {
  const style =
    variant === "old"
      ? { backgroundColor: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }
      : { backgroundColor: "#f0fdf4", color: "#15803d", border: "1px solid #bbf7d0" };

  return (
    <span
      title={value}
      style={{
        ...style,
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 12,
        // Let badge fill available space but never overflow — truncate with ellipsis
        minWidth: 0,
        flex: "1 1 0",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      }}
    >
      {value || "—"}
    </span>
  );
};

// ─── Field change row — single-line grid layout ───────────────────────────────
//
//  [Field label]  [old badge ──────]  →  [new badge ──────]
//
//  Uses a CSS grid so all three columns stay on ONE line regardless of value
//  length. The two badge columns are equal flex and truncate with ellipsis.

const FieldChangeRow: React.FC<{
  field: string;
  oldValue: string;
  newValue: string;
  theme: ReturnType<typeof useTheme>["theme"];
}> = ({ field, oldValue, newValue, theme }) => (
  <div
    style={{
      display: "grid",
      // col 1: field label (fixed 90px), col 2: old badge (flex), col 3: arrow (fixed), col 4: new badge (flex)
      gridTemplateColumns: "90px 1fr 18px 1fr",
      alignItems: "center",
      gap: "0 6px",
      marginBottom: 5,
      minWidth: 0,
    }}
  >
    <span
      style={{
        fontSize: 11,
        color: theme.subtext,
        whiteSpace: "nowrap",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {friendlyField(field)}
    </span>
    <ValueBadge value={oldValue || "—"} variant="old" />
    <span style={{ color: theme.subtext, fontSize: 12, textAlign: "center" }}>→</span>
    <ValueBadge value={newValue || "—"} variant="new" />
  </div>
);

// ─── Batch entry ──────────────────────────────────────────────────────────────

const BatchFeedEntry: React.FC<{
  entry: AuditBatchEntry;
  showRecord: boolean;
  theme: ReturnType<typeof useTheme>["theme"];
  isLast: boolean;
}> = React.memo(({ entry, showRecord, theme, isLast }) => {
  const colors  = avatarColor(entry.changedBy ?? "");
  const [expanded, setExpanded] = useState(true);
  const count = entry.changes.length;

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${theme.border}`, padding: "12px 0" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        {/* Avatar */}
        <div
          style={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: colors.bg, color: colors.text,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}
        >
          {getInitials(entry.changedBy ?? "")}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name + record badge */}
          <p style={{ margin: 0, fontSize: 13, lineHeight: "1.4", color: theme.text, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>{entry.changedBy || "Unknown"}</span>
            {showRecord && <span style={{ color: theme.subtext }}>on</span>}
            {showRecord && (
              <span style={{ fontFamily: "monospace", fontSize: 11, backgroundColor: theme.surfaceRaised, color: theme.text, padding: "1px 5px", borderRadius: 4 }}>
                {entry.recordId}
              </span>
            )}
          </p>

          {/* Summary + collapse toggle */}
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, margin: "4px 0 6px" }}
          >
            <span style={{ fontSize: 13, color: theme.subtext }}>
              updated <span style={{ fontWeight: 600, color: theme.text }}>{count} field{count !== 1 ? "s" : ""}</span>
            </span>
            <span style={{ fontSize: 10, color: theme.subtext, display: "inline-block", transform: expanded ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>▾</span>
          </button>

          {/* Expanded rows */}
          {expanded && (
            <div style={{ borderLeft: `2px solid ${theme.border}`, paddingLeft: 10, marginBottom: 6 }}>
              {entry.changes.map((c, i) => (
                <FieldChangeRow key={i} field={c.field} oldValue={c.oldValue} newValue={c.newValue} theme={theme} />
              ))}
            </div>
          )}

          <p style={{ margin: 0, fontSize: 11, color: theme.subtext }}>{formatTime(entry.timestamp)}</p>
        </div>
      </div>
    </div>
  );
});

// ─── Single entry (legacy inline edits) ──────────────────────────────────────

const SingleFeedEntry: React.FC<{
  entry: AuditEntry;
  showRecord: boolean;
  theme: ReturnType<typeof useTheme>["theme"];
  isLast: boolean;
}> = React.memo(({ entry, showRecord, theme, isLast }) => {
  const colors = avatarColor(entry.changedBy ?? "");

  return (
    <div style={{ borderBottom: isLast ? "none" : `1px solid ${theme.border}`, padding: "12px 0" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: "50%",
            backgroundColor: colors.bg, color: colors.text,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 12, fontWeight: 600, flexShrink: 0,
          }}
        >
          {getInitials(entry.changedBy ?? "")}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: "1.4", color: theme.text, display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
            <span style={{ fontWeight: 600 }}>{entry.changedBy || "Unknown"}</span>
            {showRecord && <span style={{ color: theme.subtext }}>on</span>}
            {showRecord && (
              <span style={{ fontFamily: "monospace", fontSize: 11, backgroundColor: theme.surfaceRaised, color: theme.text, padding: "1px 5px", borderRadius: 4 }}>
                {entry.recordId}
              </span>
            )}
          </p>
          <p style={{ margin: "2px 0 8px", fontSize: 13, color: theme.subtext }}>
            changed <span style={{ fontWeight: 600, color: theme.text }}>{friendlyField(entry.field)}</span>
          </p>

          {/* Reuse the same grid row for single entries too */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 18px 1fr", alignItems: "center", gap: "0 6px", minWidth: 0 }}>
            <ValueBadge value={entry.oldValue || "—"} variant="old" />
            <span style={{ color: theme.subtext, fontSize: 12, textAlign: "center" }}>→</span>
            <ValueBadge value={entry.newValue || "—"} variant="new" />
          </div>

          <p style={{ margin: "6px 0 0", fontSize: 11, color: theme.subtext }}>{formatTime(entry.timestamp)}</p>
        </div>
      </div>
    </div>
  );
});

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const FeedEntry: React.FC<{
  entry: AnyAuditEntry;
  showRecord: boolean;
  theme: ReturnType<typeof useTheme>["theme"];
  isLast: boolean;
}> = ({ entry, showRecord, theme, isLast }) =>
  isBatchEntry(entry) ? (
    <BatchFeedEntry entry={entry} showRecord={showRecord} theme={theme} isLast={isLast} />
  ) : (
    <SingleFeedEntry entry={entry as AuditEntry} showRecord={showRecord} theme={theme} isLast={isLast} />
  );

// ─── Props ────────────────────────────────────────────────────────────────────

export type AuditTrailModalProps = {
  visible: boolean;
  onClose: () => void;
  table: AuditTable;
  recordId?: string;
  recordLabel?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WIDTH = 420;
const MIN_WIDTH     = 320;
const MAX_WIDTH     = 800;

// ─── Drawer ───────────────────────────────────────────────────────────────────

const AuditTrailModal: React.FC<AuditTrailModalProps> = ({
  visible,
  onClose,
  table,
  recordId,
  recordLabel,
}) => {
  const { theme } = useTheme();
  const [logs,      setLogs]      = useState<AnyAuditEntry[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");
  const [width,     setWidth]     = useState(DEFAULT_WIDTH);

  // ── Drag-to-resize ─────────────────────────────────────────────────────────
  const dragging   = useRef(false);
  const startX     = useRef(0);
  const startWidth = useRef(DEFAULT_WIDTH);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current   = true;
    startX.current     = e.clientX;
    startWidth.current = width;

    // Inject a transparent overlay so cursor stays col-resize even over iframes
    const overlay = document.createElement("div");
    overlay.id = "audit-resize-overlay";
    Object.assign(overlay.style, {
      position: "fixed", inset: "0", zIndex: "999999",
      cursor: "col-resize",
    });
    document.body.appendChild(overlay);

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const delta  = startX.current - ev.clientX;          // drag left = wider
      const next   = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth.current + delta));
      setWidth(next);
    };

    const onUp = () => {
      dragging.current = false;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      document.getElementById("audit-resize-overlay")?.remove();
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, [width]);

  // ── Data fetch ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setActiveTab("all");
    setLogs([]);
    setLoading(true);
    getAuditLogs(table, 300, recordId)
      .then(setLogs)
      .catch((err) => console.error("[AuditTrailModal] fetch error:", err))
      .finally(() => setLoading(false));
  }, [visible, table, recordId]);

  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [visible, onClose]);

  // ── Scrollbar style ────────────────────────────────────────────────────────
  useEffect(() => {
    const style = document.createElement("style");
    style.id = "audit-drawer-scrollbar";
    style.textContent = `
      .audit-drawer-scroll::-webkit-scrollbar { width: 4px; }
      .audit-drawer-scroll::-webkit-scrollbar-track { background: transparent; }
      .audit-drawer-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 999px; }
      .audit-drawer-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
    `;
    document.getElementById("audit-drawer-scrollbar")?.remove();
    document.head.appendChild(style);
    return () => document.getElementById("audit-drawer-scrollbar")?.remove();
  }, [theme]);

  const fieldTabs = useMemo(() => getFieldTabs(logs), [logs]);

  const filtered = useMemo(() => {
    if (activeTab === "all") return logs;
    return logs.filter((e) =>
      isBatchEntry(e)
        ? e.changes.some((c) => c.field === activeTab)
        : (e as AuditEntry).field === activeTab
    );
  }, [logs, activeTab]);

  const grouped = useMemo(() => groupByDay(filtered), [filtered]);

  if (!visible) return null;

  const drawer = (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 99998 }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        style={{
          position: "fixed", top: 0, right: 0, bottom: 0,
          width,                                          // ← controlled by drag
          backgroundColor: theme.background,
          borderLeft: `1px solid ${theme.border}`,
          zIndex: 99999,
          display: "flex", flexDirection: "column",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.2)",
          minWidth: MIN_WIDTH, maxWidth: MAX_WIDTH,
        }}
      >
        {/* ── Resize handle — 6px strip on the left edge ── */}
        <div
          onMouseDown={onMouseDown}
          style={{
            position: "absolute", top: 0, left: 0, bottom: 0,
            width: 6,
            cursor: "col-resize",
            zIndex: 1,
            // Subtle visual affordance: a thin line + hover highlight
            borderLeft: `2px solid transparent`,
            transition: "border-color 0.15s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.borderLeftColor = theme.primary)}
          onMouseLeave={(e) => (e.currentTarget.style.borderLeftColor = "transparent")}
          title="Drag to resize"
        />

        {/* ── Header ── */}
        <div style={{ flexShrink: 0, padding: "14px 16px 0", borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
              stroke={theme.subtext} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0 }}
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>

            <span style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Audit trail</span>

            {recordLabel && (
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 6,
                backgroundColor: theme.surfaceRaised, color: theme.subtext,
                border: `1px solid ${theme.border}`, fontFamily: "monospace",
                maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {recordLabel}
              </span>
            )}

            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{
                marginLeft: "auto", width: 28, height: 28, borderRadius: 8,
                border: "none", backgroundColor: "transparent", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: theme.subtext, fontSize: 16,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = theme.bgHover)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              ✕
            </button>
          </div>

          {/* Filter tabs */}
          {!loading && fieldTabs.length > 0 && (
            <div className="audit-drawer-scroll"
              style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 10, scrollbarWidth: "none" }}
            >
              {["all", ...fieldTabs].map((f) => {
                const isActive = activeTab === f;
                return (
                  <button
                    key={f} type="button" onClick={() => setActiveTab(f)}
                    style={{
                      flexShrink: 0, padding: "4px 12px", borderRadius: 20, fontSize: 12,
                      fontWeight: isActive ? 600 : 400, cursor: "pointer",
                      border: `1px solid ${isActive ? theme.primary : theme.border}`,
                      backgroundColor: isActive ? theme.primary : theme.surface,
                      color: isActive ? theme.primaryText : theme.subtext,
                      transition: "all 0.15s",
                    }}
                  >
                    {f === "all" ? "All" : friendlyField(f)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Feed body ── */}
        {loading ? (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%",
              border: `3px solid ${theme.border}`, borderTopColor: theme.primary,
              animation: "spin 0.7s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={theme.border} strokeWidth={1.5}>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p style={{ color: theme.subtext, fontSize: 13, margin: 0 }}>
              {logs.length === 0 ? "No audit logs yet." : "No entries for this field."}
            </p>
          </div>
        ) : (
          <div className="audit-drawer-scroll" style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
            {grouped.map(({ label, entries }) => (
              <div key={label}>
                <p style={{
                  fontSize: 11, fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.06em", color: theme.subtext, margin: "16px 0 4px",
                }}>
                  {label}
                </p>
                {entries.map((entry, i) => (
                  <FeedEntry
                    key={entry.id ?? i}
                    entry={entry}
                    showRecord={!recordId}
                    theme={theme}
                    isLast={i === entries.length - 1}
                  />
                ))}
              </div>
            ))}
            <div style={{ height: 24 }} />
          </div>
        )}
      </div>
    </>
  );

  return ReactDOM.createPortal(drawer, document.body);
};

export default AuditTrailModal;
