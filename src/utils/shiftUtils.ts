export type ShiftOption = {
  key: string;
  label: string;
  start: string; // "HH:MM" 24h
  end: string;   // "HH:MM" 24h
};

export const SHIFT_OPTIONS: ShiftOption[] = [
  { key: "7_4",     label: "7:00 AM – 4:00 PM",  start: "07:00", end: "16:00" },
  { key: "730_430", label: "7:30 AM – 4:30 PM",  start: "07:30", end: "16:30" },
  { key: "8_5",     label: "8:00 AM – 5:00 PM",  start: "08:00", end: "17:00" },
];

export function findShiftOption(
  start?: string | null,
  end?: string | null,
): ShiftOption | undefined {
  if (!start || !end) return undefined;
  const norm = (t: string) => t.slice(0, 5); // "07:00:00" -> "07:00"
  return SHIFT_OPTIONS.find((o) => o.start === norm(start) && o.end === norm(end));
}

// True HH:MM validation for a custom-entered shift time (24h, "07:05",
// "16:30", etc). Used to gate the Save button in the custom shift picker
// before it's sent to PATCH /fleet/drivers/:id/shift.
export function isValidShiftTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

// Builds a display label for an arbitrary start/end pair the same way
// SHIFT_OPTIONS labels are written ("7:00 AM – 4:00 PM"), so a custom
// shift renders identically to a preset one anywhere findShiftOption()'s
// result (or a manually-built ShiftOption) is shown.
export function formatShiftLabel(start: string, end: string): string {
  const to12h = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  };
  return `${to12h(start)} – ${to12h(end)}`;
}

// A driver with no shift assigned at all — used to force the shift picker
// modal open on load rather than showing a driver silently stuck without
// any auto duty-status coverage.
export function hasNoShift(
  shiftStart?: string | null,
  shiftEnd?: string | null,
): boolean {
  return !shiftStart || !shiftEnd;
}

// Is `now` inside [start, end) today?
export function isWithinShift(
  start?: string | null,
  end?: string | null,
  now: Date = new Date(),
): boolean {
  if (!start || !end) return false;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const minutesNow = now.getHours() * 60 + now.getMinutes();
  return minutesNow >= sh * 60 + sm && minutesNow < eh * 60 + em;
}

// The driver's effective duty status: a manual "personal" override always
// wins; otherwise it's derived from the shift window, with no button press.
// 0 = Sunday, 6 = Saturday
export function isWeekend(now: Date = new Date()): boolean {
  const day = now.getDay();
  return day === 0 || day === 6;
}

export function computeAutoDutyStatus(
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined,
  manualOverride: "personal" | null,
  now: Date = new Date(),
): "active" | "off_duty" | "personal" {
  if (manualOverride === "personal") return "personal";
  if (isWeekend(now)) return "off_duty";
  return isWithinShift(shiftStart, shiftEnd, now) ? "active" : "off_duty";
}