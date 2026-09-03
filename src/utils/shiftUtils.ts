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
export function computeAutoDutyStatus(
  shiftStart: string | null | undefined,
  shiftEnd: string | null | undefined,
  manualOverride: "personal" | null,
  now: Date = new Date(),
): "active" | "off_duty" | "personal" {
  if (manualOverride === "personal") return "personal";
  return isWithinShift(shiftStart, shiftEnd, now) ? "active" : "off_duty";
}