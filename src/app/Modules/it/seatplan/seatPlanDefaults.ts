import { SeatPlanLayout } from "../../../../../types";

// Mirrors the UNIT 3 floor plan — rooms, the four 2x4 seat blocks, and the
// 10-desk Admin Room column. Used only when no saved layout exists yet.
export const DEFAULT_SEAT_PLAN_LAYOUT: SeatPlanLayout = {
  rooms: [
    { id: "r-pantry", x: 0, y: 0, w: 245, h: 145, label: "PANTRY" },
    { id: "r-water", x: 245, y: 0, w: 78, h: 145, label: "WATER" },
    { id: "r-storage", x: 323, y: 0, w: 158, h: 145, label: "STORAGE" },
    { id: "r-eerm", x: 481, y: 0, w: 92, h: 145, label: "ELEC ROOM" },
    { id: "r-server", x: 573, y: 0, w: 140, h: 145, label: "SERVER ROOM" },
    { id: "r-fireexit", x: 713, y: 0, w: 471, h: 213, label: "FIRE EXIT" },
    { id: "r-admin", x: 630, y: 280, w: 255, h: 250, label: "ADMIN ROOM" },
    { id: "r-aquarium", x: 885, y: 280, w: 190, h: 250, label: "AQUARIUM" },
    { id: "r-printers", x: 213, y: 522, w: 422, h: 32, label: "PRINTERS" },
  ],
  pods: [
    { id: "p-block-1", x: 31, y: 220, w: 405, h: 134, rows: 2, cols: 4, seats: ["", "", "", "", "", "", "", ""] },
    { id: "p-block-2", x: 331, y: 220, w: 405, h: 134, rows: 2, cols: 4, seats: ["", "", "", "", "", "", "", ""] },
    { id: "p-block-3", x: 31, y: 380, w: 405, h: 134, rows: 2, cols: 4, seats: ["", "", "", "", "", "", "", ""] },
    { id: "p-block-4", x: 331, y: 380, w: 405, h: 134, rows: 2, cols: 4, seats: ["", "", "", "", "", "", "", ""] },
    { id: "p-admin", x: 634, y: 280, w: 108, h: 574, rows: 10, cols: 1, seats: ["", "", "", "", "", "", "", "", "", ""] },
  ],
  seats: [],
  doors: [],
};

// Placeholder layout for UNIT 1 & 2 — adjust rooms/pods to match the real
// floor plan once you have the dimensions; same shape as UNIT 3's default.
export const DEFAULT_SEAT_PLAN_LAYOUT_UNIT_1_2: SeatPlanLayout = {
  rooms: [
    { id: "u12-r-pantry", x: 0, y: 0, w: 200, h: 140, label: "PANTRY" },
    { id: "u12-r-storage", x: 200, y: 0, w: 160, h: 140, label: "STORAGE" },
    { id: "u12-r-server", x: 360, y: 0, w: 140, h: 140, label: "SERVER ROOM" },
  ],
  pods: [
    { id: "u12-p-block-1", x: 31, y: 200, w: 405, h: 134, rows: 2, cols: 4, seats: ["", "", "", "", "", "", "", ""] },
    { id: "u12-p-block-2", x: 331, y: 200, w: 405, h: 134, rows: 2, cols: 4, seats: ["", "", "", "", "", "", "", ""] },
  ],
  seats: [],
  doors: [],
};

// Central registry so the toolbar dropdown and the loader stay in sync —
// add a new entry here any time you need another unit/floor.
export type SeatPlanKey = "unit3" | "unit1_2";

export const SEAT_PLAN_OPTIONS: { key: SeatPlanKey; label: string; defaultLayout: SeatPlanLayout }[] = [
  { key: "unit1_2", label: "Unit 1 & 2", defaultLayout: DEFAULT_SEAT_PLAN_LAYOUT_UNIT_1_2 },
  { key: "unit3", label: "Unit 3", defaultLayout: DEFAULT_SEAT_PLAN_LAYOUT },
];

export const DOOR_W = 36; // horizontal door (rot 0)
export const DOOR_H = 8;

export const SEAT_W = 96;
export const SEAT_H = 52;
export const CANVAS_W = 1200;
export const CANVAS_H = 580;