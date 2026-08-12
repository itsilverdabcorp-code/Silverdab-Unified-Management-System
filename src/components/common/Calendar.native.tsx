// components/common/Calendar.native.tsx
//
// Native counterpart to components/common/Calendar.tsx. Metro resolves
// `.native.tsx` automatically for any bare `import Calendar from
// ".../common/Calendar"` on native builds — no index.tsx switch needed,
// unlike the FleetControlTower/FleetAllTrips page-level splits.
//
// SCOPE: month view only. Both current callers (FleetControlTowerPage and
// FleetAllTripsPage) only ever render this in month view — neither passes
// initialView="day"/"week"/"4days", and FleetAllTripsPage doesn't pass
// initialView at all (defaults to "month"). So the day/4-day/week
// time-grid views from the web version aren't ported here. If a page
// later needs those, extend this file the same way TimeGridView does on
// web — the date-math helpers below already work for arbitrary day spans.
//
// The public props/types match Calendar.tsx exactly (CalendarEvent<T>,
// onEventClick, onDateClick) so callers don't need platform-specific code.

import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useTheme } from "../../theme/ThemeContext";

// ─── Public types (mirrors Calendar.tsx) ────────────────────────────────────

export type CalendarEventColor = { bg: string; text: string; dot: string };

export type CalendarEvent<T = unknown> = {
  id: string;
  start: string;
  end?: string | null;
  title: string;
  subtitle?: string;
  color: CalendarEventColor;
  data: T;
};

export type CalendarView = "day" | "4days" | "week" | "month";

// ─── Date helpers (same mysql2 dateStrings parsing as Calendar.tsx) ────────

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parseLocalMs(s?: string | null): number {
  if (!s) return NaN;
  const d = new Date(s.includes("T") ? s : s.replace(" ", "T"));
  return d.getTime();
}

function dateKeyLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function eventDateKey(s?: string | null): string | null {
  const ms = parseLocalMs(s);
  return isNaN(ms) ? null : dateKeyLocal(new Date(ms));
}

function buildMonthGrid(monthStart: Date): Date[] {
  const year = monthStart.getFullYear();
  const month = monthStart.getMonth();
  const startOffset = new Date(year, month, 1).getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ─── Public component ───────────────────────────────────────────────────────

type CalendarProps<T> = {
  events: CalendarEvent<T>[];
  onEventClick?: (event: CalendarEvent<T>) => void;
  onDateClick?: (date: Date, events: CalendarEvent<T>[]) => void;
  initialView?: CalendarView; // accepted for API parity; only "month" renders — see file header
  initialDate?: Date;
  className?: string; // accepted for API parity; unused on native
};

export default function Calendar<T>({
  events,
  onEventClick,
  onDateClick,
  initialDate,
}: CalendarProps<T>) {
  const { theme } = useTheme();
  const [anchor, setAnchor] = useState(() => initialDate ?? new Date());

  const todayKey = dateKeyLocal(new Date());
  const monthTitle = anchor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const weeks = useMemo(() => {
    const cells = buildMonthGrid(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
    return chunk(cells, 7);
  }, [anchor]);

  const eventsByDay = useMemo(() => {
    const map: Record<string, CalendarEvent<T>[]> = {};
    events.forEach((e) => {
      const k = eventDateKey(e.start);
      if (!k) return;
      (map[k] ??= []).push(e);
    });
    return map;
  }, [events]);

  return (
    <View style={{ flex: 1 }}>
      {/* Toolbar: Today · prev/next · title */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <TouchableOpacity
          onPress={() => setAnchor(new Date())}
          style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1))}
          style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1))}
          style={{ backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 }}
        >
          <Text style={{ color: theme.text, fontSize: 12, fontWeight: "700" }}>›</Text>
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 14, fontWeight: "700", marginLeft: 2 }}>{monthTitle}</Text>
      </View>

      {/* Weekday header */}
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {WEEKDAY_LABELS.map((wd) => (
          <View key={wd} style={{ flex: 1, alignItems: "center" }}>
            <Text style={{ color: theme.subtext, fontSize: 9.5, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 }}>{wd}</Text>
          </View>
        ))}
      </View>

      {/* Month grid */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ gap: 4 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flexDirection: "row", gap: 4 }}>
            {week.map((day, di) => {
              const inMonth = day.getMonth() === anchor.getMonth();
              const key = dateKeyLocal(day);
              const dayEvents = eventsByDay[key] ?? [];
              const isToday = key === todayKey;
              const clickable = !!onDateClick && dayEvents.length > 0;
              return (
                <TouchableOpacity
                  key={di}
                  disabled={!clickable}
                  onPress={() => clickable && onDateClick!(day, dayEvents)}
                  activeOpacity={clickable ? 0.6 : 1}
                  style={{
                    flex: 1,
                    minHeight: 74,
                    backgroundColor: theme.surface,
                    borderColor: isToday ? theme.primary : theme.border,
                    borderWidth: isToday ? 1.5 : 1,
                    borderRadius: 8,
                    padding: 4,
                    opacity: inMonth ? 1 : 0.4,
                  }}
                >
                  <Text style={{ color: isToday ? theme.primary : theme.text, fontSize: 10.5, fontWeight: "700", marginBottom: 2 }}>
                    {day.getDate()}
                  </Text>
                  {dayEvents.slice(0, 2).map((e) => (
                    <TouchableOpacity
                      key={e.id}
                      onPress={() => onEventClick?.(e)}
                      style={{ backgroundColor: e.color.bg, borderRadius: 4, paddingHorizontal: 3, paddingVertical: 1.5, marginBottom: 1.5 }}
                    >
                      <Text numberOfLines={1} style={{ color: e.color.text, fontSize: 8, fontWeight: "700" }}>
                        {e.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {dayEvents.length > 2 && (
                    <Text style={{ color: theme.subtext, fontSize: 8 }}>+{dayEvents.length - 2} more</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
