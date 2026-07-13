import React, { useEffect, useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  RefreshControl,
  Platform,
  Dimensions,
  useWindowDimensions,
} from "react-native";
import {
  Search,
  X,
  ChevronRight,
  ChevronLeft,
  Clock,
  CheckCircle,
  Circle,
  RefreshCw,
  Package,
  MonitorSmartphone,
  Send,
} from "lucide-react-native";
import { useTheme } from "../../../theme/ThemeContext";
import { ADUser, ConcernTicket, SupplyRequest } from "../../../../types";
import { getTicketsByRequester } from "../../../services/ticketService";
import SupplyRequestModal from "./Modal/SupplyRequestModal";
// import ITConcernModal from "./Modal/ITConcernModal";
import { getAllSupplyRequests } from "@/services/supplyRequest";

// ─── Types ────────────────────────────────────────────────────────────────────

type TicketSource = "it" | "supply";
type TicketType = "it" | "hr" | "supply";
type Step = 1 | 2 | 3 | 4;
type TabKey = "All" | "Pending" | "In Progress" | "Resolved" | "Rejected";

const TABS: TabKey[] = [
  "All",
  "Pending",
  "In Progress",
  "Resolved",
  "Rejected",
];

const HR_CATEGORIES = [
  "Overtime Filing",
  "Schedule Adjustment",
  "Attendance Correction",
  "Other HR Concerns",
] as const;

const PRIORITY_OPTIONS = ["Normal", "Urgent", "Critical"] as const;
type PriorityValue = (typeof PRIORITY_OPTIONS)[number];

type UnifiedTicket = {
  _source: TicketSource;
  id: string;
  ticketNumber: string;
  title: string;
  status: string;
  displayStatus?: string;
  dateCreated: any;
  category: string;
  itTicket?: ConcernTicket;
  supplyRequest?: SupplyRequest;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

const toReadableDate = (value: any): string => {
  if (!value) return "—";
  try {
    let date: Date;
    if (typeof value?.toDate === "function") date = value.toDate();
    else if (value instanceof Date) date = value;
    else date = new Date(value);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "—";
  }
};

const SUPPLY_STATUS_MAP: Record<string, string> = {
  pending: "Pending",
  awaiting_stock: "In Progress",
  out_for_delivery: "In Progress",
  resolved: "Resolved",
  rejected: "Rejected",
};
const normaliseSupplyStatus = (raw: string) => SUPPLY_STATUS_MAP[raw] ?? raw;

// Separate label used only for the badge text/color — keeps "Out for
// Delivery" visually distinct while it still counts toward and filters
// under the "In Progress" tab above.
const SUPPLY_DISPLAY_STATUS_MAP: Record<string, string> = {
  pending: "Pending",
  awaiting_stock: "In Progress",
  out_for_delivery: "Out for Delivery",
  resolved: "Resolved",
  rejected: "Rejected",
};
const displaySupplyStatus = (raw: string) =>
  SUPPLY_DISPLAY_STATUS_MAP[raw] ?? raw;

// ─── Status / source config ───────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  string,
  { bg: string; border: string; text: string }
> = {
  Pending: { bg: "#FEF9C3", border: "#FDE047", text: "#A16207" },
  "In Progress": { bg: "#DBEAFE", border: "#93C5FD", text: "#1D4ED8" },
   "Out for Delivery": { bg: "#FFEDD5", border: "#FDBA74", text: "#C2410C" },
  Resolved: { bg: "#DCFCE7", border: "#86EFAC", text: "#15803D" },
  Rejected: { bg: "#FEE2E2", border: "#FECACA", text: "#DC2626" },
};

const SOURCE_CONFIG: Record<
  TicketSource,
  { bg: string; text: string; label: string }
> = {
  it: { bg: "#EEF2FF", text: "#4338CA", label: "IT" },
  supply: { bg: "#F0FDF4", text: "#15803D", label: "Supply" },
};

// ─── Fetch helpers ────────────────────────────────────────────────────────────

async function getSupplyRequestsByUser(
  userId: string,
  userName: string,
): Promise<SupplyRequest[]> {
  const all = await getAllSupplyRequests();
  return all.filter(
    (r) => r.requestedById === userId || r.requestedByName === userName,
  );
}

function mergeTickets(
  it: ConcernTicket[],
  supply: SupplyRequest[],
): UnifiedTicket[] {
  const itUnified: UnifiedTicket[] = it.map((t) => ({
    _source: "it",
    id: t.id ?? t.ticketNumber,
    ticketNumber: t.ticketNumber,
    title: t.summary,
    status: t.status,
    dateCreated: t.dateCreated,
    category: t.category ?? "IT Concern",
    itTicket: t,
  }));

  const supplyUnified: UnifiedTicket[] = supply.map((r) => ({
    _source: "supply",
    id: r.id,
    ticketNumber: r.ticketNumber,
    title: r.items?.length
      ? r.items.length === 1
        ? r.items[0].itemName
        : `${r.items[0].itemName} +${r.items.length - 1} more`
      : "Supply Request",
    status: normaliseSupplyStatus(r.status),
    displayStatus: displaySupplyStatus(r.status),
    dateCreated: r.createdAt,
    category: "Supply",
    supplyRequest: r,
  }));

  const toMs = (v: any): number => {
    if (!v) return 0;
    if (typeof v?.toDate === "function") return v.toDate().getTime();
    if (v instanceof Date) return v.getTime();
    const d = new Date(v);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  return [...itUnified, ...supplyUnified].sort(
    (a, b) => toMs(b.dateCreated) - toMs(a.dateCreated),
  );
}

const toMs = (v: any): number => {
  if (!v) return 0;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (v instanceof Date) return v.getTime();
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
};

// ─── Shared badge / tag components ───────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? {
    bg: "#F3F4F6",
    border: "#D1D5DB",
    text: "#6B7280",
  };
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: 100,
        paddingHorizontal: 9,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{ fontFamily: "Outfit-medium", fontSize: 11, color: c.text }}
      >
        {status}
      </Text>
    </View>
  );
}

function SourceTag({ source }: { source: TicketSource }) {
  const c = SOURCE_CONFIG[source];
  return (
    <View
      style={{
        backgroundColor: c.bg,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 2,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
      }}
    >
      {source === "it" ? (
        <MonitorSmartphone size={9} color={c.text} />
      ) : (
        <Package size={9} color={c.text} />
      )}
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 10,
          color: c.text,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {c.label}
      </Text>
    </View>
  );
}

// ─── Left panel: New Request + Stats ─────────────────────────────────────────

type TicketTypeOption = {
  key: TicketType;
  icon: string;
  name: string;
  hint: string;
  badge?: string;
  accent: string;
};

const TICKET_TYPES: TicketTypeOption[] = [
  // {
  //   key: "it",
  //   icon: "💻",
  //   name: "IT concern",
  //   hint: "Hardware, software, network, access issues",
  //   accent: "#0EA5E9",
  // },
  // {
  //   key: "hr",
  //   icon: "📋",
  //   name: "HR concern",
  //   hint: "Overtime, attendance, schedule changes",
  //   badge: "Draft",
  //   accent: "#7C3AED",
  // },
  {
    key: "supply",
    icon: "📦",
    name: "Office supply",
    hint: "Request items from inventory stock",
    accent: "#10B981",
  },
];

type StatCardProps = {
  label: string;
  value: number;
  sub: string;
  dotColor: string;
  theme: any;
};

function StatCard({ label, value, sub, dotColor, theme }: StatCardProps) {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.surface,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: theme.border,
        padding: 12,
      }}
    >
      <Text
        style={{
          fontFamily: "Outfit",
          fontSize: 11,
          color: theme.subtext,
          marginBottom: 4,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 20,
          color: theme.textActive ?? theme.text,
          marginBottom: 4,
        }}
      >
        {value}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: dotColor,
          }}
        />
        <Text
          style={{ fontFamily: "Outfit", fontSize: 10, color: theme.subtext }}
        >
          {sub}
        </Text>
      </View>
    </View>
  );
}

type LeftPanelProps = {
  ticketType: TicketType | null;
  setTicketType: (t: TicketType) => void;
  onContinue: () => void;
  counts: Record<TabKey, number>;
  theme: any;
  primary: string;
  isMobile: boolean;
};

function LeftPanel({
  ticketType,
  setTicketType,
  onContinue,
  counts,
  theme,
  primary,
  isMobile,
}: LeftPanelProps) {
  const continueLabel =
    ticketType === "it"
      ? "Continue with IT concern"
      : ticketType === "hr"
        ? "Continue with HR concern"
        : ticketType === "supply"
          ? "Continue with office supply"
          : "Select a type to continue";

  return (
    <View style={isMobile ? { width: "100%" } : { width: 240, flexShrink: 0 }}>
      {/* New request panel */}
      <View
        style={{
          backgroundColor: theme.surface ?? theme.background,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 12,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            padding: 14,
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 10,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: theme.subtext,
              marginBottom: 2,
            }}
          >
            New request
          </Text>
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 14,
              color: theme.textActive ?? theme.text,
            }}
          >
            What do you need help with?
          </Text>
        </View>

        <View style={{ padding: 10, gap: 7 }}>
          {TICKET_TYPES.map((t) => {
            const sel = ticketType === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTicketType(t.key)}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: sel ? t.accent : theme.border,
                  backgroundColor: sel ? t.accent + "14" : theme.background,
                }}
              >
                <Text style={{ fontSize: 18, marginTop: 1 }}>{t.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      fontFamily: "Outfit-medium",
                      fontSize: 13,
                      color: sel ? t.accent : (theme.textActive ?? theme.text),
                      marginBottom: 2,
                    }}
                  >
                    {t.name}
                  </Text>
                  <Text
                    style={{
                      fontFamily: "Outfit",
                      fontSize: 11,
                      color: theme.subtext,
                      lineHeight: 15,
                    }}
                  >
                    {t.hint}
                  </Text>
                  {t.badge && (
                    <View
                      style={{
                        alignSelf: "flex-start",
                        marginTop: 4,
                        backgroundColor: "#FFF7ED",
                        borderRadius: 100,
                        borderWidth: 1,
                        borderColor: "#FED7AA",
                        paddingHorizontal: 7,
                        paddingVertical: 1,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 9,
                          color: "#C2410C",
                        }}
                      >
                        {t.badge}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={{ paddingHorizontal: 10, paddingBottom: 12 }}>
          <TouchableOpacity
            onPress={onContinue}
            disabled={!ticketType}
            activeOpacity={0.8}
            style={{
              backgroundColor: primary,
              borderRadius: 8,
              paddingVertical: 10,
              alignItems: "center",
              flexDirection: "row",
              justifyContent: "center",
              gap: 6,
              opacity: ticketType ? 1 : 0.4,
            }}
          >
            <Send size={12} color="#fff" />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 12,
                color: "#fff",
              }}
            >
              {continueLabel}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Stats grid */}
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
        <StatCard
          label="Open"
          value={counts["In Progress"]}
          sub="Active"
          dotColor="#378ADD"
          theme={theme}
        />
        <StatCard
          label="Pending"
          value={counts["Pending"]}
          sub="Awaiting review"
          dotColor="#EF9F27"
          theme={theme}
        />
      </View>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <StatCard
          label="Resolved"
          value={counts["Resolved"]}
          sub="All time"
          dotColor="#639922"
          theme={theme}
        />
        <StatCard
          label="Total"
          value={counts["All"]}
          sub="Supply"
          dotColor={theme.subtext}
          theme={theme}
        />
      </View>
    </View>
  );
}

// ─── Column widths (matches HTML reference grid) ──────────────────────────────
// grid-template-columns: 90px 1fr 100px 90px 32px
const COL = { ticketNo: 90, status: 150, date: 90, chev: 32 } as const;

// ─── Ticket list row ──────────────────────────────────────────────────────────

function TicketRow({
  ticket,
  onPress,
  theme,
  primary,
}: {
  ticket: UnifiedTicket;
  onPress: () => void;
  theme: any;
  primary: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 11,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
      }}
    >
      {/* Col 1 — Ticket no. + source tag */}
      <View
        style={{
          width: COL.ticketNo,
          flexShrink: 0,
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          flexWrap: "wrap",
        }}
      >
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 11,
            color: primary,
            fontVariant: ["tabular-nums"],
          }}
        >
          #{ticket.ticketNumber}
        </Text>
        <SourceTag source={ticket._source} />
      </View>

      {/* Col 2 — Title + subtitle (flex fill) */}
      <View style={{ flex: 1, paddingRight: 10 }}>
        <Text
          style={{
            fontFamily: "Outfit-medium",
            fontSize: 13,
            color: theme.textActive ?? theme.text,
            lineHeight: 18,
          }}
          numberOfLines={1}
        >
          {ticket.title}
        </Text>
        <Text
          style={{
            fontFamily: "Outfit",
            fontSize: 10,
            color: theme.subtext,
            marginTop: 2,
          }}
          numberOfLines={1}
        >
          {ticket.category}
          {ticket._source === "it" && ticket.itTicket?.assigneeName
            ? ` · Assigned to ${ticket.itTicket.assigneeName}`
            : ""}
        </Text>
      </View>

      {/* Col 3 — Status badge */}
      <View style={{ width: COL.status, alignItems: "flex-start" }}>
        <StatusBadge status={ticket.displayStatus ?? ticket.status} />
      </View>

      {/* Col 4 — Date filed */}
      <View style={{ width: COL.date }}>
        <Text
          style={{ fontFamily: "Outfit", fontSize: 12, color: theme.subtext }}
        >
          {toReadableDate(ticket.dateCreated)}
        </Text>
      </View>

      {/* Col 5 — Chevron */}
      <View style={{ width: COL.chev, alignItems: "center" }}>
        <ChevronRight size={14} color={theme.subtext} />
      </View>
    </TouchableOpacity>
  );
}

// ─── Mobile ticket card ────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  onPress,
  theme,
  primary,
}: {
  ticket: UnifiedTicket;
  onPress: () => void;
  theme: any;
  primary: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 6,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 11,
              color: primary,
            }}
          >
            #{ticket.ticketNumber}
          </Text>
          <SourceTag source={ticket._source} />
        </View>
        <StatusBadge status={ticket.displayStatus ?? ticket.status} />
      </View>

      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 13,
          color: theme.textActive ?? theme.text,
          marginBottom: 3,
        }}
        numberOfLines={1}
      >
        {ticket.title}
      </Text>

      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text
          style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}
          numberOfLines={1}
        >
          {ticket.category}
        </Text>
        <Text
          style={{ fontFamily: "Outfit", fontSize: 11, color: theme.subtext }}
        >
          {toReadableDate(ticket.dateCreated)}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ─── Table header ─────────────────────────────────────────────────────────────

function TableHeader({ theme }: { theme: any }) {
  const thStyle = {
    fontFamily: "Outfit-medium",
    fontSize: 10,
    color: theme.subtext,
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
  };
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: theme.border,
        backgroundColor:
          theme.surfaceRaised ?? theme.surface ?? theme.background,
      }}
    >
      {/* Col 1 */}
      <Text style={[thStyle, { width: COL.ticketNo, flexShrink: 0 }]}>
        Ticket no.
      </Text>
      {/* Col 2 */}
      <Text style={[thStyle, { flex: 1 }]}>Title</Text>
      {/* Col 3 */}
      <Text style={[thStyle, { width: COL.status }]}>Status</Text>
      {/* Col 4 */}
      <Text style={[thStyle, { width: COL.date }]}>Date filed</Text>
      {/* Col 5 spacer */}
      <View style={{ width: COL.chev }} />
    </View>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({
  tab,
  hasSearch,
  theme,
}: {
  tab: string;
  hasSearch: boolean;
  theme: any;
}) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 48 }}>
      <Text style={{ fontSize: 32, marginBottom: 8 }}>
        {hasSearch ? "🔍" : "📋"}
      </Text>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 13,
          color: theme.textActive ?? theme.text,
          marginBottom: 4,
        }}
      >
        {hasSearch
          ? "No tickets match your search"
          : tab === "All"
            ? "No tickets yet"
            : `No ${tab} tickets`}
      </Text>
      <Text
        style={{
          fontFamily: "Outfit",
          fontSize: 12,
          color: theme.subtext,
          textAlign: "center",
        }}
      >
        {hasSearch
          ? "Try a different keyword"
          : "Tickets you submit will appear here"}
      </Text>
    </View>
  );
}

// ─── Status Timeline ──────────────────────────────────────────────────────────

function StatusTimeline({
  steps,
  currentStatus,
  theme,
}: {
  steps: string[];
  currentStatus: string;
  theme: any;
}) {
  const currentIdx = steps.indexOf(currentStatus);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: theme.background,
        borderRadius: 12,
        padding: 14,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: theme.border,
      }}
    >
      {steps.map((s, i) => {
        const c = STATUS_CONFIG[s] ?? STATUS_CONFIG["Pending"];
        const filled = i <= currentIdx;
        return (
          <React.Fragment key={s}>
            <View style={{ alignItems: "center", flex: 1 }}>
              <View
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  backgroundColor: filled
                    ? c.bg
                    : (theme.surfaceRaised ?? theme.background),
                  borderWidth: 2,
                  borderColor: filled ? c.border : theme.border,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 5,
                }}
              >
                {s === "Resolved" ? (
                  <CheckCircle
                    size={13}
                    color={filled ? c.text : theme.subtext}
                  />
                ) : s === "In Progress" ? (
                  <Clock size={13} color={filled ? c.text : theme.subtext} />
                ) : (
                  <Circle size={13} color={filled ? c.text : theme.subtext} />
                )}
              </View>
              <Text
                style={{
                  fontFamily: i === currentIdx ? "Outfit-medium" : "Outfit",
                  fontSize: 10,
                  color: i === currentIdx ? c.text : theme.subtext,
                  textAlign: "center",
                }}
              >
                {s}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View
                style={{
                  height: 2,
                  flex: 0.4,
                  backgroundColor:
                    i < currentIdx
                      ? STATUS_CONFIG["In Progress"].border
                      : theme.border,
                  marginBottom: 18,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Meta Card ────────────────────────────────────────────────────────────────

function MetaCard({
  fields,
  theme,
}: {
  fields: { label: string; value: string }[];
  theme: any;
}) {
  return (
    <View
      style={{
        backgroundColor: theme.background,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: theme.border,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      {fields.map((f, i) => (
        <View
          key={f.label}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 15,
            paddingVertical: 11,
            borderBottomWidth: i < fields.length - 1 ? 1 : 0,
            borderBottomColor: theme.border,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 12,
              color: theme.subtext,
              flex: 1,
            }}
          >
            {f.label}
          </Text>
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 12,
              color: theme.textActive ?? theme.text,
              flex: 2,
              textAlign: "right",
            }}
            numberOfLines={2}
          >
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

// ─── IT Detail ────────────────────────────────────────────────────────────────

function ITDetailContent({
  ticket,
  theme,
  primary,
}: {
  ticket: ConcernTicket;
  theme: any;
  primary: string;
}) {
  return (
    <>
      <StatusTimeline
        steps={["Pending", "In Progress", "Resolved"]}
        currentStatus={ticket.status}
        theme={theme}
      />
      <MetaCard
        fields={[
          { label: "Ticket ID", value: ticket.ticketNumber },
          { label: "Category", value: ticket.category ?? "—" },
          { label: "Priority", value: ticket.priority ?? "—" },
          { label: "Assignee", value: ticket.assigneeName || "Unassigned" },
          { label: "Date Created", value: toReadableDate(ticket.dateCreated) },
          { label: "Due Date", value: toReadableDate(ticket.dueDate) },
        ]}
        theme={theme}
      />
      {ticket.details ? (
        <View
          style={{
            backgroundColor: theme.background,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 15,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 11,
              color: theme.subtext,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            Description
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 13,
              color: theme.textActive ?? theme.text,
              lineHeight: 20,
            }}
          >
            {ticket.details}
          </Text>
        </View>
      ) : null}
    </>
  );
}

// ─── Supply Detail ────────────────────────────────────────────────────────────

function SupplyDetailContent({
  request,
  theme,
  primary,
}: {
  request: SupplyRequest;
  theme: any;
  primary: string;
}) {
  const displayStatus = normaliseSupplyStatus(request.status);
  const isRejected = request.status === "rejected";

  return (
    <>
      {isRejected ? (
        <View
          style={{
            backgroundColor: "#FEF2F2",
            borderWidth: 1,
            borderColor: "#FECACA",
            borderRadius: 12,
            padding: 14,
            marginBottom: 18,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 20 }}>❌</Text>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13,
                color: "#DC2626",
              }}
            >
              Request Rejected
            </Text>
            {request.rejectionReason ? (
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 12,
                  color: "#DC2626",
                  marginTop: 3,
                }}
              >
                {request.rejectionReason}
              </Text>
            ) : null}
          </View>
        </View>
      ) : (
        <StatusTimeline
          steps={["Pending", "In Progress", "Resolved"]}
          currentStatus={displayStatus}
          theme={theme}
        />
      )}

      <MetaCard
        fields={[
          { label: "Ticket ID", value: request.ticketNumber },
          { label: "Date Created", value: toReadableDate(request.createdAt) },
          {
            label: "Total items",
            value: `${request.items?.length ?? 0} item${(request.items?.length ?? 0) !== 1 ? "s" : ""}`,
          },
          {
            label: "Reviewed by",
            value: request.reviewedByName || "Pending review",
          },
          {
            label: "Resolved at",
            value: request.resolvedAt
              ? toReadableDate(request.resolvedAt)
              : "—",
          },
        ]}
        theme={theme}
      />

      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 13,
          color: theme.textActive ?? theme.text,
          marginBottom: 10,
        }}
      >
        Items ({request.items?.length ?? 0})
      </Text>
      <View
        style={{
          backgroundColor: theme.background,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: theme.border,
          overflow: "hidden",
          marginBottom: 16,
        }}
      >
        {(request.items ?? []).map((item, i) => (
          <View
            key={item.itemId + i}
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 15,
              paddingVertical: 11,
              borderBottomWidth: i < (request.items?.length ?? 0) - 1 ? 1 : 0,
              borderBottomColor: theme.border,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                backgroundColor: primary + "15",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 10,
              }}
            >
              <Package size={13} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13,
                  color: theme.textActive ?? theme.text,
                }}
                numberOfLines={1}
              >
                {item.itemName}
              </Text>
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 11,
                  color: theme.subtext,
                }}
              >
                {item.itemCode} · {item.category}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View
                style={{
                  backgroundColor: primary + "15",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 13,
                    color: primary,
                  }}
                >
                  ×{item.quantityRequested}
                </Text>
              </View>
            </View>
          </View>
        ))}
        
      </View>

      {request.notes ? (
        <View
          style={{
            backgroundColor: theme.background,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            padding: 15,
          }}
        >
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 11,
              color: theme.subtext,
              textTransform: "uppercase",
              letterSpacing: 0.6,
              marginBottom: 8,
            }}
          >
            Notes
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 13,
              color: theme.textActive ?? theme.text,
              lineHeight: 20,
            }}
          >
            {request.notes}
          </Text>
        </View>
      ) : null}
    </>
  );
}

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function DetailDrawer({
  ticket,
  onClose,
  theme,
  primary,
}: {
  ticket: UnifiedTicket | null;
  onClose: () => void;
  theme: any;
  primary: string;
}) {
  const { width: winW, height: winH } = useWindowDimensions();
  const isMobile = winW < 768;
  if (!ticket) return null;
  const DRAWER_W = isMobile ? winW - 24 : Math.min(winW * 0.9, 480);
  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <TouchableOpacity
        activeOpacity={1}
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.45)",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={{
            width: DRAWER_W,
            maxHeight: winH * 0.85,
            backgroundColor: theme.surface,
            borderRadius: isMobile ? 16 : 24,
            overflow: "hidden",
            alignSelf: "center",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.2,
            shadowRadius: 24,
            elevation: 20,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              paddingHorizontal: isMobile ? 16 : 20,
              paddingTop: 18,
              paddingBottom: 16,
              borderBottomWidth: 1,
              borderBottomColor: theme.border,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  marginBottom: 5,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 11,
                    color: theme.subtext,
                  }}
                >
                  #{ticket.ticketNumber}
                </Text>
                <SourceTag source={ticket._source} />
              </View>
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 17,
                  color: theme.textActive ?? theme.text,
                  lineHeight: 23,
                }}
              >
                {ticket.title}
              </Text>
              <View style={{ marginTop: 8 }}>
                <StatusBadge status={ticket.displayStatus ?? ticket.status} />
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: theme.background,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 4,
              }}
            >
              <X size={15} color={theme.subtext} />
            </TouchableOpacity>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: isMobile ? 16 : 20, paddingBottom: 40 }}
          >
            {ticket._source === "it" && ticket.itTicket ? (
              <ITDetailContent
                ticket={ticket.itTicket}
                theme={theme}
                primary={primary}
              />
            ) : ticket.supplyRequest ? (
              <SupplyDetailContent
                request={ticket.supplyRequest}
                theme={theme}
                primary={primary}
              />
            ) : null}
          </ScrollView>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

// ─── HR sub-components ────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
  theme,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  theme: any;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text
        style={{
          fontFamily: "Outfit-medium",
          fontSize: 13,
          color: theme.textActive ?? theme.text,
          marginBottom: 6,
        }}
      >
        {label}
        {required && <Text style={{ color: "#EF4444" }}> *</Text>}
      </Text>
      {children}
    </View>
  );
}

function SubOpt({
  label,
  selected,
  onPress,
  theme,
  primary,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  theme: any;
  primary: string;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 9,
        borderWidth: 1.5,
        borderColor: selected ? primary : theme.border,
        borderRadius: 8,
        backgroundColor: selected
          ? (theme.bgActive ?? "#EEF2FF")
          : "transparent",
        flex: 1,
      }}
    >
      <View
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          borderWidth: 2,
          borderColor: selected ? primary : theme.border,
          backgroundColor: selected ? primary : "transparent",
        }}
      />
      <Text
        style={{
          fontFamily: "Outfit",
          fontSize: 12,
          color: theme.textActive ?? theme.text,
          flexShrink: 1,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ─── Step bar (HR flow only) ──────────────────────────────────────────────────

function StepBar({
  step,
  theme,
  primary,
}: {
  step: Step;
  theme: any;
  primary: string;
}) {
  const steps = ["Choose type", "Fill details", "Review", "Done"];
  return (
    <View
      style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}
    >
      {steps.map((label, i) => {
        const num = i + 1;
        const isDone = num < step;
        const isActive = num === step;
        return (
          <React.Fragment key={num}>
            <View
              style={{ alignItems: "center", flexDirection: "row", gap: 5 }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: isDone
                    ? "#10B981"
                    : isActive
                      ? primary
                      : theme.border,
                  backgroundColor: isDone
                    ? "#10B981"
                    : isActive
                      ? primary
                      : theme.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 10,
                    color: isDone || isActive ? "#fff" : theme.subtext,
                  }}
                >
                  {isDone ? "✓" : String(num)}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 11,
                  color: isDone
                    ? "#10B981"
                    : isActive
                      ? primary
                      : theme.subtext,
                }}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
            {i < steps.length - 1 && (
              <View
                style={{
                  flex: 1,
                  height: 2,
                  backgroundColor: num < step ? "#10B981" : theme.border,
                  marginHorizontal: 6,
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Props = { user: ADUser };

export default function TicketHubPage({ user }: Props) {
  const { theme } = useTheme();
  const primary = theme.primary ?? "#4169E1";
  const { width } = useWindowDimensions();
  const isMobile = width < 768;

  // ── Ticket list state ──
  const [unified, setUnified] = useState<UnifiedTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("All");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<UnifiedTicket | null>(null);

  // ── Submit form state ──
  const [ticketType, setTicketType] = useState<TicketType | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [submittedId, setSubmittedId] = useState("");
  const [itModalVisible, setItModalVisible] = useState(false);
  const [supplyModalVisible, setSupplyModalVisible] = useState(false);

  // HR fields
  const [hrCategory, setHrCategory] = useState("Overtime Filing");
  const [hrDate, setHrDate] = useState("");
  const [hrDuration, setHrDuration] = useState("");
  const [hrStartTime, setHrStartTime] = useState("");
  const [hrEndTime, setHrEndTime] = useState("");
  const [hrReason, setHrReason] = useState("");
  const [hrNotes, setHrNotes] = useState("");
  const [priority, setPriority] = useState<PriorityValue>("Normal");
  const [formError, setFormError] = useState("");

  // ── Load tickets ──
  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      try {
        // const [itTickets, supplyRequests] = await Promise.all([
        //   getTicketsByRequester(user.username),
        //   getSupplyRequestsByUser(user.username, user.displayName ?? user.username),
        // ]);
        // setUnified(mergeTickets(itTickets, supplyRequests));

        const supplyRequests = await getSupplyRequestsByUser(
          user.username,
          user.displayName ?? user.username,
        );
        setUnified(mergeTickets([], supplyRequests));
      } catch (err) {
        console.error("Failed to load tickets:", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user.username],
  );

  useEffect(() => {
    load();
  }, [load]);

  // ── Counts & filtered list ──
  const counts = useMemo(() => {
    const c: Record<TabKey, number> = {
      All: unified.length,
      Pending: 0,
      "In Progress": 0,
      Resolved: 0,
      Rejected: 0,
    };
    unified.forEach((t) => {
      if (t.status in c) (c as any)[t.status]++;
    });
    return c;
  }, [unified]);

  const displayed = useMemo(() => {
    let result = unified;
    if (activeTab !== "All")
      result = result.filter((t) => t.status === activeTab);
    const q = search.trim().toLowerCase();
    if (q)
      result = result.filter(
        (t) =>
          t.title?.toLowerCase().includes(q) ||
          t.ticketNumber?.toLowerCase().includes(q) ||
          t.category?.toLowerCase().includes(q),
      );
    return result;
  }, [unified, activeTab, search]);

  // ── Submit form actions ──
  const resetForm = () => {
    setTicketType(null);
    setStep(1);
    setHrCategory("Overtime Filing");
    setHrDate("");
    setHrDuration("");
    setHrStartTime("");
    setHrEndTime("");
    setHrReason("");
    setHrNotes("");
    setPriority("Normal");
    setFormError("");
    setSubmittedId("");
  };

  const handleContinue = () => {
    if (!ticketType) return;
    // if (ticketType === "it") {
    //   setItModalVisible(true);
    // } else
    if (ticketType === "supply") {
      setSupplyModalVisible(true);
    } else {
      setStep(2);
    }
  };

  const inputStyle = {
    backgroundColor: theme.background,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: theme.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontFamily: "Outfit",
    fontSize: 13,
    color: theme.textActive ?? theme.text,
  };

  // ── Right panel: shows after submit success (step 4) or default ticket list ──
  const renderRightPanel = () => {
    // Step 2: HR form
    if (step === 2 && ticketType === "hr") {
      return (
        <View>
          <TouchableOpacity
            onPress={() => setStep(1)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
            }}
          >
            <ChevronLeft size={15} color={theme.subtext} />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13,
                color: theme.subtext,
              }}
            >
              Back
            </Text>
          </TouchableOpacity>

          <View
            style={{
              backgroundColor: theme.surface ?? theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 16,
                color: theme.textActive ?? theme.text,
                marginBottom: 4,
              }}
            >
              📋 HR concern
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 13,
                color: theme.subtext,
                marginBottom: 14,
              }}
            >
              Submit an HR-related request for review.
            </Text>

            <View
              style={{
                flexDirection: "row",
                gap: 8,
                backgroundColor: "#FFFBEB",
                borderWidth: 1.5,
                borderColor: "#FDE68A",
                borderRadius: 8,
                padding: 10,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 13, color: "#92400E", flex: 1 }}>
                ⚠️ This feature is in{" "}
                <Text style={{ fontFamily: "Outfit-medium" }}>draft</Text>.
                Options may change.
              </Text>
            </View>

            <Field label="HR category" required theme={theme}>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                {HR_CATEGORIES.map((cat) => (
                  <SubOpt
                    key={cat}
                    label={cat}
                    selected={hrCategory === cat}
                    onPress={() => setHrCategory(cat)}
                    theme={theme}
                    primary={primary}
                  />
                ))}
              </View>
            </Field>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Date" required theme={theme}>
                  <TextInput
                    style={inputStyle}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.subtext}
                    value={hrDate}
                    onChangeText={setHrDate}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Duration (hrs)" required theme={theme}>
                  <TextInput
                    style={inputStyle}
                    placeholder="e.g. 2.5"
                    placeholderTextColor={theme.subtext}
                    keyboardType="decimal-pad"
                    value={hrDuration}
                    onChangeText={setHrDuration}
                  />
                </Field>
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Field label="Start time" required theme={theme}>
                  <TextInput
                    style={inputStyle}
                    placeholder="e.g. 18:00"
                    placeholderTextColor={theme.subtext}
                    value={hrStartTime}
                    onChangeText={setHrStartTime}
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="End time" required theme={theme}>
                  <TextInput
                    style={inputStyle}
                    placeholder="e.g. 21:00"
                    placeholderTextColor={theme.subtext}
                    value={hrEndTime}
                    onChangeText={setHrEndTime}
                  />
                </Field>
              </View>
            </View>

            <Field label="Reason" required theme={theme}>
              <View
                style={{
                  backgroundColor: theme.background,
                  borderRadius: 8,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                  overflow: "hidden",
                }}
              >
                {[
                  "Heavy workload / deadline",
                  "Special project or task",
                  "Client deliverable",
                  "System maintenance",
                  "Other",
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setHrReason(opt)}
                    activeOpacity={0.7}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 10,
                      backgroundColor:
                        hrReason === opt
                          ? (theme.bgActive ?? "#EEF2FF")
                          : "transparent",
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily:
                          hrReason === opt ? "Outfit-medium" : "Outfit",
                        fontSize: 13,
                        color:
                          hrReason === opt
                            ? primary
                            : (theme.textActive ?? theme.text),
                      }}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            <Field label="Notes" theme={theme}>
              <TextInput
                style={[inputStyle, { height: 60, textAlignVertical: "top" }]}
                placeholder="Any additional context for HR…"
                placeholderTextColor={theme.subtext}
                multiline
                value={hrNotes}
                onChangeText={setHrNotes}
              />
            </Field>

            {formError ? (
              <Text
                style={{
                  fontFamily: "Outfit",
                  color: "#EF4444",
                  fontSize: 13,
                  marginBottom: 8,
                }}
              >
                {formError}
              </Text>
            ) : null}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setStep(1)}
                activeOpacity={0.8}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 13,
                    color: theme.subtext,
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setFormError("");
                  if (!hrDate.trim()) {
                    setFormError("Enter the overtime date.");
                    return;
                  }
                  if (!hrReason) {
                    setFormError("Select a reason.");
                    return;
                  }
                  setStep(3);
                }}
                activeOpacity={0.8}
                style={{
                  backgroundColor: primary,
                  borderRadius: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 13,
                    color: "#fff",
                  }}
                >
                  Review →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // Step 3: HR review
    if (step === 3) {
      return (
        <View>
          <TouchableOpacity
            onPress={() => setStep(2)}
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              marginBottom: 16,
            }}
          >
            <ChevronLeft size={15} color={theme.subtext} />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 13,
                color: theme.subtext,
              }}
            >
              Back
            </Text>
          </TouchableOpacity>

          <View
            style={{
              backgroundColor: theme.surface ?? theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 12,
              padding: 20,
            }}
          >
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 16,
                color: theme.textActive ?? theme.text,
                marginBottom: 4,
              }}
            >
              Review your ticket
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 13,
                color: theme.subtext,
                marginBottom: 18,
              }}
            >
              Double-check before submitting.
            </Text>

            {[
              { label: "Request type", value: "HR Concern" },
              { label: "Category", value: hrCategory },
              { label: "Date", value: hrDate },
              { label: "Duration", value: hrDuration ? `${hrDuration}h` : "—" },
              {
                label: "Time",
                value:
                  hrStartTime && hrEndTime
                    ? `${hrStartTime} – ${hrEndTime}`
                    : "—",
              },
              { label: "Reason", value: hrReason || "—" },
              { label: "Submitted by", value: user.displayName },
            ].map((row, i, arr) => (
              <View
                key={row.label}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  paddingVertical: 8,
                  borderBottomWidth: i < arr.length - 1 ? 1 : 0,
                  borderBottomColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit",
                    fontSize: 13,
                    color: theme.subtext,
                  }}
                >
                  {row.label}
                </Text>
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 13,
                    color: theme.textActive ?? theme.text,
                    flexShrink: 1,
                    textAlign: "right",
                    maxWidth: "60%",
                  }}
                >
                  {row.value}
                </Text>
              </View>
            ))}

            <View style={{ marginTop: 16 }}>
              <Field label="Priority" theme={theme}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {PRIORITY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      onPress={() => setPriority(opt)}
                      activeOpacity={0.7}
                      style={{
                        flex: 1,
                        borderRadius: 8,
                        paddingVertical: 9,
                        alignItems: "center",
                        backgroundColor:
                          priority === opt ? primary : theme.background,
                        borderWidth: 1.5,
                        borderColor: priority === opt ? primary : theme.border,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "Outfit-medium",
                          fontSize: 12,
                          color: priority === opt ? "#fff" : theme.subtext,
                        }}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </Field>
            </View>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <TouchableOpacity
                onPress={() => setStep(2)}
                activeOpacity={0.8}
                style={{
                  backgroundColor: theme.surface,
                  borderRadius: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderWidth: 1.5,
                  borderColor: theme.border,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 13,
                    color: theme.subtext,
                  }}
                >
                  Back
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  // TODO: wire Firestore submit, then setStep(4)
                }}
                activeOpacity={0.8}
                style={{
                  backgroundColor: primary,
                  borderRadius: 8,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                }}
              >
                <Text
                  style={{
                    fontFamily: "Outfit-medium",
                    fontSize: 13,
                    color: "#fff",
                  }}
                >
                  Submit ticket ✓
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      );
    }

    // Step 4: Success screen (replaces ticket list temporarily)
    if (step === 4) {
      return (
        <View
          style={{
            backgroundColor: theme.surface ?? theme.background,
            borderWidth: 1,
            borderColor: "#A7F3D0",
            borderRadius: 12,
            padding: 36,
            alignItems: "center",
          }}
        >
          <Text style={{ fontSize: 44, marginBottom: 12 }}>🎉</Text>
          <Text
            style={{
              fontFamily: "Outfit-medium",
              fontSize: 18,
              color: theme.textActive ?? theme.text,
              marginBottom: 6,
            }}
          >
            Ticket submitted!
          </Text>
          <Text
            style={{
              fontFamily: "Outfit",
              fontSize: 13,
              color: theme.subtext,
              marginBottom: 16,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Your request has been received and will be reviewed shortly.{"\n"}
            You'll be notified once it's assigned.
          </Text>

          {submittedId ? (
            <View
              style={{
                backgroundColor: theme.bgActive ?? "#EEF2FF",
                borderRadius: 8,
                borderWidth: 1.5,
                borderColor: "#C7D2FE",
                paddingHorizontal: 20,
                paddingVertical: 8,
                marginBottom: 22,
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 18,
                  color: primary,
                  letterSpacing: 1,
                }}
              >
                {submittedId}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={resetForm}
              activeOpacity={0.8}
              style={{
                backgroundColor: theme.surface,
                borderRadius: 8,
                paddingHorizontal: 18,
                paddingVertical: 10,
                borderWidth: 1.5,
                borderColor: theme.border,
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13,
                  color: theme.subtext,
                }}
              >
                Submit another
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                load(true);
              }}
              activeOpacity={0.8}
              style={{
                backgroundColor: primary,
                borderRadius: 8,
                paddingHorizontal: 18,
                paddingVertical: 10,
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit-medium",
                  fontSize: 13,
                  color: "#fff",
                }}
              >
                View my tickets
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // Default: ticket list (step 1, no HR multi-step active)
    return (
      <View style={{ flex: 1 }}>
        {/* ── Search bar + Filter button ── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
          }}
        >
          <View
            style={{
              flex: 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: theme.surface ?? theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 8,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === "ios" ? 9 : 7,
            }}
          >
            <Search size={14} color={theme.subtext} />
            <TextInput
              placeholder="Search by title, ticket no., or category…"
              placeholderTextColor={theme.subtext}
              value={search}
              onChangeText={setSearch}
              style={{
                flex: 1,
                fontFamily: "Outfit",
                fontSize: 12,
                color: theme.textActive ?? theme.text,
                padding: 0,
              }}
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <X size={12} color={theme.subtext} />
              </TouchableOpacity>
            )}
          </View>
          {/* Filter button */}
          <TouchableOpacity
            activeOpacity={0.7}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 5,
              paddingHorizontal: 12,
              paddingVertical: Platform.OS === "ios" ? 9 : 7,
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: 8,
              backgroundColor: theme.surface ?? theme.background,
            }}
          >
            <ChevronRight
              size={13}
              color={theme.subtext}
              style={{ transform: [{ rotate: "90deg" }] }}
            />
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 12,
                color: theme.subtext ?? theme.text,
              }}
            >
              Filter
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Tabs — underline style matching HTML reference ── */}
        <View
          style={{
            borderBottomWidth: 1,
            borderBottomColor: theme.border,
            marginBottom: 12,
          }}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 0 }}
          >
            {TABS.map((tab) => {
              if (
                tab === "Rejected" &&
                counts.Rejected === 0 &&
                activeTab !== "Rejected"
              )
                return null;
              const active = activeTab === tab;
              return (
                <TouchableOpacity
                  key={tab}
                  onPress={() => setActiveTab(tab)}
                  activeOpacity={0.7}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderBottomWidth: 2,
                    borderBottomColor: active ? primary : "transparent",
                    marginBottom: -1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "Outfit-medium",
                      fontSize: 12,
                      color: active ? primary : theme.subtext,
                    }}
                  >
                    {tab}
                  </Text>
                  {/* Count badge */}
                  <View
                    style={{
                      backgroundColor: active
                        ? primary + "20"
                        : (theme.surfaceRaised ?? theme.background),
                      borderWidth: 1,
                      borderColor: active ? primary + "50" : theme.border,
                      borderRadius: 100,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      minWidth: 20,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "Outfit-medium",
                        fontSize: 10,
                        color: active ? primary : theme.subtext,
                      }}
                    >
                      {counts[tab]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── Ticket table ── */}
        <View
          style={{
            backgroundColor: theme.surface ?? theme.background,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
            overflow: "hidden",
          }}
        >
          {/* Table header — desktop only */}
          {!isMobile && <TableHeader theme={theme} />}

          {/* Ticket rows / cards */}
          {loading ? (
            <View
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: 48,
              }}
            >
              <ActivityIndicator size="large" color={primary} />
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 12,
                  color: theme.subtext,
                  marginTop: 10,
                }}
              >
                Loading your tickets…
              </Text>
            </View>
          ) : displayed.length === 0 ? (
            <EmptyState
              tab={activeTab}
              hasSearch={search.trim().length > 0}
              theme={theme}
            />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>
              {displayed.map((t) =>
                isMobile ? (
                  <TicketCard
                    key={`${t._source}-${t.id}`}
                    ticket={t}
                    onPress={() => setSelected(t)}
                    theme={theme}
                    primary={primary}
                  />
                ) : (
                  <TicketRow
                    key={`${t._source}-${t.id}`}
                    ticket={t}
                    onPress={() => setSelected(t)}
                    theme={theme}
                    primary={primary}
                  />
                ),
              )}
            </ScrollView>
          )}

          {/* Table footer */}
          {!loading && displayed.length > 0 && (
            <View
              style={{
                paddingHorizontal: 16,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderTopColor: theme.border,
                backgroundColor:
                  theme.surfaceRaised ?? theme.surface ?? theme.background,
                alignItems: "flex-end",
              }}
            >
              <Text
                style={{
                  fontFamily: "Outfit",
                  fontSize: 11,
                  color: theme.subtext,
                }}
              >
                Showing {displayed.length} of {unified.length} ticket
                {unified.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ flexGrow: 1 }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load(true);
          }}
          tintColor={primary}
        />
      }
    >
      <View style={{ padding: 20 }}>
        {/* Page header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 20,
          }}
        >
          <View>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 10,
                letterSpacing: 0.7,
                textTransform: "uppercase",
                color: theme.subtext,
                marginBottom: 2,
              }}
            >
              Employee portal
            </Text>
            <Text
              style={{
                fontFamily: "Outfit-medium",
                fontSize: 20,
                color: theme.textActive ?? theme.text,
                marginBottom: 2,
              }}
            >
              My Tickets
            </Text>
            <Text
              style={{
                fontFamily: "Outfit",
                fontSize: 12,
                color: theme.subtext,
              }}
            >
              Active and pending requests
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setRefreshing(true);
              load(true);
            }}
            activeOpacity={0.7}
            style={{
              width: 34,
              height: 34,
              borderRadius: 9,
              backgroundColor: theme.surface ?? theme.background,
              borderWidth: 1,
              borderColor: theme.border,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RefreshCw size={14} color={theme.subtext} />
          </TouchableOpacity>
        </View>

        {/* Step bar for HR multi-step */}
        {(step === 2 || step === 3 || step === 4) && (
          <StepBar step={step} theme={theme} primary={primary} />
        )}

        {/* Two-column layout — stacks on mobile */}
        <View
          style={{
            flexDirection: isMobile ? "column" : "row",
            gap: 18,
            alignItems: isMobile ? "stretch" : "flex-start",
          }}
        >
          {/* Left: new request panel + stats */}
          <LeftPanel
            ticketType={ticketType}
            setTicketType={(t) => {
              setTicketType(t);
              if (step !== 1) setStep(1);
            }}
            onContinue={handleContinue}
            counts={counts}
            theme={theme}
            primary={primary}
            isMobile={isMobile}
          />

          {/* Right: ticket list or HR form */}
          <View style={{ flex: 1, minHeight: 400 }}>{renderRightPanel()}</View>
        </View>
      </View>

      {/* Modals */}
      {/* <ITConcernModal
  visible={itModalVisible}
  onClose={() => { setItModalVisible(false); setTicketType(null); }}
  user={user}
  onSuccess={(ticketNum) => {
    setSubmittedId(ticketNum);
    setStep(4);
    setItModalVisible(false);
    load(true);
  }}
/> */}
      <SupplyRequestModal
        visible={supplyModalVisible}
        onClose={() => {
          setSupplyModalVisible(false);
          setTicketType(null);
        }}
        user={user}
        onSuccess={(ticketNum) => {
          setSubmittedId(ticketNum);
          setStep(4);
          setSupplyModalVisible(false);
          load(true);
        }}
      />

      {/* Detail drawer */}
      <DetailDrawer
        ticket={selected}
        onClose={() => setSelected(null)}
        theme={theme}
        primary={primary}
      />
    </ScrollView>
  );
}
