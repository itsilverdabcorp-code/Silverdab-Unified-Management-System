// components/Calendar.tsx
//
// Generic, data-agnostic calendar. Renders month / week / 4-day / day views
// over a neutral CalendarEvent shape — it knows nothing about the domain data
// behind each event, so any module can reuse it by mapping its own records
// into CalendarEvent<T> and reading `event.data` back in onEventClick.
//
// Intentional MVP limits (time-grid views):
//  • An event is drawn on its START day only; one crossing midnight is
//    clamped to the bottom of that day, not continued onto the next.
//  • Overlapping events stack (no side-by-side column packing).
//  • "All day" is a layout placeholder — every event here is expected to
//    have a time.

import React, { useMemo, useState } from "react";
import { useTheme } from "../../theme/ThemeContext";

// ─── Public types ──────────────────────────────────────────────────────────

export type CalendarEventColor = { bg: string; text: string; dot: string };

export type CalendarEvent<T = unknown> = {
  id: string;
  start: string; // "YYYY-MM-DD HH:MM:SS" (mysql2 dateStrings) or ISO
  end?: string | null; // optional — one-way / point events omit it
  title: string;
  subtitle?: string; // second line in time-grid blocks (e.g. "→ dropoff")
  color: CalendarEventColor;
  data: T; // original record, handed back on click
};

export type CalendarView = "day" | "4days" | "week" | "month";

// ─── Date helpers (self-contained; same mysql2 dateStrings parsing) ─────────

const HOUR_HEIGHT = 48; // px per hour row in the time grid
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const CALENDAR_VIEWS: { key: CalendarView; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "4days", label: "4 days" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const CALENDAR_VIEW_LABEL: Record<CalendarView, string> = {
  day: "Day",
  "4days": "4 days",
  week: "Week",
  month: "Month",
};

// "YYYY-MM-DD HH:MM:SS" (space, no tz) -> local wall-clock ms. Swapping the
// space for "T" makes Date parse it as local per spec instead of guessing.
function parseLocalMs(s?: string | null): number {
  if (!s) return NaN;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return d.getTime();
}

// "YYYY-MM-DD" in local time from a Date.
function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// "YYYY-MM-DD" in local time from an event datetime string; null if invalid.
function eventDateKey(s?: string | null): string | null {
  const ms = parseLocalMs(s);
  return isNaN(ms) ? null : dateKeyLocal(new Date(ms));
}

function minutesFromMidnight(s?: string | null): number {
  const ms = parseLocalMs(s);
  if (isNaN(ms)) return NaN;
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// Day columns for a time-grid view, anchored on `anchor`. Month returns [].
function getViewDays(anchor: Date, view: CalendarView): Date[] {
  const base = new Date(
    anchor.getFullYear(),
    anchor.getMonth(),
    anchor.getDate(),
  );
  if (view === "day") return [base];
  if (view === "4days")
    return Array.from({ length: 4 }, (_, i) => addDays(base, i));
  if (view === "week") {
    const weekStart = addDays(base, -base.getDay()); // back to Sunday
    return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  }
  return [];
}

// Page the anchor by the view's own span: day ±1, 4 days ±4, week ±7, month ±1mo.
function stepAnchor(anchor: Date, view: CalendarView, dir: 1 | -1): Date {
  if (view === "month")
    return new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1);
  const span = view === "day" ? 1 : view === "4days" ? 4 : 7;
  return addDays(anchor, dir * span);
}

function getViewTitle(anchor: Date, view: CalendarView): string {
  if (view === "month")
    return anchor.toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  const days = getViewDays(anchor, view);
  if (view === "day")
    return days[0].toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(days[0])} – ${fmt(days[days.length - 1])}`;
}

function formatHour(h: number): string {
  if (h === 0) return "12am";
  if (h === 12) return "12pm";
  return h < 12 ? `${h}am` : `${h - 12}pm`;
}

// 6×7 date grid for a month, padded with adjacent-month days.
function buildMonthGrid(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const startOffset = new Date(year, month, 1).getDay(); // 0 = Sun
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

// ─── Time-grid view (day / 4 days / week) ──────────────────────────────────

function TimeGridView({
  days,
  events,
  theme,
  onEventClick,
}: {
  days: Date[];
  events: CalendarEvent[];
  theme: any;
  onEventClick: (e: CalendarEvent) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const todayKey = dateKeyLocal(new Date());

  // Open around business hours instead of midnight.
  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  // Live "now" line — recompute each minute.
  const [nowMin, setNowMin] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  React.useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMin(n.getHours() * 60 + n.getMinutes());
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const dayKeys = days.map((d) => dateKeyLocal(d));

  const eventsByDay: Record<string, CalendarEvent[]> = {};
  dayKeys.forEach((k) => (eventsByDay[k] = []));
  events.forEach((e) => {
    const k = eventDateKey(e.start);
    if (k && eventsByDay[k]) eventsByDay[k].push(e);
  });

  return (
    <div
      className="flex-1 min-h-0 min-w-0 flex flex-col border rounded-lg overflow-hidden"
      style={{ borderColor: theme.border }}
    >
      {/* Day header */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div className="flex-shrink-0" style={{ width: 56 }} />
        {days.map((d, i) => {
          const isToday = dayKeys[i] === todayKey;
          return (
            <div
              key={i}
              className="flex-1 px-3 py-2"
              style={{ borderLeft: `1px solid ${theme.border}` }}
            >
              <p
                className="text-[12.5px] font-bold leading-tight"
                style={{ color: isToday ? theme.primary : theme.text }}
              >
                {d.toLocaleDateString("en-US", { weekday: "long" })}
              </p>
              <p
                className="text-[10.5px]"
                style={{ color: isToday ? theme.primary : theme.subtext }}
              >
                {d.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div
        className="flex flex-shrink-0"
        style={{ borderBottom: `1px solid ${theme.border}` }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-end pr-2"
          style={{ width: 56 }}
        >
          <span className="text-[10px]" style={{ color: theme.subtext }}>
            All day
          </span>
        </div>
        {days.map((_, i) => (
          <div
            key={i}
            className="flex-1"
            style={{ borderLeft: `1px solid ${theme.border}`, minHeight: 30 }}
          />
        ))}
      </div>

      {/* Scrollable time body */}
      <div ref={scrollRef} className="cal-scroll flex-1 min-h-0 overflow-y-auto">
        <div className="flex" style={{ height: 24 * HOUR_HEIGHT }}>
          {/* Hour labels */}
          <div className="flex-shrink-0 relative" style={{ width: 56 }}>
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                className="absolute right-2 text-[10.5px]"
                style={{
                  top: h === 0 ? 2 : h * HOUR_HEIGHT - 6,
                  color: theme.subtext,
                }}
              >
                {formatHour(h)}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((_, i) => {
            const k = dayKeys[i];
            const isToday = k === todayKey;
            const dayEvents = eventsByDay[k] || [];
            return (
              <div
                key={i}
                className="flex-1 relative"
                style={{ borderLeft: `1px solid ${theme.border}` }}
              >
                {/* Hour gridlines */}
                {Array.from({ length: 24 }, (_, h) => (
                  <div
                    key={h}
                    className="absolute left-0 right-0"
                    style={{
                      top: h * HOUR_HEIGHT,
                      borderTop: `1px solid ${theme.border}`,
                      opacity: 0.5,
                    }}
                  />
                ))}

                {/* Events */}
                {dayEvents.map((e) => {
                  const startMin = minutesFromMidnight(e.start);
                  if (isNaN(startMin)) return null;
                  const endMin = minutesFromMidnight(e.end);
                  const dur =
                    !isNaN(endMin) && endMin > startMin
                      ? endMin - startMin
                      : 45;
                  const top = (startMin / 60) * HOUR_HEIGHT;
                  const height = Math.max((dur / 60) * HOUR_HEIGHT, 22);
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEventClick(e)}
                      className="absolute left-1 right-1 rounded px-1.5 py-0.5 text-left overflow-hidden z-10"
                      style={{
                        top,
                        height,
                        backgroundColor: e.color.bg,
                        color: e.color.text,
                        borderLeft: `3px solid ${e.color.dot}`,
                      }}
                      title={
                        e.subtitle ? `${e.title} ${e.subtitle}` : e.title
                      }
                    >
                      <span className="block text-[10px] font-semibold truncate">
                        {e.title}
                      </span>
                      {height > 30 && e.subtitle && (
                        <span
                          className="block text-[9px] truncate"
                          style={{ opacity: 0.85 }}
                        >
                          {e.subtitle}
                        </span>
                      )}
                    </button>
                  );
                })}

                {/* Now line */}
                {isToday && (
                  <div
                    className="absolute left-0 right-0 z-20 pointer-events-none"
                    style={{ top: (nowMin / 60) * HOUR_HEIGHT }}
                  >
                    <div style={{ height: 2, backgroundColor: "#ef4444" }} />
                    <div
                      style={{
                        position: "absolute",
                        left: -3,
                        top: -3,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#ef4444",
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Month view ────────────────────────────────────────────────────────────

function MonthGridView({
  anchor,
  events,
  theme,
  onEventClick,
  onDateClick,
}: {
  anchor: Date;
  events: CalendarEvent[];
  theme: any;
  onEventClick: (e: CalendarEvent) => void;
  onDateClick?: (date: Date, events: CalendarEvent[]) => void;
}) {
  const todayKey = dateKeyLocal(new Date());
  const cells = buildMonthGrid(
    new Date(anchor.getFullYear(), anchor.getMonth(), 1),
  );

  return (
    <div className="cal-scroll flex-1 min-w-0 overflow-auto flex flex-col">
      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1.5 mb-1.5 flex-shrink-0">
        {WEEKDAY_LABELS.map((wd) => (
          <div
            key={wd}
            style={{ color: theme.subtext }}
            className="text-[10px] font-semibold uppercase text-center tracking-wide"
          >
            {wd}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1.5 flex-1 min-h-0">
        {cells.map((day, i) => {
          const inMonth = day.getMonth() === anchor.getMonth();
          const key = dateKeyLocal(day);
          const dayEvents = events.filter((e) => eventDateKey(e.start) === key);
          const isToday = key === todayKey;
          const clickable = !!onDateClick && dayEvents.length > 0;
          return (
            <div
              key={i}
              onClick={() => clickable && onDateClick!(day, dayEvents)}
              style={{
                backgroundColor: theme.surface,
                borderColor: isToday ? theme.primary : theme.border,
                opacity: inMonth ? 1 : 0.4,
                cursor: clickable ? "pointer" : "default",
              }}
              className="rounded-lg border p-1.5 flex flex-col gap-1 overflow-hidden"
            >
              <span
                style={{ color: isToday ? theme.primary : theme.text }}
                className="text-[11px] font-semibold flex-shrink-0"
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5 overflow-y-auto cal-scroll">
                {dayEvents.slice(0, 3).map((e) => (
                  <button
                    key={e.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onEventClick(e);
                    }}
                    style={{ backgroundColor: e.color.bg, color: e.color.text }}
                    className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded truncate text-left"
                    title={e.subtitle ? `${e.title} ${e.subtitle}` : e.title}
                  >
                    {e.title}
                  </button>
                ))}
                {dayEvents.length > 3 && (
                  <span
                    style={{ color: theme.subtext }}
                    className="text-[9.5px] px-1.5"
                  >
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Calendar (public) ─────────────────────────────────────────────────────

type CalendarProps<T> = {
  events: CalendarEvent<T>[];
  onEventClick?: (event: CalendarEvent<T>) => void;
  onDateClick?: (date: Date, events: CalendarEvent<T>[]) => void;
  initialView?: CalendarView;
  initialDate?: Date;
  className?: string;
};

export default function Calendar<T>({
  events,
  onEventClick,
  onDateClick,
  initialView = "month",
  initialDate,
  className,
}: CalendarProps<T>) {
  const { theme } = useTheme();

  const [view, setView] = useState<CalendarView>(initialView);
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchor, setAnchor] = useState(() => initialDate ?? new Date());

  const viewDays = useMemo(() => getViewDays(anchor, view), [anchor, view]);

  // Bridge back to the caller's typed handler (inner grids are type-erased).
  const handleClick = (e: CalendarEvent) =>
    onEventClick?.(e as CalendarEvent<T>);
  const handleDateClick = (date: Date, dayEvents: CalendarEvent[]) =>
    onDateClick?.(date, dayEvents as CalendarEvent<T>[]);

  return (
    <div className={`h-full w-full min-w-0 flex flex-col ${className ?? ""}`}>
      {/* Scoped scrollbar styling so the calendar looks right in any module */}
      <style>{`
        .cal-scroll::-webkit-scrollbar { width: 6px; }
        .cal-scroll::-webkit-scrollbar-track { background: transparent; }
        .cal-scroll::-webkit-scrollbar-thumb { background: ${theme.border}; border-radius: 99px; }
        .cal-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.subtext}; }
      `}</style>

      {/* Header toolbar: Today · view menu · nav · title */}
      <div className="flex items-center gap-2 mb-3 flex-shrink-0">
        <button
          onClick={() => setAnchor(new Date())}
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          }}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border"
        >
          Today
        </button>

        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            style={{
              backgroundColor: theme.surface,
              borderColor: theme.border,
              color: theme.text,
            }}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border flex items-center gap-1.5"
          >
            {CALENDAR_VIEW_LABEL[view]}
            <svg
              width="11"
              height="11"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: menuOpen ? "rotate(180deg)" : "none",
                transition: "transform 120ms",
              }}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div
                style={{
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                }}
                className="absolute left-0 top-full mt-1 z-50 w-44 rounded-lg border shadow-lg py-1.5"
              >
                <p
                  style={{ color: theme.subtext }}
                  className="text-[10px] font-semibold uppercase tracking-wide px-3 pb-1"
                >
                  Time period
                </p>
                {CALENDAR_VIEWS.map((v) => {
                  const active = view === v.key;
                  return (
                    <button
                      key={v.key}
                      onClick={() => {
                        setView(v.key);
                        setMenuOpen(false);
                      }}
                      style={{
                        backgroundColor: active
                          ? theme.background
                          : "transparent",
                        color: theme.text,
                      }}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-[12.5px] font-medium"
                    >
                      {v.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <button
          onClick={() => setAnchor((a) => stepAnchor(a, view, -1))}
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          }}
          className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border"
          aria-label="Previous"
        >
          ‹
        </button>
        <button
          onClick={() => setAnchor((a) => stepAnchor(a, view, 1))}
          style={{
            backgroundColor: theme.surface,
            borderColor: theme.border,
            color: theme.text,
          }}
          className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border"
          aria-label="Next"
        >
          ›
        </button>

        <p style={{ color: theme.text }} className="text-sm font-bold ml-1">
          {getViewTitle(anchor, view)}
        </p>
      </div>

      {view === "month" ? (
        <MonthGridView
          anchor={anchor}
          events={events}
          theme={theme}
          onEventClick={handleClick}
          onDateClick={handleDateClick}
        />
      ) : (
        <TimeGridView
          days={viewDays}
          events={events}
          theme={theme}
          onEventClick={handleClick}
        />
      )}
    </div>
  );
}