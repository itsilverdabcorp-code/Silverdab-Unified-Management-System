import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useTheme } from "../../../theme/ThemeContext";
import {
  getAuditLogs,
  AnyAuditEntry,
  AuditEntry,
  AuditBatchEntry,
  AuditFieldChange,
  AuditTable,
  isBatchEntry,
} from "../../../services/auditlogs";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatTimestamp = (ts: any): string => {
  if (!ts) return "—";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

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

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = { key: AuditTable; label: string; icon: string };

const TABS: Tab[] = [
  { key: "inventory",   label: "IT Inventory", icon: "🖥" },
  { key: "consumables", label: "Consumables",   icon: "🖨" },
  { key: "tickets",     label: "Tickets",       icon: "🎫" },
];

// ─── Shared value badges ──────────────────────────────────────────────────────

const OldBadge: React.FC<{ value: string }> = ({ value }) => (
  <span
    title={value}
    style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 12, backgroundColor: "#fef2f2", color: "#b91c1c",
      border: "1px solid #fecaca",
      maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}
  >
    {value || "—"}
  </span>
);

const NewBadge: React.FC<{ value: string }> = ({ value }) => (
  <span
    title={value}
    style={{
      display: "inline-block", padding: "2px 8px", borderRadius: 6,
      fontSize: 12, backgroundColor: "#f0fdf4", color: "#15803d",
      border: "1px solid #bbf7d0",
      maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
    }}
  >
    {value || "—"}
  </span>
);

// ─── Single entry row ─────────────────────────────────────────────────────────

type SingleRowProps = {
  entry: AuditEntry;
  theme: ReturnType<typeof useTheme>["theme"];
  index: number;
};

const SingleRow: React.FC<SingleRowProps> = React.memo(({ entry, theme, index }) => (
  <tr style={{ backgroundColor: index % 2 === 0 ? theme.surface : theme.background, borderBottom: `1px solid ${theme.border}` }}>
    <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: theme.subtext, minWidth: 150 }}>
      {formatTimestamp(entry.timestamp)}
    </td>
    <td className="px-4 py-2.5 min-w-[120px]">
      <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-medium"
        style={{ backgroundColor: theme.surfaceRaised, color: theme.text }}>
        {entry.recordId}
      </span>
    </td>
    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: theme.text, minWidth: 110 }}>
      {friendlyField(entry.field)}
    </td>
    <td className="px-4 py-2.5 min-w-[260px]">
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <OldBadge value={entry.oldValue} />
        <span style={{ color: theme.subtext, fontSize: 11 }}>→</span>
        <NewBadge value={entry.newValue} />
      </div>
    </td>
    <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: theme.text, minWidth: 120 }}>
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
          style={{ width: 22, height: 22, backgroundColor: theme.primarySubtle ?? theme.bgActive, color: theme.primary }}>
          {(entry.changedBy ?? "?")[0]?.toUpperCase()}
        </span>
        <span>{entry.changedBy || "—"}</span>
      </div>
    </td>
  </tr>
));

// ─── Batch entry row — expands to show all changed fields ─────────────────────

type BatchRowProps = {
  entry: AuditBatchEntry;
  theme: ReturnType<typeof useTheme>["theme"];
  index: number;
};

const BatchRow: React.FC<BatchRowProps> = React.memo(({ entry, theme, index }) => {
  const [expanded, setExpanded] = useState(false);
  const count = entry.changes.length;
  const bg = index % 2 === 0 ? theme.surface : theme.background;

  return (
    <>
      {/* ── Summary row ── */}
      <tr style={{ backgroundColor: bg, borderBottom: expanded ? "none" : `1px solid ${theme.border}` }}>
        <td className="px-4 py-2.5 whitespace-nowrap text-xs" style={{ color: theme.subtext, minWidth: 150 }}>
          {formatTimestamp(entry.timestamp)}
        </td>
        <td className="px-4 py-2.5 min-w-[120px]">
          <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-medium"
            style={{ backgroundColor: theme.surfaceRaised, color: theme.text }}>
            {entry.recordId}
          </span>
        </td>
        {/* Field column: shows "N fields" + expand toggle */}
        <td className="px-4 py-2.5 text-xs" style={{ minWidth: 110 }}>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{
              background: "none", border: "none", padding: 0, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
            }}
          >
            <span style={{ fontWeight: 600, color: theme.text }}>
              {count} field{count !== 1 ? "s" : ""}
            </span>
            <span style={{
              fontSize: 10, color: theme.subtext, display: "inline-block",
              transform: expanded ? "rotate(0deg)" : "rotate(-90deg)",
              transition: "transform 0.15s",
            }}>▾</span>
          </button>
        </td>
        {/* Old → New: show first change as preview when collapsed */}
        <td className="px-4 py-2.5 min-w-[260px]">
          {!expanded && entry.changes[0] && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <OldBadge value={entry.changes[0].oldValue} />
              <span style={{ color: theme.subtext, fontSize: 11 }}>→</span>
              <NewBadge value={entry.changes[0].newValue} />
              {count > 1 && (
                <span style={{ fontSize: 11, color: theme.subtext }}>+{count - 1} more</span>
              )}
            </div>
          )}
        </td>
        <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: theme.text, minWidth: 120 }}>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center justify-center rounded-full text-[10px] font-bold flex-shrink-0"
              style={{ width: 22, height: 22, backgroundColor: theme.primarySubtle ?? theme.bgActive, color: theme.primary }}>
              {(entry.changedBy ?? "?")[0]?.toUpperCase()}
            </span>
            <span>{entry.changedBy || "—"}</span>
          </div>
        </td>
      </tr>

      {/* ── Expanded field rows ── */}
      {expanded && entry.changes.map((c: AuditFieldChange, i: number) => (
        <tr
          key={i}
          style={{
            backgroundColor: bg,
            borderBottom: i === entry.changes.length - 1 ? `1px solid ${theme.border}` : "none",
          }}
        >
          {/* Empty timestamp + record cells — indented under parent */}
          <td className="px-4 py-1.5" />
          <td className="px-4 py-1.5" />
          <td className="px-4 py-1.5 text-xs" style={{ color: theme.subtext, paddingLeft: 24 }}>
            <span style={{ borderLeft: `2px solid ${theme.border}`, paddingLeft: 8 }}>
              {friendlyField(c.field)}
            </span>
          </td>
          <td className="px-4 py-1.5 min-w-[260px]">
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <OldBadge value={c.oldValue} />
              <span style={{ color: theme.subtext, fontSize: 11 }}>→</span>
              <NewBadge value={c.newValue} />
            </div>
          </td>
          <td className="px-4 py-1.5" />
        </tr>
      ))}
    </>
  );
});

// ─── Dispatcher ───────────────────────────────────────────────────────────────

const AuditRow: React.FC<{ entry: AnyAuditEntry; theme: ReturnType<typeof useTheme>["theme"]; index: number }> = ({ entry, theme, index }) =>
  isBatchEntry(entry)
    ? <BatchRow entry={entry} theme={theme} index={index} />
    : <SingleRow entry={entry as AuditEntry} theme={theme} index={index} />;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AuditTrailPage() {
  const { theme } = useTheme();
  const [activeTab, setActiveTab]   = useState<AuditTable>("inventory");
  const [logs, setLogs]             = useState<Record<AuditTable, AnyAuditEntry[]>>({
    inventory: [], consumables: [], tickets: [], office_inventory: [], supply_requests: [],
  });
  const [loadingTab, setLoadingTab] = useState<AuditTable | null>(null);
  const [loadedTabs, setLoadedTabs] = useState<Set<AuditTable>>(new Set());
  const [search, setSearch]         = useState("");
  const [fieldFilter, setFieldFilter] = useState("");

  const fetchTab = useCallback(async (tab: AuditTable) => {
    if (loadedTabs.has(tab)) return;
    setLoadingTab(tab);
    try {
      const entries = await getAuditLogs(tab, 300);
      setLogs((prev) => ({ ...prev, [tab]: entries }));
      setLoadedTabs((prev) => new Set(prev).add(tab));
    } catch (err) {
      console.error(`[audit] Failed to load ${tab} logs:`, err);
    } finally {
      setLoadingTab(null);
    }
  }, [loadedTabs]);

  useEffect(() => { fetchTab("inventory"); }, []);

  const handleTabChange = (tab: AuditTable) => {
    setActiveTab(tab);
    setSearch("");
    setFieldFilter("");
    fetchTab(tab);
  };

  const currentLogs = logs[activeTab];

  // Unique field names — flattened across both entry types
  const uniqueFields = useMemo(() => {
    const fields = new Set<string>();
    currentLogs.forEach((e) => {
      if (isBatchEntry(e)) e.changes.forEach((c) => fields.add(c.field));
      else fields.add((e as AuditEntry).field);
    });
    return Array.from(fields).sort();
  }, [currentLogs]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return currentLogs.filter((e) => {
      // Field filter
      if (fieldFilter) {
        const hasField = isBatchEntry(e)
          ? e.changes.some((c) => c.field === fieldFilter)
          : (e as AuditEntry).field === fieldFilter;
        if (!hasField) return false;
      }
      // Search
      if (q) {
        const haystack = isBatchEntry(e)
          ? [e.recordId, e.changedBy, ...e.changes.flatMap((c) => [c.field, c.oldValue, c.newValue])].join(" ").toLowerCase()
          : [(e as AuditEntry).recordId, (e as AuditEntry).field, (e as AuditEntry).oldValue, (e as AuditEntry).newValue, (e as AuditEntry).changedBy].join(" ").toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [currentLogs, search, fieldFilter]);

  const isLoading = loadingTab === activeTab;

  return (
    <div style={{ backgroundColor: theme.background, height: "100%" }} className="flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="flex-shrink-0 px-5 pt-5 pb-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 style={{ color: theme.text }} className="text-xl font-bold">Audit Trail</h1>
            <p style={{ color: theme.subtext }} className="text-xs mt-0.5">
              Full history of field-level changes across all tables
            </p>
          </div>
          <span className="text-xs px-2.5 py-1 rounded-full font-medium"
            style={{ backgroundColor: theme.surfaceRaised, color: theme.subtext, border: `1px solid ${theme.border}` }}>
            SuperAdmin only
          </span>
        </div>

        {/* ── Tabs ── */}
        <div className="flex items-center gap-2 mb-4">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count    = logs[tab.key].length;
            return (
              <button key={tab.key} type="button" onClick={() => handleTabChange(tab.key)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
                style={{
                  backgroundColor: isActive ? theme.primary : theme.surface,
                  color: isActive ? theme.primaryText : theme.subtext,
                  borderColor: isActive ? theme.primary : theme.border,
                }}>
                <span>{tab.icon}</span>
                {tab.label}
                {loadedTabs.has(tab.key) && (
                  <span className="px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isActive ? "rgba(255,255,255,0.25)" : theme.surfaceRaised,
                      color: isActive ? theme.primaryText : theme.subtext,
                    }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── Search + Field filter ── */}
        <div className="flex items-center gap-2 mb-3">
          <input type="text" placeholder="Search by record, field, value, or user…"
            value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ backgroundColor: theme.inputBg, borderColor: theme.inputBorder, color: theme.inputText }}
            className="flex-1 px-3 py-2 text-sm border rounded-lg focus:outline-none"
            onFocus={(e) => (e.currentTarget.style.borderColor = theme.inputBorderFocus)}
            onBlur={(e)  => (e.currentTarget.style.borderColor = theme.inputBorder)}
          />
          <select value={fieldFilter} onChange={(e) => setFieldFilter(e.target.value)}
            style={{ backgroundColor: theme.surface, borderColor: theme.border, color: fieldFilter ? theme.text : theme.subtext }}
            className="px-3 py-2 text-xs border rounded-lg focus:outline-none">
            <option value="">All fields</option>
            {uniqueFields.map((f) => (
              <option key={f} value={f}>{friendlyField(f)}</option>
            ))}
          </select>
        </div>

        <p style={{ color: theme.subtext }} className="text-xs mb-2">
          {isLoading ? "Loading…" : `${filtered.length} entries`}
        </p>
      </div>

      {/* ── Table ── */}
      {isLoading ? (
        <div className="flex flex-1 items-center justify-center">
          <div style={{ borderColor: theme.primary }} className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <p style={{ color: theme.subtext }} className="text-sm">
            {currentLogs.length === 0 ? "No audit logs yet for this table." : "No entries match your search."}
          </p>
        </div>
      ) : (
        <div className="inventory-scroll flex-1 overflow-y-auto overflow-x-auto px-5 pb-5">
          <div style={{ borderColor: theme.border }} className="rounded-lg border">
            <table className="min-w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Timestamp", "Record", "Field", "Old → New", "Changed By"].map((h) => (
                    <th key={h}
                      style={{
                        color: theme.subtext, borderColor: theme.border,
                        backgroundColor: theme.surfaceRaised, position: "sticky", top: 0, zIndex: 10,
                      }}
                      className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide whitespace-nowrap border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry, i) => (
                  <AuditRow key={entry.id ?? i} entry={entry} theme={theme} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
